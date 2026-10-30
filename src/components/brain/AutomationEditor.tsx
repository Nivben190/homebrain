"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronLeft, ChevronUp, Play, Plus, Trash2, X } from "lucide-react";
import { deleteAutomation, runAutomationNow, saveAutomation } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { Button, Card, Chip, EmojiPicker, Field, Input, Segmented, Select, Sheet, Textarea, Toggle } from "@/components/ui";
import { ACTION_META, CONDITION_META, EVENT_ICONS } from "@/lib/registry/automation";
import { EVENT_TYPES, type Action, type AutomationDef, type Condition, type Trigger } from "@/lib/engine/types";
import type { Member } from "@/components/sections/PropertyInput";

type SectionRef = { id: string; title: string; icon: string };

export function AutomationEditor({
  id,
  initial,
  initialTarget,
  userId,
  members,
  sections,
}: {
  id: string | null;
  initial: AutomationDef;
  initialTarget: string;
  userId: string;
  members: Member[];
  sections: SectionRef[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [def, setDef] = useState<AutomationDef>(initial);
  const [target, setTarget] = useState(initialTarget);
  const [iconSheet, setIconSheet] = useState(false);
  const [actionSheet, setActionSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();

  const setTrigger = (trigger: Trigger) => setDef((d) => ({ ...d, trigger }));
  const setAction = (i: number, a: Action) => setDef((d) => ({ ...d, actions: d.actions.map((x, j) => (j === i ? a : x)) }));
  const moveAction = (i: number, dir: -1 | 1) =>
    setDef((d) => {
      const next = [...d.actions];
      const j = i + dir;
      if (j < 0 || j >= next.length) return d;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, actions: next };
    });
  const setCondition = (i: number, c: Condition) => setDef((d) => ({ ...d, conditions: d.conditions.map((x, j) => (j === i ? c : x)) }));

  function save() {
    setError(null);
    startSave(async () => {
      const res = await saveAutomation(id, def, target);
      if (!res.ok) return setError(res.error);
      router.push("/brain");
      router.refresh();
    });
  }

  function test() {
    if (!id) return;
    startTest(async () => {
      const saved = await saveAutomation(id, def, target);
      if (!saved.ok) return setError(saved.error);
      const res = await runAutomationNow(id);
      setToast(res.ok ? t.brain.tested : res.error);
      setTimeout(() => setToast(null), 3000);
    });
  }

  return (
    <div className="safe-top pb-24">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/brain" className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ChevronLeft className="size-4 rtl:rotate-180" /> {t.brain.title}
        </Link>
        <Toggle checked={def.enabled} onChange={(enabled) => setDef({ ...def, enabled })} />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => setIconSheet(true)} className="flex size-16 shrink-0 items-center justify-center rounded-[1.4rem] bg-accent-soft text-3xl transition active:scale-90">
          {def.icon}
        </button>
        <Input value={def.name} onChange={(e) => setDef({ ...def, name: e.target.value })} placeholder={t.brain.name} className="h-14 text-xl font-bold" />
      </div>

      {members.length > 1 && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm font-semibold text-muted">{t.brain.target}</span>
          {members.map((m) => (
            <Chip key={m.id} active={target === m.id} onClick={() => setTarget(m.id)}>
              {m.emoji} {m.id === userId ? t.common.me : m.name}
            </Chip>
          ))}
        </div>
      )}

      {/* WHEN */}
      <Step n={1} title={t.brain.when} color="from-[#ff9f1c] to-[#ff5f9e]">
        <Segmented
          value={def.trigger.type}
          onChange={(type) => setTrigger(type === "schedule" ? { type, days: [0, 1, 2, 3, 4], times: ["09:00"] } : { type, event: "wake", delayMinutes: 0 })}
          options={[
            { value: "schedule", label: `🗓️ ${t.brain.schedule}` },
            { value: "event", label: `⚡ ${t.brain.event}` },
          ]}
        />
        {def.trigger.type === "schedule" ? (
          <ScheduleFields trigger={def.trigger} onChange={setTrigger} />
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {EVENT_TYPES.filter((e) => e !== "custom").map((e) => (
                <button
                  key={e}
                  onClick={() => def.trigger.type === "event" && setTrigger({ ...def.trigger, event: e })}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl px-3 py-3 text-start text-sm font-semibold transition",
                    def.trigger.type === "event" && def.trigger.event === e ? "bg-accent text-accent-fg" : "bg-sunken",
                  )}
                >
                  <span className="text-lg">{EVENT_ICONS[e]}</span> {t.events[e]}
                </button>
              ))}
            </div>
            <Field label={t.brain.delay}>
              <Stepper value={def.trigger.delayMinutes} step={5} onChange={(delayMinutes) => def.trigger.type === "event" && setTrigger({ ...def.trigger, delayMinutes })} suffix={t.common.minutes} />
            </Field>
          </div>
        )}
      </Step>

      {/* ONLY IF */}
      <Step n={2} title={t.brain.onlyIf} color="from-[#2f8cff] to-[#7457ff]">
        <div className="space-y-2">
          {def.conditions.map((c, i) => (
            <div key={i} className="rounded-2xl bg-sunken p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {CONDITION_META[c.type].icon} {t.conditions[c.type]}
                </span>
                <button aria-label={t.common.delete} onClick={() => setDef({ ...def, conditions: def.conditions.filter((_, j) => j !== i) })} className="text-faint">
                  <X className="size-5" />
                </button>
              </div>
              {c.type === "time_window" && (
                <div className="mt-2 flex items-center gap-2">
                  <Input type="time" value={c.from} onChange={(e) => setCondition(i, { ...c, from: e.target.value })} className="h-11" />
                  <span className="text-muted">–</span>
                  <Input type="time" value={c.to} onChange={(e) => setCondition(i, { ...c, to: e.target.value })} className="h-11" />
                </div>
              )}
              {c.type === "days" && (
                <div className="mt-2">
                  <DayPicker days={c.days} onChange={(days) => setCondition(i, { ...c, days })} />
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CONDITION_META) as Condition["type"][])
              .filter((k) => !def.conditions.some((c) => c.type === k))
              .map((k) => (
                <Chip key={k} onClick={() => setDef({ ...def, conditions: [...def.conditions, CONDITION_META[k].make()] })}>
                  <Plus className="size-3.5" /> {CONDITION_META[k].icon} {t.conditions[k]}
                </Chip>
              ))}
          </div>
        </div>
      </Step>

      {/* THEN */}
      <Step n={3} title={t.brain.then} color="from-[#16b884] to-[#2f8cff]">
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {def.actions.map((a, i) => (
              <motion.div key={`${i}-${a.type}`} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="rounded-2xl bg-sunken p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-bold">
                    {ACTION_META[a.type].icon} {t.actions[a.type]}
                  </span>
                  <span className="flex items-center gap-1 text-faint">
                    <button aria-label={t.common.moveUp} onClick={() => moveAction(i, -1)} disabled={i === 0} className="p-1 disabled:opacity-30">
                      <ChevronUp className="size-5" />
                    </button>
                    <button aria-label={t.common.moveDown} onClick={() => moveAction(i, 1)} disabled={i === def.actions.length - 1} className="p-1 disabled:opacity-30">
                      <ChevronDown className="size-5" />
                    </button>
                    <button aria-label={t.common.delete} onClick={() => setDef({ ...def, actions: def.actions.filter((_, j) => j !== i) })} className="p-1">
                      <X className="size-5" />
                    </button>
                  </span>
                </div>
                <ActionFields action={a} onChange={(next) => setAction(i, next)} sections={sections} />
              </motion.div>
            ))}
          </AnimatePresence>
          <Button variant="soft" className="w-full" onClick={() => setActionSheet(true)}>
            <Plus className="size-4" /> {t.brain.addAction}
          </Button>
          <p className="px-1 text-xs text-faint">{t.brain.templateHint}</p>
        </div>
      </Step>

      {error && <p className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="mt-6 flex gap-2">
        <Button size="lg" className="flex-1" onClick={save} loading={saving}>
          {t.common.save}
        </Button>
        {id && (
          <>
            <Button size="lg" variant="soft" onClick={test} loading={testing} aria-label={t.brain.test}>
              <Play className="size-5" /> {t.brain.test}
            </Button>
            <Button
              size="lg"
              variant="danger"
              aria-label={t.common.delete}
              onClick={() => {
                if (confirm(t.brain.deleteConfirm)) startSave(() => deleteAutomation(id));
              }}
            >
              <Trash2 className="size-5" />
            </Button>
          </>
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="fixed inset-x-4 bottom-28 z-50 mx-auto max-w-sm rounded-2xl bg-fg px-4 py-3 text-center font-semibold text-bg shadow-xl">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={iconSheet} onClose={() => setIconSheet(false)} title={t.sections.icon}>
        <div className="pb-4">
          <EmojiPicker
            value={def.icon}
            onChange={(icon) => {
              setDef({ ...def, icon });
              setIconSheet(false);
            }}
          />
        </div>
      </Sheet>

      <Sheet open={actionSheet} onClose={() => setActionSheet(false)} title={t.brain.addAction}>
        <div className="grid grid-cols-2 gap-2 pb-4">
          {(Object.keys(ACTION_META) as Action["type"][]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setDef({ ...def, actions: [...def.actions, ACTION_META[k].make()] });
                setActionSheet(false);
              }}
              className="flex items-center gap-2 rounded-2xl bg-sunken px-3 py-4 text-start font-semibold transition active:scale-95"
            >
              <span className="text-2xl">{ACTION_META[k].icon}</span> {t.actions[k]}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function Step({ n, title, color, children }: { n: number; title: string; color: string; children: React.ReactNode }) {
  return (
    <Card className="mt-5">
      <div className="mb-3 flex items-center gap-2">
        <span className={cn("flex size-7 items-center justify-center rounded-full bg-linear-to-br text-sm font-extrabold text-white", color)}>{n}</span>
        <h2 className="text-lg font-extrabold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function DayPicker({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex justify-between gap-1">
      {t.weekdaysShort.map((label, d) => (
        <Chip key={d} active={days.includes(d)} className="h-10 flex-1 px-0" onClick={() => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort())}>
          {label}
        </Chip>
      ))}
    </div>
  );
}

function ScheduleFields({ trigger, onChange }: { trigger: Extract<Trigger, { type: "schedule" }>; onChange: (t: Trigger) => void }) {
  const { t } = useI18n();
  return (
    <div className="mt-4 space-y-4">
      <Field label={t.brain.days}>
        <DayPicker days={trigger.days} onChange={(days) => onChange({ ...trigger, days })} />
      </Field>
      <Field label={t.brain.times}>
        <div className="flex flex-wrap items-center gap-2">
          {trigger.times.map((time, i) => (
            <div key={i} className="flex items-center rounded-2xl bg-card-solid pe-1">
              <input
                type="time"
                value={time}
                onChange={(e) => onChange({ ...trigger, times: trigger.times.map((x, j) => (j === i ? e.target.value : x)) })}
                className="h-11 bg-transparent px-3 font-bold outline-none"
              />
              {trigger.times.length > 1 && (
                <button aria-label={t.common.remove} onClick={() => onChange({ ...trigger, times: trigger.times.filter((_, j) => j !== i) })} className="p-1 text-faint">
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
          <Chip onClick={() => onChange({ ...trigger, times: [...trigger.times, "12:00"] })}>
            <Plus className="size-3.5" /> {t.brain.addTime}
          </Chip>
        </div>
      </Field>
    </div>
  );
}

function Stepper({ value, step, onChange, suffix }: { value: number; step: number; onChange: (v: number) => void; suffix: string }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(Math.max(0, value - step))} className="flex size-11 items-center justify-center rounded-2xl bg-card-solid text-xl font-bold">
        −
      </button>
      <span className="min-w-20 text-center text-xl font-extrabold">
        {value} <span className="text-sm font-semibold text-muted">{suffix}</span>
      </span>
      <button onClick={() => onChange(value + step)} className="flex size-11 items-center justify-center rounded-2xl bg-card-solid text-xl font-bold">
        +
      </button>
    </div>
  );
}

/** Text field with one-tap template tokens and "random line from a space". */
function TemplateField({ label, value, onChange, sections, multiline }: { label: string; value: string; onChange: (v: string) => void; sections: SectionRef[]; multiline?: boolean }) {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const insert = (token: string) => {
    const el = ref.current;
    const at = el?.selectionStart ?? value.length;
    onChange(value.slice(0, at) + token + value.slice(at));
  };
  return (
    <Field label={label}>
      {multiline ? <Textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="min-h-0" /> : <Input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} />}
      <span className="no-scrollbar mt-1.5 flex gap-1.5 overflow-x-auto">
        {[
          ["{{partner}}", `👤 ${t.common.partner}`],
          ["{{me}}", `🙂 ${t.common.me}`],
          ["{{time}}", "🕐"],
        ].map(([token, l]) => (
          <button key={token} type="button" onClick={() => insert(token)} className="shrink-0 rounded-lg bg-card-solid px-2 py-1 text-xs font-semibold text-muted">
            {l}
          </button>
        ))}
        {sections.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && insert(`{{random:${e.target.value}}}`)}
            className="shrink-0 rounded-lg bg-card-solid px-2 py-1 text-xs font-semibold text-muted"
            style={{ fontSize: 12 }}
          >
            <option value="">🎲 {t.brain.insertRandom}</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.title}
              </option>
            ))}
          </select>
        )}
      </span>
      <TemplatePreview value={value} sections={sections} />
    </Field>
  );
}

/** Replaces {{random:<uuid>}} with a readable chip so the user sees which space it uses. */
function TemplatePreview({ value, sections }: { value: string; sections: SectionRef[] }) {
  const matches = [...value.matchAll(/\{\{random:([a-f0-9-]+)\}\}/g)];
  if (!matches.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {matches.map((m, i) => {
        const s = sections.find((x) => x.id === m[1]);
        return (
          <span key={i} className="rounded-lg bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
            🎲 {s ? `${s.icon} ${s.title}` : "?"}
          </span>
        );
      })}
    </span>
  );
}

function RecipientPicker({ value, onChange, kind }: { value: string; onChange: (v: string) => void; kind: "phone" | "email" }) {
  const { t } = useI18n();
  const custom = value !== "me" && value !== "partner";
  return (
    <Field label={t.actions.to}>
      <div className="flex flex-wrap gap-2">
        <Chip active={value === "partner"} onClick={() => onChange("partner")}>
          👤 {t.common.partner}
        </Chip>
        <Chip active={value === "me"} onClick={() => onChange("me")}>
          🙂 {t.common.me}
        </Chip>
        <Chip active={custom} onClick={() => !custom && onChange("")}>
          ✏️
        </Chip>
      </div>
      {custom && <Input className="mt-2" type={kind === "email" ? "email" : "tel"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={kind === "email" ? "name@example.com" : "050-000-0000"} />}
    </Field>
  );
}

function SectionSelect({ value, onChange, sections }: { value: string; onChange: (v: string) => void; sections: SectionRef[] }) {
  const { t } = useI18n();
  return (
    <Field label={t.actions.section}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.icon} {s.title}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function ActionFields({ action: a, onChange, sections }: { action: Action; onChange: (a: Action) => void; sections: SectionRef[] }) {
  const { t } = useI18n();
  switch (a.type) {
    case "push":
      return (
        <div className="space-y-3">
          <TemplateField label={t.actions.title} value={a.title} onChange={(title) => onChange({ ...a, title })} sections={sections} />
          <TemplateField label={t.actions.body} value={a.body} onChange={(body) => onChange({ ...a, body })} sections={sections} multiline />
        </div>
      );
    case "whatsapp":
    case "sms":
      return (
        <div className="space-y-3">
          <RecipientPicker kind="phone" value={a.to} onChange={(to) => onChange({ ...a, to })} />
          <TemplateField label={t.actions.text} value={a.text} onChange={(text) => onChange({ ...a, text })} sections={sections} multiline />
        </div>
      );
    case "email":
      return (
        <div className="space-y-3">
          <RecipientPicker kind="email" value={a.to} onChange={(to) => onChange({ ...a, to })} />
          <TemplateField label={t.actions.subject} value={a.subject} onChange={(subject) => onChange({ ...a, subject })} sections={sections} />
          <TemplateField label={t.actions.body} value={a.body} onChange={(body) => onChange({ ...a, body })} sections={sections} multiline />
        </div>
      );
    case "alarm":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.actions.time}>
            <Input type="time" value={a.time} onChange={(e) => onChange({ ...a, time: e.target.value })} />
          </Field>
          <Field label={t.alarm.name}>
            <Input value={a.label ?? ""} placeholder={t.alarm.namePlaceholder} onChange={(e) => onChange({ ...a, label: e.target.value || undefined })} />
          </Field>
        </div>
      );
    case "calendar":
      return (
        <div className="space-y-3">
          <TemplateField label={t.actions.title} value={a.title} onChange={(title) => onChange({ ...a, title })} sections={sections} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.actions.startIn}>
              <Input type="number" inputMode="numeric" value={a.startInMinutes} onChange={(e) => onChange({ ...a, startInMinutes: Number(e.target.value) || 0 })} />
            </Field>
            <Field label={t.actions.duration}>
              <Input type="number" inputMode="numeric" value={a.durationMinutes} onChange={(e) => onChange({ ...a, durationMinutes: Math.max(5, Number(e.target.value) || 30) })} />
            </Field>
          </div>
        </div>
      );
    case "open_section":
      return (
        <div className="space-y-3">
          <SectionSelect value={a.sectionId} onChange={(sectionId) => onChange({ ...a, sectionId })} sections={sections} />
          <Field label={t.actions.label}>
            <Input value={a.label ?? ""} onChange={(e) => onChange({ ...a, label: e.target.value || undefined })} />
          </Field>
        </div>
      );
    case "create_item":
      return (
        <div className="space-y-3">
          <SectionSelect value={a.sectionId} onChange={(sectionId) => onChange({ ...a, sectionId })} sections={sections} />
          <TemplateField label={t.actions.title} value={a.title} onChange={(title) => onChange({ ...a, title })} sections={sections} />
        </div>
      );
    case "checkoff":
      return (
        <Field label={t.actions.label}>
          <Input value={a.label} onChange={(e) => onChange({ ...a, label: e.target.value })} />
        </Field>
      );
  }
}
