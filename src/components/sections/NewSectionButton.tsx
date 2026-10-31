"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, Check, ChevronLeft, Plus, Sparkles } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { instantiateTemplate, LIVE_TEMPLATES, SECTION_TEMPLATES, TEMPLATE_CATEGORIES, templateIsShared, type SectionTemplate, type TemplateCategory } from "@/lib/registry/templates";
import { FINDER_GOALS, recommend } from "@/lib/registry/finder";
import { nextReminder, todayKey } from "@/lib/engine/habits";
import { useI18n } from "@/i18n/client";
import { fill, type Locale } from "@/i18n";
import { useToast } from "@/components/Toaster";
import { cn } from "@/lib/cn";
import { Button, Chip, ColorPicker, EmojiPicker, Field, IconButton, IconTile, Input, Segmented, Sheet } from "@/components/ui";
import { spaceType } from "@/lib/registry/spaces";
import { errorKey } from "@/lib/errors";

/** Creates a space from a template, with its starter items and their first reminders. */
async function addSpace(
  sb: SupabaseClient,
  tpl: SectionTemplate,
  opts: { householdId: string; ownerId: string | null; title: string; icon: string; color: string; locale: Locale; timeZone: string },
) {
  const { schema, items } = instantiateTemplate(tpl, opts.locale, todayKey(opts.timeZone));
  const { data, error } = await sb
    .from("sections")
    .insert({
      household_id: opts.householdId,
      owner_id: opts.ownerId,
      title: opts.title,
      icon: opts.icon,
      color: opts.color,
      view: tpl.view,
      template: tpl.key === "blank" ? null : tpl.key,
      schema,
      position: Date.now() / 1000,
    })
    .select("id")
    .single();
  if (error) return { error };
  if (items.length) {
    const now = new Date();
    await sb.from("items").insert(
      items.map(({ habit, ...it }) => ({
        ...it,
        section_id: data.id,
        remind_at: habit ? (nextReminder(habit, now, opts.timeZone, () => false)?.at.toISOString() ?? null) : null,
      })),
    );
  }
  return { id: data.id as string };
}

/**
 * `privateOnly`: a teen's spaces are always their own (roadmap 3.1 roles).
 * `existing`: template keys the home already has, left out of "Help me choose".
 * `startFinder`: opens straight into "Help me choose" (the new-user banner links here).
 */
export function NewSectionButton({
  householdId,
  userId,
  timeZone,
  privateOnly = false,
  existing = [],
  startFinder = false,
}: {
  householdId: string;
  userId: string;
  timeZone: string;
  privateOnly?: boolean;
  existing?: string[];
  startFinder?: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(startFinder);
  const [finder, setFinder] = useState<"goals" | "results" | null>(startFinder ? "goals" : null);
  const [goals, setGoals] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<TemplateCategory>("dog");
  const [tpl, setTpl] = useState<SectionTemplate | null>(null);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("📄");
  const [color, setColor] = useState("violet");
  const [visibility, setVisibility] = useState<"shared" | "private">("shared");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => LIVE_TEMPLATES.filter((s) => s.category === category && s.key !== "blank"), [category]);
  const blank = SECTION_TEMPLATES.find((s) => s.key === "blank")!;
  const results = useMemo(() => recommend(goals, existing), [goals, existing]);

  useEffect(() => {
    if (!startFinder) return;
    setOpen(true);
    setFinder("goals");
  }, [startFinder]);

  function showResults() {
    setChosen(new Set(results.filter((r) => r.suggested).map((r) => r.template.key)));
    setFinder("results");
  }

  function toggleChosen(key: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  /** Adds every ticked space at once; one opens straight away, several land on the Spaces list. */
  async function addChosen() {
    const picked = results.filter((r) => chosen.has(r.template.key)).map((r) => r.template);
    if (!picked.length) return;
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    const ids: string[] = [];
    for (const tpl of picked) {
      const res = await addSpace(sb, tpl, {
        householdId,
        ownerId: templateIsShared(tpl) && !privateOnly ? null : userId,
        title: tpl.title[locale],
        icon: tpl.icon,
        color: tpl.color,
        locale,
        timeZone,
      });
      if ("error" in res) {
        setBusy(false);
        return setError(t.failures[errorKey(res.error)]);
      }
      ids.push(res.id);
    }
    setBusy(false);
    close();
    if (ids.length === 1) return router.push(`/sections/${ids[0]}`);
    toast.success(fill(t.finder.added, { n: String(ids.length) }));
    router.push("/sections");
    router.refresh();
  }

  function pick(next: SectionTemplate) {
    setTpl(next);
    setTitle(next.title[locale]);
    setIcon(next.icon);
    setColor(next.color);
    setVisibility(templateIsShared(next) && !privateOnly ? "shared" : "private");
    setError(null);
  }

  function close() {
    setOpen(false);
    setTimeout(() => {
      setTpl(null);
      setFinder(null);
    }, 300);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!tpl) return;
    setBusy(true);
    setError(null);
    const res = await addSpace(supabaseBrowser(), tpl, {
      householdId,
      ownerId: visibility === "private" ? userId : null,
      title: title.trim() || t.sections.new,
      icon,
      color,
      locale,
      timeZone,
    });
    setBusy(false);
    if ("error" in res) return setError(t.failures[errorKey(res.error)]);
    close();
    router.push(`/sections/${res.id}`);
  }

  return (
    <>
      <IconButton aria-label={t.sections.new} onClick={() => setOpen(true)} className="size-12 bg-accent text-accent-fg shadow-[0_8px_20px_-6px_var(--accent)]">
        <Plus className="size-6" strokeWidth={2.6} />
      </IconButton>
      <Sheet open={open} onClose={close} title={tpl ? undefined : finder ? t.finder.open : t.sections.new}>
        <AnimatePresence mode="wait" initial={false}>
          {finder === "goals" ? (
            <motion.div key="goals" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 pb-4">
              <div>
                <p className="text-lg font-bold">{t.finder.title}</p>
                <p className="text-sm text-muted">{t.finder.hint}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {FINDER_GOALS.map((g) => {
                  const on = goals.includes(g.key);
                  return (
                    <button
                      key={g.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setGoals((prev) => (on ? prev.filter((k) => k !== g.key) : [...prev, g.key]))}
                      className={cn("flex items-center gap-2 rounded-2xl p-3 text-start text-sm font-semibold leading-snug transition active:scale-[0.98]", on ? "bg-accent text-accent-fg" : "bg-sunken")}
                    >
                      <span className="text-xl">{g.icon}</span>
                      {g.label[locale]}
                    </button>
                  );
                })}
              </div>
              <Button size="lg" className="w-full" disabled={!goals.length} onClick={showResults}>
                {t.finder.show}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setFinder(null)}>
                {t.finder.browse}
              </Button>
            </motion.div>
          ) : finder === "results" ? (
            <motion.div key="results" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 pb-4">
              <button type="button" onClick={() => setFinder("goals")} className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
                <ChevronLeft className="size-4 rtl:rotate-180" /> {t.finder.back}
              </button>
              {results.length === 0 ? (
                <p className="rounded-2xl bg-sunken p-4 text-center font-semibold">{t.finder.haveAll}</p>
              ) : (
                <>
                  <div>
                    <p className="text-lg font-bold">{t.finder.resultsTitle}</p>
                    <p className="text-sm text-muted">{t.finder.resultsHint}</p>
                  </div>
                  <div className="space-y-2">
                    {results.map(({ template: s, goals: why }) => {
                      const on = chosen.has(s.key);
                      return (
                        <button
                          key={s.key}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => toggleChosen(s.key)}
                          className={cn("flex w-full items-center gap-3 rounded-2xl p-3 text-start ring-2 transition active:scale-[0.98]", on ? "bg-accent-soft ring-accent" : "bg-sunken ring-transparent")}
                        >
                          <IconTile icon={s.icon} color={s.color} className="size-12 text-2xl" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-bold">{s.title[locale]}</span>
                            <span className="line-clamp-2 block text-sm leading-snug text-muted">{s.desc[locale]}</span>
                            <span className="mt-0.5 block text-xs font-semibold text-accent">
                              {fill(t.finder.because, { goals: why.map((g) => `${g.icon} ${g.label[locale]}`).join(" · ") })}
                            </span>
                          </span>
                          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", on ? "bg-accent text-accent-fg" : "bg-card")}>{on && <Check className="size-4" strokeWidth={3} />}</span>
                        </button>
                      );
                    })}
                  </div>
                  {error && <p className="text-sm text-danger">{error}</p>}
                  <Button size="lg" className="w-full" loading={busy} disabled={!chosen.size} onClick={addChosen}>
                    {chosen.size === 1 ? t.finder.addOne : fill(t.finder.add, { n: String(chosen.size) })}
                  </Button>
                </>
              )}
            </motion.div>
          ) : !tpl ? (
            <motion.div key="gallery" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 pb-4">
              <button type="button" onClick={() => setFinder("goals")} className="flex w-full items-center gap-3 rounded-2xl bg-accent-soft p-3 text-start transition active:scale-[0.98]">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-fg">
                  <Sparkles className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{t.finder.open}</span>
                  <span className="block text-sm leading-snug text-muted">{t.finder.openHint}</span>
                </span>
              </button>
              <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
                {TEMPLATE_CATEGORIES.map((c) => (
                  <Chip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)} className="shrink-0">
                    {c.icon} {c.label[locale]}
                  </Chip>
                ))}
              </div>
              <div className="space-y-2">
                {list.map((s) => (
                  <button key={s.key} onClick={() => pick(s)} className="flex w-full items-center gap-3 rounded-2xl bg-sunken p-3 text-start transition active:scale-[0.98]">
                    <IconTile icon={s.icon} color={s.color} className="size-12 text-2xl" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-bold">
                        {s.title[locale]}
                        {spaceType(s.view).reminds && <BellRing className="size-3.5 text-accent" />}
                      </span>
                      <span className="line-clamp-2 block text-sm leading-snug text-muted">{s.desc[locale]}</span>
                    </span>
                  </button>
                ))}
              </div>
              <Button variant="ghost" className="w-full" onClick={() => pick(blank)}>
                <Plus className="size-4" /> {t.sections.blank}
              </Button>
            </motion.div>
          ) : (
            <motion.form key="details" onSubmit={create} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-5 pb-4">
              <button type="button" onClick={() => setTpl(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
                <ChevronLeft className="size-4 rtl:rotate-180" /> {t.sections.templates}
              </button>
              <div className="flex items-center gap-3">
                <IconTile icon={icon} color={color} className="size-14 text-3xl" />
                <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required placeholder={t.sections.name} className="h-14 text-lg font-bold" />
              </div>
              {tpl.desc[locale] && <p className="text-sm text-muted">{tpl.desc[locale]}</p>}
              {(tpl.items?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tpl.items!.slice(0, 8).map((it, i) => (
                    <span key={i} className="rounded-lg bg-sunken px-2 py-1 text-xs font-semibold text-muted">
                      {it.title[locale]}
                    </span>
                  ))}
                </div>
              )}
              {!privateOnly && (
                <Field label={t.sections.visibility}>
                  <Segmented
                    value={visibility}
                    onChange={setVisibility}
                    options={[
                      { value: "shared", label: `👫 ${t.common.shared}` },
                      { value: "private", label: `🔒 ${t.common.private}` },
                    ]}
                  />
                </Field>
              )}
              <Field label={t.sections.icon}>
                <EmojiPicker value={icon} onChange={setIcon} />
              </Field>
              <Field label={t.sections.color}>
                <ColorPicker value={color} onChange={setColor} />
              </Field>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button size="lg" className="w-full" loading={busy}>
                {t.common.create}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </Sheet>
    </>
  );
}
