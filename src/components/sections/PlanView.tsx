"use client";
import { useMemo, useState } from "react";
import { ArrowRightLeft, Pencil, Plus, SkipForward, Undo2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { cn } from "@/lib/cn";
import { Button, Input } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { addDays, todayKey, weekdayOf } from "@/lib/engine/habits";
import { formatTarget, LOG_DAYS_BACK, moveTargets, planProgress, readLog, readPlan, stepHistory, weekOf, type DayState, type PlanCheckin, type PlanLog, type PlanSpec } from "@/lib/plan";
import { logPlanSession, movePlanSession, reactToSession, removePlanSession, savePlan } from "@/app/plan-actions";
import { PlanSheet } from "./PlanSheet";
import { SessionSheet } from "./SessionSheet";
import { useCelebrate } from "./TrackerView";
import type { Member } from "./PropertyInput";
import type { CheckinRow, Item, Section } from "@/lib/db-types";

const REACTIONS = ["💪", "🔥", "👏", "❤️", "😂"];

const CELL: Record<DayState, string> = {
  done: "bg-success text-white",
  extra: "bg-success/70 text-white",
  skipped: "bg-sunken text-muted",
  missed: "bg-danger/15 text-danger",
  today: "ring-2 ring-accent bg-accent-soft text-accent",
  planned: "border-2 border-dashed border-muted/50 text-muted",
  rest: "text-muted/40",
  out: "opacity-0",
};
const MARK: Partial<Record<DayState, string>> = { done: "✓", extra: "✓", skipped: "–", missed: "✕" };

/** A tiny line of a step's numbers over time. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 60},${18 - ((v - min) / span) * 16}`).join(" ");
  return (
    <svg viewBox="0 0 60 20" className="h-5 w-[60px] shrink-0 text-accent" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Plans: each goal with this week's days (done, missed, moved, today), how
 * many of its weeks were kept, how each step's numbers moved, and recent
 * sessions the partner can react to. Logging opens the session sheet; a
 * planned day can move to a free day later in the week.
 */
export function PlanView({
  section,
  items,
  checkins,
  members,
  userId,
  timeZone,
  onItem,
  onCheckin,
  onCheckinGone,
  onDelete,
}: {
  section: Section;
  items: Item[];
  checkins: CheckinRow[];
  members: Member[];
  userId: string;
  timeZone: string;
  onItem: (item: Item) => void;
  onCheckin: (row: CheckinRow) => void;
  onCheckinGone: (itemId: string, day: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const p = t.plan;
  const toast = useToast();
  const { node: celebration, celebrate } = useCelebrate();
  const today = todayKey(timeZone);
  const [editing, setEditing] = useState<{ item: Item | null } | null>(null);
  const [logging, setLogging] = useState<{ item: Item; day: string; sessionId?: string } | null>(null);
  const [picked, setPicked] = useState<{ itemId: string; day: string } | null>(null);
  const plans = useMemo(
    () => items.map((item) => ({ item, spec: readPlan(item.props) })).filter((x): x is { item: Item; spec: PlanSpec } => !!x.spec),
    [items],
  );
  const name = (id: string | null | undefined) => members.find((m) => m.id === id);
  const fail = (error?: string) => toast.error(error === "invalid" ? t.failures.generic : t.sections.saveFailed);

  async function save(itemId: string, day: string, status: "done" | "skipped", log?: PlanLog, note?: string | null) {
    const res = await logPlanSession({ itemId, day, status, log, note });
    if (!res.ok) return fail(res.error), false;
    onCheckin(res.data);
    if (status === "done") celebrate();
    return true;
  }

  async function undo(itemId: string, day: string) {
    const res = await removePlanSession(itemId, day);
    if (!res.ok) return fail(res.error);
    onCheckinGone(itemId, day);
  }

  async function move(itemId: string, from: string, to: string) {
    setPicked(null);
    const res = await movePlanSession(itemId, from, to);
    if (!res.ok) return fail(res.error);
    onItem(res.data);
  }

  async function react(row: CheckinRow, emoji: string) {
    const mine = row.reactions?.[userId];
    const res = await reactToSession(row.id, mine === emoji ? "" : emoji);
    if (!res.ok) return fail(res.error);
    onCheckin({ ...row, reactions: res.data });
  }

  async function savePlanDraft(draft: { id: string | null; title: string; spec: PlanSpec; ownerId: string | null }) {
    const res = await savePlan({ ...draft, sectionId: section.id });
    if (!res.ok) return fail(res.error), false;
    onItem(res.data);
    return true;
  }

  const editingPlan = editing?.item ? plans.find((x) => x.item.id === editing.item!.id) : null;
  const loggingPlan = logging ? plans.find((x) => x.item.id === logging.item.id) : null;

  return (
    <div className="space-y-4">
      {celebration}
      {plans.length === 0 && (
        <div className="glass space-y-3 rounded-3xl px-4 py-8 text-center">
          <p className="text-sm text-muted">{p.empty}</p>
        </div>
      )}

      {plans.map(({ item, spec }) => {
        const rows = checkins.filter((c) => c.item_id === item.id) as (CheckinRow & PlanCheckin)[];
        const prog = planProgress(spec, rows, today);
        const week = prog.current;
        const owner = name(item.assignee_id ?? item.created_by);
        const todays = week.days.find((d) => d.day === today);
        const counted = prog.weeks.filter((w) => w.target > 0);
        const recent = rows.filter((c) => c.status === "done").sort((a, b) => b.day.localeCompare(a.day)).slice(0, 5);
        const steps = spec.sessions.flatMap((s) => s.steps.map((st) => ({ st, points: stepHistory(rows, st.id) }))).filter((x) => x.points.length >= 2);
        const pick = picked?.itemId === item.id ? week.days.find((d) => d.day === picked.day) : null;
        const label = (sessionName: string) => (spec.sessions.length > 1 ? sessionName : item.title);
        return (
          <section key={item.id} aria-label={item.title} className="glass space-y-4 rounded-3xl p-4">
            <header className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-extrabold">{item.title}</h2>
                <p className="text-xs font-semibold text-muted">
                  {owner && `${owner.emoji} ${owner.name} · `}
                  {prog.over ? p.over : fill(p.weekOf, { n: week.number, total: spec.weeks })}
                  {prog.streak > 1 && ` · ${fill(p.streak, { n: prog.streak })}`}
                </p>
                {spec.why && <p className="mt-1 text-sm italic text-muted">“{spec.why}”</p>}
              </div>
              <button type="button" aria-label={p.edit} onClick={() => setEditing({ item })} className="rounded-full bg-sunken p-2 text-muted">
                <Pencil className="size-4" />
              </button>
            </header>

            {spec.stake && <p className="inline-block rounded-full bg-warn/15 px-3 py-1 text-xs font-bold text-warn">🎲 {fill(p.stakeChip, { stake: spec.stake })}</p>}

            {/* This week */}
            <div>
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="font-bold">{fill(p.thisWeek, { done: week.done, target: week.target })}</span>
                {week.result && <span className={cn("text-xs font-bold", week.result === "kept" ? "text-success" : "text-danger")}>{week.result === "kept" ? p.weekKept : p.weekMissed}</span>}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-success transition-all" style={{ width: `${week.target ? Math.min(100, (week.done / week.target) * 100) : 0}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-7 gap-1 text-center">
                {week.days.map((d) => {
                  const actionable = d.state === "today" || d.state === "planned" || d.state === "missed" || d.state === "done" || d.state === "extra" || d.state === "skipped";
                  return (
                    <button
                      key={d.day}
                      type="button"
                      disabled={!actionable || d.state === "out"}
                      onClick={() => setPicked(pick?.day === d.day ? null : { itemId: item.id, day: d.day })}
                      aria-label={`${t.weekdaysShort[weekdayOf(d.day)]} ${d.session?.name ?? ""}`}
                      className="flex flex-col items-center gap-1"
                    >
                      <span className="text-[11px] font-semibold text-muted">{t.weekdaysShort[weekdayOf(d.day)]}</span>
                      <span className={cn("grid size-9 place-items-center rounded-full text-sm font-bold", CELL[d.state], pick?.day === d.day && "outline outline-2 outline-offset-2 outline-accent")}>
                        {MARK[d.state] ?? (d.session ? d.session.name.slice(0, 1) : "")}
                      </span>
                    </button>
                  );
                })}
              </div>
              {pick && (
                <div className="mt-3 space-y-2 rounded-2xl bg-sunken p-3 text-sm">
                  <p className="font-bold">
                    {t.weekdaysShort[weekdayOf(pick.day)]} · {pick.session ? label(pick.session.name) : item.title}
                  </p>
                  {pick.checkin ? (
                    <div className="flex flex-wrap gap-2">
                      {pick.checkin.status === "done" && (
                        <Button size="sm" variant="soft" onClick={() => setLogging({ item, day: pick.day })}>
                          <Pencil className="size-3.5" /> {p.edit}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => (setPicked(null), undo(item.id, pick.day))}>
                        <Undo2 className="size-3.5" /> {p.undo}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {pick.day <= today && pick.day >= addDays(today, -LOG_DAYS_BACK) && (
                          <Button size="sm" onClick={() => (setPicked(null), setLogging({ item, day: pick.day, sessionId: pick.session?.id }))}>
                            {p.start}
                          </Button>
                        )}
                        {pick.day <= today && pick.day >= addDays(today, -LOG_DAYS_BACK) && (
                          <Button size="sm" variant="ghost" onClick={() => (setPicked(null), save(item.id, pick.day, "skipped"))}>
                            <SkipForward className="size-3.5" /> {p.skip}
                          </Button>
                        )}
                      </div>
                      {pick.session && (
                        <div>
                          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted">
                            <ArrowRightLeft className="size-3.5" /> {fill(p.moveTo, { session: label(pick.session.name) })}
                          </p>
                          {moveTargets(spec, rows, pick.day, today).length ? (
                            <div className="flex flex-wrap gap-1">
                              {moveTargets(spec, rows, pick.day, today).map((to) => (
                                <Button key={to} size="sm" variant="soft" onClick={() => move(item.id, pick.day, to)}>
                                  {t.weekdaysShort[weekdayOf(to)]}
                                </Button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted">{p.noMove}</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {!prog.over && (
              <Button className="w-full" variant={todays?.state === "today" ? "primary" : "soft"} onClick={() => setLogging({ item, day: today, sessionId: todays?.session?.id })}>
                {todays?.state === "today" && todays.session ? `${fill(p.today, { session: label(todays.session.name) })} · ${p.start}` : todays?.state === "done" ? p.logged : p.logExtra}
              </Button>
            )}

            {/* Weeks */}
            <div>
              <div className="flex gap-1" aria-hidden>
                {prog.weeks.map((w) => (
                  <span
                    key={w.week}
                    className={cn(
                      "h-2 flex-1 rounded-full",
                      w.target === 0 ? "bg-sunken/50" : w.result === "kept" ? "bg-success" : w.result === "missed" ? "bg-danger/60" : w.week === week.week ? "bg-accent/50" : "bg-sunken",
                    )}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                {fill(p.weeksKept, { kept: prog.kept, total: counted.length })} · {fill(p.sessionsDone, { n: prog.sessions })}
              </p>
            </div>

            {prog.over && (
              <div className="space-y-2 rounded-2xl bg-sunken p-3">
                <p className="font-extrabold">{prog.result === "kept" ? p.resultKept : p.resultBroken}</p>
                <LessonBox
                  value={spec.lesson ?? ""}
                  placeholder={p.lessonPlaceholder}
                  label={p.lesson}
                  onSave={(lesson) => savePlanDraft({ id: item.id, title: item.title, spec: { ...spec, lesson: lesson || undefined }, ownerId: item.assignee_id })}
                />
                <Button
                  size="sm"
                  variant="soft"
                  onClick={() => {
                    // The same plan again from this week, with a clean slate.
                    void savePlanDraft({
                      id: null,
                      title: item.title,
                      spec: { ...spec, start: weekOf(today), from: today, moves: [], reviewed: {}, result: undefined, lesson: undefined },
                      ownerId: item.assignee_id,
                    });
                  }}
                >
                  <Plus className="size-3.5" /> {fill(p.again, { n: spec.weeks })}
                </Button>
              </div>
            )}

            {/* Numbers over time */}
            {steps.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-muted">{p.progress}</h3>
                <ul className="space-y-1">
                  {steps.map(({ st, points }) => {
                    const first = points[0];
                    const last = points[points.length - 1];
                    const key = st.amount !== undefined ? "amount" : "reps";
                    const delta = (last[key] ?? 0) - (first[key] ?? 0);
                    return (
                      <li key={st.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate font-semibold">{st.name}</span>
                        <span className="flex shrink-0 items-center gap-2 tabular-nums text-muted">
                          <Spark values={points.map((x) => x[key] ?? 0)} />
                          {formatTarget({ [key]: first[key], unit: key === "amount" ? st.unit : undefined })} → {formatTarget({ [key]: last[key], unit: key === "amount" ? st.unit : undefined })}
                          {delta !== 0 && <span className={cn("font-bold", delta > 0 ? "text-success" : "text-danger")}>{delta > 0 ? `+${delta}` : delta}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Recent sessions, with reactions */}
            <div>
              <h3 className="mb-2 text-sm font-bold text-muted">{p.recent}</h3>
              {recent.length === 0 ? (
                <p className="text-xs text-muted">{p.nothingYet}</p>
              ) : (
                <ul className="space-y-2">
                  {recent.map((row) => {
                    const log = readLog(row.data);
                    const session = spec.sessions.find((s) => s.id === log?.session);
                    const who = name(row.user_id);
                    const reactions = Object.entries(row.reactions ?? {});
                    const mine = row.user_id === userId;
                    return (
                      <li key={row.id} className="rounded-2xl bg-sunken/60 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-semibold">
                            {who?.emoji} {session ? label(session.name) : item.title}
                          </span>
                          <span className="shrink-0 text-xs text-muted">
                            {new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(`${row.day}T12:00:00Z`))}
                            {log?.minutes ? ` · ${fill(p.minutesShort, { n: log.minutes })}` : ""}
                            {log?.feel ? ` ${p.feelings[log.feel - 1]}` : ""}
                          </span>
                        </div>
                        {row.note && <p className="mt-1 text-xs text-muted">{row.note}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          {reactions.map(([uid, emoji]) => (
                            <span key={uid} className="rounded-full bg-card-solid px-2 py-0.5 text-xs" title={name(uid)?.name}>
                              {emoji} {name(uid)?.emoji}
                            </span>
                          ))}
                          {!mine &&
                            REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                aria-pressed={row.reactions?.[userId] === emoji}
                                onClick={() => react(row, emoji)}
                                className={cn("rounded-full px-1.5 py-0.5 text-base transition active:scale-90", row.reactions?.[userId] === emoji ? "bg-accent-soft" : "opacity-60")}
                              >
                                {emoji}
                              </button>
                            ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        );
      })}

      <Button className="w-full" variant="soft" onClick={() => setEditing({ item: null })}>
        <Plus className="size-4" /> {p.newGoal}
      </Button>

      <PlanSheet
        open={!!editing}
        initial={editingPlan ? { id: editingPlan.item.id, title: editingPlan.item.title, spec: editingPlan.spec, ownerId: editingPlan.item.assignee_id } : null}
        members={members}
        userId={userId}
        today={today}
        onClose={() => setEditing(null)}
        onSave={savePlanDraft}
        onDelete={(id) => {
          setEditing(null);
          onDelete(id);
        }}
      />
      <SessionSheet
        open={!!logging}
        spec={loggingPlan?.spec ?? null}
        checkins={logging ? (checkins.filter((c) => c.item_id === logging.item.id) as PlanCheckin[]) : []}
        today={today}
        start={logging ? { day: logging.day, sessionId: logging.sessionId } : null}
        onClose={() => setLogging(null)}
        onSave={({ day, log, note }) => save(logging!.item.id, day, "done", log, note)}
      />
    </div>
  );
}

function LessonBox({ value, label, placeholder, onSave }: { value: string; label: string; placeholder: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <Input
      aria-label={label}
      value={text}
      placeholder={placeholder}
      maxLength={300}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== value && onSave(text.trim())}
    />
  );
}
