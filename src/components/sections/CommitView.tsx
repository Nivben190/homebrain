"use client";
import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { RotateCcw } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { cn } from "@/lib/cn";
import { commitProps, parseCommit, PERIODS, readCommit, spent, status, summarize, type CommitSpec, type Period } from "@/lib/commit";
import { Button, Input } from "@/components/ui";
import { RemoveBadge, SwipeRow } from "./SwipeRow";
import type { Item } from "@/lib/db-types";

function relative(locale: string, iso: string) {
  const mins = Math.round((Date.parse(iso) - Date.now()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  if (Math.abs(mins) < 48 * 60) return rtf.format(Math.round(mins / 60), "hour");
  return rtf.format(Math.round(mins / 1440), "day");
}

const amount = (n: number, unit?: string) => (unit === "$" ? `$${n}` : unit ? `${n} ${unit}` : String(n));

/**
 * Commitments: a scoreboard (kept rate, streak, by length), what's going on now
 * with progress against any limit, and what's done with its result and lesson.
 */
export function CommitView({
  items,
  onUpdate,
  onDelete,
  onAdd,
}: {
  items: Item[];
  onUpdate: (id: string, patch: Partial<Item>) => void;
  onDelete: (id: string) => void;
  onAdd: (text: string, period: Period, limit?: number) => void;
}) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const all = items.map((item) => ({ item, spec: readCommit(item.props) })).filter((x): x is { item: Item; spec: CommitSpec } => !!x.spec);
  const now = new Date();
  const sum = summarize(all.map((x) => x.spec), now);
  const active = all.filter((x) => ["active", "ask"].includes(status(x.spec, now)) || (status(x.spec, now) === "broken" && !x.spec.result && Date.parse(x.spec.end) > now.getTime()));
  const past = all.filter((x) => !active.includes(x)).sort((a, b) => b.spec.end.localeCompare(a.spec.end));
  const lessons = past.filter((x) => x.spec.lesson).slice(0, 5);

  const save = (item: Item, spec: CommitSpec) => onUpdate(item.id, { props: commitProps(item.props, spec), ...(spec.result ? { remind_at: null, done: true } : {}) });

  if (!all.length)
    return (
      <div className="space-y-5">
        <NewCommit onAdd={onAdd} />
        <p className="glass rounded-3xl px-4 py-10 text-center text-muted">{t.commit.empty}</p>
      </div>
    );

  return (
    <div className="space-y-5">
      <NewCommit onAdd={onAdd} />
      {/* Scoreboard */}
      <div className="glass grid grid-cols-3 gap-2 rounded-3xl p-4 text-center">
        <div>
          <p className={cn("text-[30px] font-extrabold leading-none tabular-nums", sum.rate === null ? "text-muted" : sum.rate >= 70 ? "text-success" : sum.rate >= 40 ? "text-warn" : "text-danger")}>
            {sum.rate === null ? "—" : `${sum.rate}%`}
          </p>
          <p className="mt-1 text-xs font-semibold text-muted">{t.commit.keptRate}</p>
        </div>
        <div>
          <p className="text-[30px] font-extrabold leading-none tabular-nums">🔥{sum.streak}</p>
          <p className="mt-1 text-xs font-semibold text-muted">{t.commit.streak}</p>
        </div>
        <div>
          <p className="text-[30px] font-extrabold leading-none tabular-nums">{sum.active}</p>
          <p className="mt-1 text-xs font-semibold text-muted">{t.commit.active}</p>
        </div>
        <div className="col-span-3 mt-2 space-y-1.5">
          {PERIODS.filter((p) => sum.byPeriod[p].kept + sum.byPeriod[p].broken > 0).map((p) => {
            const { kept, broken } = sum.byPeriod[p];
            return (
              <div key={p} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 text-start font-semibold text-muted">{t.commit.periods[p]}</span>
                <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
                  <div className="bg-success" style={{ width: `${(kept / (kept + broken)) * 100}%` }} />
                  <div className="bg-danger" style={{ width: `${(broken / (kept + broken)) * 100}%` }} />
                </div>
                <span className="w-12 shrink-0 tabular-nums text-muted">
                  {kept}/{kept + broken}
                </span>
              </div>
            );
          })}
          {sum.kept + sum.broken === 0 && <p className="text-xs text-faint">{t.commit.nothingYet}</p>}
        </div>
      </div>

      {active.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-muted">{t.commit.active}</h2>
            <button onClick={() => setEditing((e) => !e)} className="text-xs font-semibold text-muted">
              {editing ? t.common.done : t.common.edit}
            </button>
          </div>
          {active.map(({ item, spec }) => (
            <Row key={item.id} editing={editing} onDelete={() => onDelete(item.id)}>
              <ActiveCard item={item} spec={spec} locale={locale} onSave={(s) => save(item, s)} />
            </Row>
          ))}
        </section>
      )}

      {lessons.length > 0 && (
        <section className="glass space-y-1.5 rounded-3xl p-4">
          <h2 className="text-sm font-bold text-muted">💡 {t.commit.lessons}</h2>
          {lessons.map(({ item, spec }) => (
            <p key={item.id} className="text-sm">
              <span className="font-semibold">{item.title}:</span> {spec.lesson}
            </p>
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-bold text-muted">{t.commit.past}</h2>
          {past.map(({ item, spec }) => (
            <Row key={item.id} editing={editing} onDelete={() => onDelete(item.id)}>
              <PastCard item={item} spec={spec} onSave={(s) => save(item, s)} onAgain={() => onAdd(item.title, spec.period)} />
            </Row>
          ))}
        </section>
      )}
    </div>
  );
}

/** New commitment: what, for how long, and optionally a ₪ amount to stay under. */
function NewCommit({ onAdd }: { onAdd: (text: string, period: Period, limit?: number) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [period, setPeriod] = useState<Period | null>(null);
  const [limit, setLimit] = useState("");
  const parsed = text.trim() ? parseCommit(text) : null;
  // Until a chip is tapped, the length follows the words ("this month").
  const shown = period ?? parsed?.period ?? "day";

  return (
    <form
      className="glass space-y-3 rounded-3xl p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAdd(text.trim(), shown, Number(limit) > 0 ? Number(limit) : undefined);
        setText("");
        setPeriod(null);
        setLimit("");
      }}
    >
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.commit.addPlaceholder} className="h-11" />
      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">{t.commit.period}</p>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", shown === p ? "bg-accent text-accent-fg" : "bg-sunken")}>
              {t.commit.periods[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1.5 block text-xs font-semibold text-muted">{t.commit.limit}</span>
          <Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ""))} placeholder={parsed?.limit ? `₪${parsed.limit}` : "₪"} className="h-10" />
        </label>
        <Button disabled={!text.trim()}>{t.common.add}</Button>
      </div>
    </form>
  );
}

function Row({ editing, onDelete, children }: { editing: boolean; onDelete: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <AnimatePresence>{editing && <RemoveBadge onClick={onDelete} />}</AnimatePresence>
      <SwipeRow onDelete={onDelete} className="min-w-0 flex-1 rounded-3xl">
        {children}
      </SwipeRow>
    </div>
  );
}

function ActiveCard({ item, spec, locale, onSave }: { item: Item; spec: CommitSpec; locale: string; onSave: (s: CommitSpec) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const s = status(spec);
  const used = spent(spec);
  const pct = spec.limit ? Math.min(100, (used / spec.limit) * 100) : 0;

  return (
    <div className="glass space-y-3 rounded-3xl p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🤝</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug">{item.title}</p>
          <p className="text-xs text-muted">
            {t.commit.periods[spec.period]} · {fill(t.commit.endsIn, { when: relative(locale, spec.end) })}
          </p>
        </div>
      </div>

      {spec.limit !== undefined && (
        <div>
          <div className="h-3 overflow-hidden rounded-full bg-sunken">
            <div className={cn("h-full rounded-full transition-all", s === "broken" ? "bg-danger" : pct > 80 ? "bg-warn" : "bg-success")} style={{ width: `${pct}%` }} />
          </div>
          <p className={cn("mt-1 text-xs font-semibold", s === "broken" ? "text-danger" : "text-muted")}>
            {fill(t.commit.of, { spent: amount(used, spec.unit), limit: amount(spec.limit, spec.unit) })} ·{" "}
            {s === "broken" ? fill(t.commit.over, { over: amount(used - spec.limit, spec.unit) }) : fill(t.commit.left, { left: amount(spec.limit - used, spec.unit) })}
          </p>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(value);
              if (!n) return;
              onSave({ ...spec, log: [...(spec.log ?? []), { at: new Date().toISOString(), amount: n }] });
              setValue("");
            }}
          >
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={t.commit.amount} className="h-10 min-w-0 flex-1" />
            <Button size="sm" variant="soft" disabled={!Number(value)}>
              + {t.commit.log}
            </Button>
          </form>
        </div>
      )}

      {s === "ask" ? (
        <div>
          <p className="mb-2 text-sm font-semibold">{t.commit.ask}</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => onSave({ ...spec, result: "kept" })}>
              {t.commit.yes}
            </Button>
            <Button variant="soft" className="flex-1" onClick={() => onSave({ ...spec, result: "broken" })}>
              {t.commit.no}
            </Button>
          </div>
        </div>
      ) : (
        spec.limit === undefined && (
          <div className="flex gap-2">
            <Button size="sm" variant="soft" className="flex-1" onClick={() => onSave({ ...spec, result: "kept" })}>
              ✓ {t.commit.kept}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onSave({ ...spec, result: "broken" })}>
              {t.commit.broken}
            </Button>
          </div>
        )
      )}
    </div>
  );
}

function PastCard({ item, spec, onSave, onAgain }: { item: Item; spec: CommitSpec; onSave: (s: CommitSpec) => void; onAgain: () => void }) {
  const { t } = useI18n();
  const kept = status(spec) === "kept";
  const [lesson, setLesson] = useState(spec.lesson ?? "");

  return (
    <div className={cn("glass space-y-2 rounded-3xl p-4", kept ? "border-s-4 border-success" : "border-s-4 border-danger")}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{kept ? "🎉" : "😬"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{item.title}</p>
          <p className={cn("text-xs font-semibold", kept ? "text-success" : "text-danger")}>
            {kept ? t.commit.kept : t.commit.broken} · {t.commit.periods[spec.period]}
            {spec.limit !== undefined && ` · ${fill(t.commit.of, { spent: amount(spent(spec), spec.unit), limit: amount(spec.limit, spec.unit) })}`}
          </p>
        </div>
        <button onClick={onAgain} aria-label={t.commit.again} title={t.commit.again} className="flex size-9 items-center justify-center rounded-full bg-sunken">
          <RotateCcw className="size-4" />
        </button>
      </div>
      {!kept && (
        <Input
          value={lesson}
          onChange={(e) => setLesson(e.target.value)}
          onBlur={() => lesson !== (spec.lesson ?? "") && onSave({ ...spec, result: spec.result ?? "broken", lesson: lesson.trim() || undefined })}
          placeholder={t.commit.lessonPlaceholder}
          className="h-10 text-sm"
        />
      )}
    </div>
  );
}
