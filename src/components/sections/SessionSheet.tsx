"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { cn } from "@/lib/cn";
import { Button, Field, Input, Segmented, Select, Sheet, Textarea } from "@/components/ui";
import { addDays } from "@/lib/engine/habits";
import { formatTarget, lastLog, LOG_DAYS_BACK, readLog, sessionOn, type PlanCheckin, type PlanLog, type PlanSpec } from "@/lib/plan";

type StepValue = { done: boolean; sets: string; reps: string; amount: string };
const str = (n: number | undefined) => (n === undefined ? "" : String(n));
const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));

/**
 * Logging a session: tick each step with what you really did (last time's
 * numbers next to it), how long it took and how it felt. Today or up to two
 * days back.
 */
export function SessionSheet({
  open,
  spec,
  checkins,
  today,
  start,
  onClose,
  onSave,
}: {
  open: boolean;
  spec: PlanSpec | null;
  checkins: PlanCheckin[];
  today: string;
  /** Day (and session) to open on. */
  start: { day: string; sessionId?: string } | null;
  onClose: () => void;
  onSave: (entry: { day: string; log: PlanLog; note: string | null }) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const p = t.plan;
  const [day, setDay] = useState(today);
  const [sessionId, setSessionId] = useState("");
  const [values, setValues] = useState<Record<string, StepValue>>({});
  const [minutes, setMinutes] = useState("");
  const [feel, setFeel] = useState<number | undefined>();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Fill from what's already logged that day, else last time's numbers, else the plan.
  function load(nextDay: string, nextSession?: string) {
    if (!spec) return;
    const existing = checkins.find((c) => c.day === nextDay && c.status === "done");
    const own = readLog(existing?.data);
    const id = nextSession ?? own?.session ?? sessionOn(spec, nextDay)?.id ?? spec.sessions[0].id;
    const session = spec.sessions.find((s) => s.id === id) ?? spec.sessions[0];
    const from = own?.session === session.id ? own : lastLog(checkins, session.id, nextDay);
    setDay(nextDay);
    setSessionId(session.id);
    setValues(
      Object.fromEntries(
        session.steps.map((st) => {
          const prev = from?.steps.find((x) => x.id === st.id);
          return [st.id, { done: own?.session === session.id ? !!prev?.done : true, sets: str(prev?.sets ?? st.sets), reps: str(prev?.reps ?? st.reps), amount: str(prev?.amount ?? st.amount) }];
        }),
      ),
    );
    setMinutes(str(own?.minutes));
    setFeel(own?.feel);
    setNote(existing?.note ?? "");
  }

  useEffect(() => {
    if (open && start) load(start.day, start.sessionId);
  }, [open, start?.day, start?.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const session = spec?.sessions.find((s) => s.id === sessionId);
  const previous = session ? lastLog(checkins, session.id, day) : null;
  const days = Array.from({ length: LOG_DAYS_BACK + 1 }, (_, i) => addDays(today, -i));

  async function save() {
    if (!session) return;
    setSaving(true);
    const log: PlanLog = {
      session: session.id,
      steps: session.steps.map((st) => {
        const v = values[st.id];
        return { id: st.id, done: !!v?.done, sets: num(v?.sets ?? ""), reps: num(v?.reps ?? ""), amount: num(v?.amount ?? "") };
      }),
      minutes: num(minutes),
      feel,
    };
    const ok = await onSave({ day, log, note: note.trim() || null });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Sheet
      open={open && !!spec}
      onClose={onClose}
      title={session?.name}
      footer={
        <Button className="w-full" onClick={save} loading={saving}>
          {p.saveSession}
        </Button>
      }
    >
      {spec && session && (
        <div className="space-y-4">
          <Field label={p.logDay}>
            <Segmented
              value={day}
              onChange={(d) => load(d)}
              options={days.map((d, i) => ({ value: d, label: [p.todayLabel, p.yesterday, p.twoDaysAgo][i] ?? d }))}
            />
          </Field>
          {spec.sessions.length > 1 && (
            <Field label={p.whichSession}>
              <Select value={sessionId} onChange={(e) => load(day, e.target.value)} className="h-12">
                {spec.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {session.steps.length > 0 && (
            <ul className="space-y-2">
              {session.steps.map((st) => {
                const v = values[st.id] ?? { done: true, sets: "", reps: "", amount: "" };
                const set = (next: Partial<StepValue>) => setValues((all) => ({ ...all, [st.id]: { ...v, ...next } }));
                const before = previous?.steps.find((x) => x.id === st.id && x.done);
                return (
                  <li key={st.id} className={cn("glass rounded-2xl p-3", !v.done && "opacity-60")}>
                    <button type="button" aria-pressed={v.done} onClick={() => set({ done: !v.done })} className="flex w-full items-center gap-3 text-start">
                      <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2", v.done ? "border-success bg-success text-white" : "border-muted")}>
                        {v.done && <Check className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{st.name}</span>
                        <span className="block text-xs text-muted">
                          {formatTarget(st)}
                          {before && ` · ${fill(p.last, { value: formatTarget({ ...before, unit: st.unit }) })}`}
                        </span>
                      </span>
                    </button>
                    {v.done && (st.sets !== undefined || st.reps !== undefined || st.amount !== undefined) && (
                      <div className="mt-2 grid grid-cols-3 gap-1">
                        {st.sets !== undefined && <Input aria-label={`${st.name} ${p.sets}`} placeholder={p.sets} inputMode="numeric" value={v.sets} onChange={(e) => set({ sets: e.target.value })} className="h-9 text-sm" />}
                        {st.reps !== undefined && <Input aria-label={`${st.name} ${p.reps}`} placeholder={p.reps} inputMode="numeric" value={v.reps} onChange={(e) => set({ reps: e.target.value })} className="h-9 text-sm" />}
                        {st.amount !== undefined && (
                          <Input aria-label={`${st.name} ${st.unit ?? p.amount}`} placeholder={st.unit ?? p.amount} inputMode="decimal" value={v.amount} onChange={(e) => set({ amount: e.target.value })} className="h-9 text-sm" />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <Field label={p.minutes}>
            <Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))} className="h-12" />
          </Field>
          <Field label={p.feel}>
            <div className="flex justify-between">
              {p.feelings.map((emoji, i) => (
                <button
                  key={emoji}
                  type="button"
                  aria-pressed={feel === i + 1}
                  onClick={() => setFeel(feel === i + 1 ? undefined : i + 1)}
                  className={cn("grid size-12 place-items-center rounded-2xl text-2xl transition active:scale-90", feel === i + 1 ? "bg-accent-soft ring-2 ring-accent" : "bg-sunken")}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </Field>
          <Field label={p.note}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={p.notePlaceholder} maxLength={500} rows={2} />
          </Field>
        </div>
      )}
    </Sheet>
  );
}
