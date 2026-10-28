// The engine tick runs in independent phases, so one failing step (say, a
// claim RPC that gets a 500) can't cancel the rest of that minute's work.

export interface PhaseResult {
  phase: string;
  ok: boolean;
  error?: string;
}

/** A thrown Error, or a Supabase error object, as one readable line. */
function errorText(e: unknown) {
  if (e instanceof Error) return String(e);
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") return (e as { message: string }).message;
  return String(e);
}

/** Runs every phase in order; a phase that throws is recorded and skipped. */
export async function runPhases<T>(list: [name: string, run: () => Promise<T[]>][]) {
  const outcomes: T[] = [];
  const phases: PhaseResult[] = [];
  for (const [phase, run] of list) {
    try {
      outcomes.push(...(await run()));
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
