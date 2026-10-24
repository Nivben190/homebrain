"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, ChevronLeft, Plus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { instantiateTemplate, SECTION_TEMPLATES, TEMPLATE_CATEGORIES, templateIsShared, type SectionTemplate, type TemplateCategory } from "@/lib/registry/templates";
import { nextReminder, todayKey } from "@/lib/engine/habits";
import { useI18n } from "@/i18n/client";
import { Button, Chip, ColorPicker, EmojiPicker, Field, IconButton, IconTile, Input, Segmented, Sheet } from "@/components/ui";
import { spaceType } from "@/lib/registry/spaces";

export function NewSectionButton({ householdId, userId, timeZone }: { householdId: string; userId: string; timeZone: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<TemplateCategory>("dog");
  const [tpl, setTpl] = useState<SectionTemplate | null>(null);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("📄");
  const [color, setColor] = useState("violet");
  const [visibility, setVisibility] = useState<"shared" | "private">("shared");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useMemo(() => SECTION_TEMPLATES.filter((s) => s.category === category && s.key !== "blank"), [category]);
  const blank = SECTION_TEMPLATES.find((s) => s.key === "blank")!;

  function pick(next: SectionTemplate) {
    setTpl(next);
    setTitle(next.title[locale]);
    setIcon(next.icon);
    setColor(next.color);
    setVisibility(templateIsShared(next) ? "shared" : "private");
    setError(null);
  }

  function close() {
    setOpen(false);
    setTimeout(() => setTpl(null), 300);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!tpl) return;
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    const today = todayKey(timeZone);
    const { schema, items } = instantiateTemplate(tpl, locale, today);
    const { data, error } = await sb
      .from("sections")
      .insert({
        household_id: householdId,
        owner_id: visibility === "private" ? userId : null,
        title: title.trim() || t.sections.new,
        icon,
        color,
        view: tpl.view,
        template: tpl.key === "blank" ? null : tpl.key,
        schema,
        position: Date.now() / 1000,
      })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    if (items.length) {
      const now = new Date();
      await sb.from("items").insert(
        items.map(({ habit, ...it }) => ({
          ...it,
          section_id: data.id,
          remind_at: habit ? (nextReminder(habit, now, timeZone, () => false)?.at.toISOString() ?? null) : null,
        })),
      );
    }
    setBusy(false);
    close();
    router.push(`/sections/${data.id}`);
  }

  return (
    <>
      <IconButton aria-label={t.sections.new} onClick={() => setOpen(true)} className="size-12 bg-accent text-accent-fg shadow-[0_8px_20px_-6px_var(--accent)]">
        <Plus className="size-6" strokeWidth={2.6} />
      </IconButton>
      <Sheet open={open} onClose={close} title={tpl ? undefined : t.sections.new}>
        <AnimatePresence mode="wait" initial={false}>
          {!tpl ? (
            <motion.div key="gallery" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 pb-4">
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
