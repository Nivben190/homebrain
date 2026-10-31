"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button, Chip, Field, Input, Select, Sheet, Textarea, Toggle } from "@/components/ui";
import { fill } from "@/i18n";
import { addDays, diffDays } from "@/lib/engine/habits";
import { isReviewWeek, newPlanId, normalizePlan, PLAN_PRESETS, planFromPreset, setSessionDays, spreadTopics, weekStarts, type PlanSpec, type PlanStep } from "@/lib/plan";
import type { Member } from "./PropertyInput";

const WEEKS = [2, 4, 6, 8, 12, 16];
const toNum = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));

/**
 * A plan's editor. A new one starts from a preset (gym, running, study…); then
 * the goal, why, how long, the sessions on their weekdays with what each
 * includes, the reminder, the stake and whose goal it is.
 */
export function PlanSheet({
  open,
  initial,
  members,
  userId,
  today,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  /** The plan being edited; null for a new one. */
  initial: { id: string; title: string; spec: PlanSpec; ownerId: string | null } | null;
  members: Member[];
  userId: string;
  today: string;
  onClose: () => void;
  onSave: (draft: { id: string | null; title: string; spec: PlanSpec; ownerId: string | null }) => Promise<boolean>;
  onDelete?: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const [title, setTitle] = useState("");
  const [spec, setSpec] = useState<PlanSpec | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(userId);
  const [saving, setSaving] = useState(false);
  const [paste, setPaste] = useState("");
  // Leads up to a date with topics week by week (an exam); any plan can turn it on.
  const [exam, setExam] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setSpec(initial?.spec ?? null);
    setOwnerId(initial?.ownerId ?? userId);
    setExam(!!initial?.spec.deadline || !!initial?.spec.topics.length);
    setPaste("");
  }, [open, initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = t.plan;
  const patch = (next: Partial<PlanSpec>) => setSpec((s) => (s ? { ...s, ...next } : s));
  const editSession = (id: string, next: Partial<PlanSpec["sessions"][number]>) =>
    setSpec((s) => (s ? { ...s, sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...next } : x)) } : s));
  const editStep = (sessionId: string, stepId: string, next: Partial<PlanStep>) =>
    setSpec((s) =>
      s ? { ...s, sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, steps: x.steps.map((st) => (st.id === stepId ? { ...st, ...next } : st)) } : x)) } : s,
    );

  const planned = spec ? new Set(spec.sessions.flatMap((s) => s.days)).size : 0;
  const valid =
    !!spec && !!title.trim() && spec.sessions.every((s) => s.name.trim() && s.steps.every((st) => st.name.trim())) && spec.topics.every((x) => x.name.trim()) && planned > 0;

  async function save() {
    if (!spec || !valid) return;
    setSaving(true);
    const ok = await onSave({ id: initial?.id ?? null, title: title.trim(), spec: normalizePlan({ ...spec, perWeek: Math.min(spec.perWeek, 14) }), ownerId });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? p.edit : p.newGoal}
      footer={
        spec && (
          <Button className="w-full" onClick={save} disabled={!valid || saving}>
            {initial ? p.save : p.create}
          </Button>
        )
      }
    >
      {!spec ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted">{p.startFrom}</p>
          <div className="grid grid-cols-2 gap-2">
            {PLAN_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  const made = planFromPreset(preset, locale, today);
                  setTitle(made.title);
                  setSpec(made.spec);
                  setExam(!!preset.exam);
                }}
                className="glass flex flex-col items-start gap-1 rounded-2xl p-3 text-start transition active:scale-95"
              >
                <span className="text-2xl">{preset.icon}</span>
                <span className="text-sm font-bold leading-tight">{preset.title[locale]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label={p.title}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={p.titlePlaceholder} maxLength={120} />
          </Field>
          <Field label={p.why}>
            <Input value={spec.why ?? ""} onChange={(e) => patch({ why: e.target.value || undefined })} placeholder={p.whyPlaceholder} maxLength={200} />
          </Field>
          {exam ? (
            <>
              <Field label={p.deadline} hint={p.deadlineHint}>
                <Input
                  type="date"
                  min={addDays(today, 1)}
                  value={spec.deadline ?? ""}
                  onChange={(e) => {
                    const d = e.target.value;
                    if (d && diffDays(today, d) >= 1) setSpec(normalizePlan({ ...spec, deadline: d }));
                  }}
                  className="h-12"
                />
              </Field>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{p.reviewLast}</span>
                <Toggle checked={spec.reviewLast} onChange={(v) => patch({ reviewLast: v })} label={p.reviewLast} />
              </div>
            </>
          ) : (
            !initial && (
              <button type="button" onClick={() => (setExam(true), setSpec(normalizePlan({ ...spec, deadline: addDays(today, 30), reviewLast: true })))} className="text-sm font-semibold text-accent">
                📅 {p.deadline}
              </button>
            )
          )}
          {!initial && !exam && (
            <Field label={p.weeks}>
              <Select value={spec.weeks} onChange={(e) => patch({ weeks: Number(e.target.value) })} className="h-12">
                {WEEKS.map((n) => (
                  <option key={n} value={n}>
                    {p.weeksN.replace("{n}", String(n))}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted">{p.sessions}</p>
            {spec.sessions.map((s) => (
              <div key={s.id} className="glass space-y-3 rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <Input aria-label={p.sessionName} value={s.name} onChange={(e) => editSession(s.id, { name: e.target.value })} className="font-bold" maxLength={60} />
                  {spec.sessions.length > 1 && (
                    <button type="button" aria-label={p.removeSession} onClick={() => patch({ sessions: spec.sessions.filter((x) => x.id !== s.id) })} className="p-2 text-muted">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1" role="group" aria-label={p.days}>
                  {t.weekdaysShort.map((label, d) => (
                    <Chip
                      key={d}
                      active={s.days.includes(d)}
                      onClick={() => setSpec(setSessionDays(spec, s.id, s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d]))}
                    >
                      {label}
                    </Chip>
                  ))}
                </div>
                {s.steps.length > 0 && (
                  <ul className="space-y-2">
                    {s.steps.map((st) => (
                      <li key={st.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Input aria-label={p.steps} value={st.name} onChange={(e) => editStep(s.id, st.id, { name: e.target.value })} className="h-10" maxLength={80} />
                          <button type="button" aria-label={t.common.delete} onClick={() => editSession(s.id, { steps: s.steps.filter((x) => x.id !== st.id) })} className="p-1 text-muted">
                            <X className="size-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          <Input aria-label={p.sets} placeholder={p.sets} inputMode="numeric" value={st.sets ?? ""} onChange={(e) => editStep(s.id, st.id, { sets: toNum(e.target.value) })} className="h-9 text-sm" />
                          <Input aria-label={p.reps} placeholder={p.reps} inputMode="numeric" value={st.reps ?? ""} onChange={(e) => editStep(s.id, st.id, { reps: toNum(e.target.value) })} className="h-9 text-sm" />
                          <Input aria-label={p.amount} placeholder={p.amount} inputMode="decimal" value={st.amount ?? ""} onChange={(e) => editStep(s.id, st.id, { amount: toNum(e.target.value) })} className="h-9 text-sm" />
                          <Input aria-label={p.unit} placeholder={p.unit} value={st.unit ?? ""} onChange={(e) => editStep(s.id, st.id, { unit: e.target.value || undefined })} className="h-9 text-sm" maxLength={12} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => editSession(s.id, { steps: [...s.steps, { id: newPlanId(), name: "" }] })}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-accent"
                >
                  <Plus className="size-4" /> {p.steps}
                </button>
              </div>
            ))}
            {spec.sessions.length < 7 && (
              <button
                type="button"
                onClick={() => patch({ sessions: [...spec.sessions, { id: newPlanId(), name: `${p.sessionName} ${spec.sessions.length + 1}`, days: [], steps: [] }] })}
                className="inline-flex items-center gap-1 text-sm font-semibold text-accent"
              >
                <Plus className="size-4" /> {p.addSession}
              </button>
            )}
          </div>

          {exam && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-muted">{p.topics}</p>
                <p className="text-xs text-muted">{p.topicsHint}</p>
              </div>
              {weekStarts(normalizePlan(spec)).map((week, i) => {
                const topics = spec.topics.filter((x) => x.week === week);
                const review = isReviewWeek(normalizePlan(spec), week);
                return (
                  <div key={week} className="glass space-y-2 rounded-2xl p-3">
                    <p className="text-sm font-bold">
                      {fill(p.weekLabel, { n: i + 1 })} <span className="text-xs font-semibold text-muted">· {week.slice(8, 10)}/{week.slice(5, 7)}</span>
                      {review && <span className="ms-2 text-xs text-accent">{p.reviewWeekTitle}</span>}
                    </p>
                    {topics.map((topic) => (
                      <div key={topic.id} className="flex items-center gap-2">
                        <Input
                          aria-label={p.topics}
                          value={topic.name}
                          maxLength={80}
                          onChange={(e) => patch({ topics: spec.topics.map((x) => (x.id === topic.id ? { ...x, name: e.target.value } : x)) })}
                          className="h-10"
                        />
                        <Select
                          aria-label={p.weekLabel.replace("{n}", "")}
                          value={topic.week}
                          onChange={(e) => patch({ topics: spec.topics.map((x) => (x.id === topic.id ? { ...x, week: e.target.value } : x)) })}
                          className="h-10 w-20"
                        >
                          {weekStarts(normalizePlan(spec)).map((w, j) => (
                            <option key={w} value={w}>
                              {j + 1}
                            </option>
                          ))}
                        </Select>
                        <button type="button" aria-label={t.common.delete} onClick={() => patch({ topics: spec.topics.filter((x) => x.id !== topic.id) })} className="p-1 text-muted">
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => patch({ topics: [...spec.topics, { id: newPlanId(), name: "", week }] })}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-accent"
                    >
                      <Plus className="size-4" /> {p.addTopic}
                    </button>
                  </div>
                );
              })}
              <Textarea aria-label={p.pasteTopics} placeholder={p.pasteTopics} value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} />
              <Button
                size="sm"
                variant="soft"
                disabled={!paste.trim()}
                onClick={() => {
                  const next = normalizePlan(spec);
                  setSpec({ ...next, topics: [...next.topics, ...spreadTopics(next, paste.split(/\r?\n/))] });
                  setPaste("");
                }}
              >
                {p.spread}
              </Button>
            </div>
          )}

          <Field label={p.perWeek}>
            <Select value={spec.perWeek} onChange={(e) => patch({ perWeek: Number(e.target.value) })} className="h-12">
              {Array.from({ length: 7 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={p.time}>
            <Input type="time" value={spec.time} onChange={(e) => e.target.value && patch({ time: e.target.value })} className="h-12" />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{p.nudge}</span>
            <Toggle checked={spec.nudge} onChange={(v) => patch({ nudge: v })} label={p.nudge} />
          </div>
          <Field label={p.stake}>
            <Input value={spec.stake ?? ""} onChange={(e) => patch({ stake: e.target.value || undefined })} placeholder={p.stakePlaceholder} maxLength={120} />
          </Field>
          {members.length > 1 && (
            <Field label={p.who}>
              <Select value={ownerId ?? ""} onChange={(e) => setOwnerId(e.target.value || null)} className="h-12">
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.emoji} {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {initial && onDelete && (
            <Button variant="danger" className="w-full" onClick={() => onDelete(initial.id)}>
              <Trash2 className="size-4" /> {p.delete}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}
