// "Spin the wheel" spaces: every item is one saved wheel (its title is the
// wheel's name) and keeps its options in props._wheel.

export const WHEEL_PROP = "_wheel";

export interface WheelOption {
  label: string;
  /** Optional tag shown under the label (e.g. "Italian", "30 min", "Naomi's pick"). */
  tag?: string;
  /** Recently picked "we did it" day; the spin skips it for a while. */
  doneDay?: string;
}

export interface WheelSpec {
  options: WheelOption[];
  /** Last winner, shown under the wheel. */
  last?: string;
}

export function readWheel(props: Record<string, unknown>): WheelSpec {
  const raw = props[WHEEL_PROP] as Partial<WheelSpec> | undefined;
  const options = Array.isArray(raw?.options) ? raw.options.filter((o): o is WheelOption => !!o && typeof o.label === "string" && o.label.trim() !== "") : [];
  return { options, last: typeof raw?.last === "string" ? raw.last : undefined };
}

export const wheelProps = (props: Record<string, unknown>, spec: WheelSpec) => ({ ...props, [WHEEL_PROP]: spec });

/** Days an option marked "we did it" sits out. */
export const REST_DAYS = 21;

/** Options that can win today: everything not done within REST_DAYS (or all, if that leaves none). */
export function spinnable(options: WheelOption[], today: string): number[] {
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;
  const fresh = options.map((o, i) => (o.doneDay && day(today) - day(o.doneDay) < REST_DAYS ? -1 : i)).filter((i) => i >= 0);
  return fresh.length ? fresh : options.map((_, i) => i);
}

/** Picks the winner index; `random` in [0, 1). */
export function pickWinner(options: WheelOption[], today: string, random = Math.random()): number {
  const pool = spinnable(options, today);
  return pool[Math.floor(random * pool.length)] ?? -1;
}

/**
 * Final wheel rotation (degrees, clockwise) that lands `winner` under the
 * pointer at the top, after a few full turns past `from`.
 */
export function landingRotation(from: number, winner: number, count: number, turns = 5, jitter = 0.5): number {
  const slice = 360 / count;
  // Slice i spans [i*slice, (i+1)*slice) clockwise from the top; rotate so its middle (± jitter) is at 0°.
  const target = 360 - (winner * slice + slice * (0.5 + (jitter - 0.5) * 0.7));
  const base = from - (from % 360);
  return base + turns * 360 + ((target % 360) + 360) % 360;
}
