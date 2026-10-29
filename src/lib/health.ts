// Engine heartbeat (roadmap 1.5): every tick writes engine_status, and
// /api/health turns it into 200 or 503 for an uptime monitor.

/** Ticks run every minute; three missed in a row means the engine is down. */
export const MAX_TICK_AGE_SECONDS = 180;

export interface EngineStatus {
  last_tick_at: string;
  failed_phases: string[];
}

export function tickHealth(status: EngineStatus | null, now = new Date()) {
  if (!status) return { ok: false, ageSeconds: null, failedPhases: [] as string[] };
  const ageSeconds = Math.round((now.getTime() - new Date(status.last_tick_at).getTime()) / 1000);
  // A failing phase is retried next minute, so only a silent engine is "down".
  return { ok: ageSeconds <= MAX_TICK_AGE_SECONDS, ageSeconds, failedPhases: status.failed_phases };
}
