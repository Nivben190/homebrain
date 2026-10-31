// The engine tick runs in independent phases, so one failing step (say, a
// claim RPC that gets a 500) can't cancel the rest of that minute's work.

export interface PhaseResult {
  phase: string;
  ok: boolean;
  error?: string;
  /** Not started: the minute's budget ran out first. The next tick picks it up. */
  deferred?: boolean;
}

export interface PhaseLimits {
  /** Most one phase may take before it's reported as timed out and the next one starts. */
  phaseMs: number;
  /** No phase starts after this much of the run; the function's own limit is 60s. */
  budgetMs: number;
  clock?: () => number;
}

export const TICK_LIMITS: PhaseLimits = { phaseMs: 25_000, budgetMs: 45_000 };

/** The work keeps going in the background; the tick just stops waiting for it. */
function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** A thrown Error, or a Supabase error object, as one readable line. */
function errorText(e: unknown) {
  if (e instanceof Error) return String(e);
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") return (e as { message: string }).message;
  return String(e);
}

/**
 * Runs every phase in order; a phase that throws or runs past its limit is
 * recorded and skipped. Phases that would start past the budget are deferred.
 */
export async function runPhases<T>(list: [name: string, run: () => Promise<T[]>][], limits: PhaseLimits = TICK_LIMITS) {
  const clock = limits.clock ?? Date.now;
  const start = clock();
  const outcomes: T[] = [];
  const phases: PhaseResult[] = [];
  for (const [phase, run] of list) {
    const left = limits.budgetMs - (clock() - start);
    if (left < 1000) {
      phases.push({ phase, ok: true, deferred: true });
      continue;
    }
    try {
      outcomes.push(...(await within(run(), Math.min(limits.phaseMs, left))));
      phases.push({ phase, ok: true });
    } catch (e) {
      console.error(`[engine] phase ${phase} failed`, e);
      phases.push({ phase, ok: false, error: errorText(e) });
    }
  }
  return { outcomes, phases };
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Calls a claim RPC, retrying once after a short pause. Claims only lease
 * rows, so a retry can't fire anything twice.
 */
export async function claimWithRetry<R>(claim: () => PromiseLike<{ data: R[] | null; error: unknown }>, wait: (ms: number) => Promise<void> = pause): Promise<R[]> {
  let { data, error } = await claim();
  if (error) {
    await wait(1500);
    ({ data, error } = await claim());
  }
  if (error) throw error;
  return data ?? [];
}
