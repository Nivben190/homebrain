"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { cn } from "@/lib/cn";
import { NotesSyncHelp } from "@/components/settings/NotesSyncHelp";
import { useI18n } from "@/i18n/client";
import { Button, ColorPicker, EmojiPicker, Field, Input, Segmented, Select, Sheet } from "@/components/ui";
import { newPropertyId, PROPERTY_TYPES, type PropertyDef, type PropertyType } from "@/lib/registry/properties";
import type { Section, SectionView } from "@/lib/db-types";
import { spaceType } from "@/lib/registry/spaces";

export function SectionSettingsSheet({
  open,
  section,
  userId,
  onClose,
  onSaved,
  onDeleted,
  hookToken,
}: {
  open: boolean;
  section: Section;
  userId: string;
  hookToken: string;
  onClose: () => void;
  onSaved: (s: Section) => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const [s, setS] = useState(section);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setS(section);
      setError(null);
    }
  }, [open, section]);

  const changed = JSON.stringify(s) !== JSON.stringify(section);

  const setProp = (id: string, patch: Partial<PropertyDef>) => setS((x) => ({ ...x, schema: x.schema.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  async function save() {
    setBusy(true);
    setError(null);
    const patch = { title: s.title.trim() || section.title, icon: s.icon, color: s.color, view: s.view, owner_id: s.owner_id, schema: s.schema.filter((p) => p.name.trim()), notes_link: s.notes_link?.trim() || null, ...((s.notes_link?.trim() || null) !== (section.notes_link ?? null) ? { notes_state: null } : {}) };
    const { error } = await supabaseBrowser().from("sections").update(patch).eq("id", section.id);
    setBusy(false);
    if (error) return setError(error.message);
    onSaved({ ...section, ...patch });
    onClose();
  }

  async function remove() {
    if (!confirm(t.sections.deleteConfirm)) return;
    await supabaseBrowser().from("sections").delete().eq("id", section.id);
    onDeleted();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.sections.settings}
      footer={
        <div className="space-y-2">
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button size="lg" className="flex-1" loading={busy} disabled={!changed} onClick={save}>
              {t.common.saveChanges}
            </Button>
            <Button size="lg" variant="danger" onClick={remove} aria-label={t.common.delete}>
              <Trash2 className="size-5" />
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 pb-4">
        <Field label={t.sections.name}>
          <Input value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} />
        </Field>
        <Field label={t.sections.icon}>
          <EmojiPicker value={s.icon} onChange={(icon) => setS({ ...s, icon })} />
        </Field>
        <Field label={t.sections.color}>
          <ColorPicker value={s.color} onChange={(color) => setS({ ...s, color })} />
        </Field>
        <Field label={t.sections.view}>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["checklist", "☑️"],
                ["list", "☰"],
                ["notes", "🗒️"],
                ["tracker", "🔥"],
                ["gallery", "📸"],
                ["dates", "📅"],
                ["subscriptions", "💳"],
                ["wheel", "🎡"],
                ["commit", "🤝"],
                ["spend", "💸"],
                ["fridge", "🧊"],
              ] as [SectionView, string][]
            ).map(([view, icon]) => (
              <button
                key={view}
                type="button"
                onClick={() => setS({ ...s, view })}
                className={cn("rounded-2xl px-3 py-2.5 text-start transition", s.view === view ? "bg-accent-soft ring-2 ring-accent" : "bg-sunken")}
              >
                <span className="block font-bold">
                  {icon} {t.views[view]}
                </span>
                <span className="block text-xs leading-snug text-muted">{t.viewHints[view]}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label={t.sections.visibility}>
          <Segmented
            value={s.owner_id ? "private" : "shared"}
            onChange={(v) => setS({ ...s, owner_id: v === "private" ? userId : null })}
            options={[
              { value: "shared", label: `👫 ${t.common.shared}` },
              { value: "private", label: `🔒 ${t.common.private}` },
            ]}
          />
        </Field>

        {spaceType(section.view).notesSync && (
          <>
            <Field label={t.notesSync.linkedNote} hint={t.notesSync.linkedHint}>
              <Input value={s.notes_link ?? ""} onChange={(e) => setS({ ...s, notes_link: e.target.value })} placeholder="רשימת קניות" />
            </Field>
            <NotesSyncHelp hookToken={hookToken} />
          </>
        )}

        <Field label={t.sections.properties}>
          <div className="space-y-2">
            {s.schema.map((p) => (
              <div key={p.id} className="rounded-2xl bg-sunken p-2">
                <div className="flex gap-2">
                  <Input value={p.name} placeholder={t.sections.propertyName} onChange={(e) => setProp(p.id, { name: e.target.value })} className="h-11 flex-1" />
                  <Select value={p.type} onChange={(e) => setProp(p.id, { type: e.target.value as PropertyType })} className="h-11 w-32 px-3">
                    {Object.entries(PROPERTY_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.icon} {v.label}
                      </option>
                    ))}
                  </Select>
                  <button type="button" aria-label={t.common.delete} onClick={() => setS({ ...s, schema: s.schema.filter((x) => x.id !== p.id) })} className="px-2 text-faint">
                    <X className="size-5" />
                  </button>
                </div>
                {p.type === "select" && (
                  <Input
                    className="mt-2 h-11"
                    placeholder={t.sections.options}
                    defaultValue={(p.options ?? []).join(", ")}
                    onBlur={(e) => setProp(p.id, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                  />
                )}
              </div>
            ))}
            <Button type="button" variant="soft" className="w-full" onClick={() => setS({ ...s, schema: [...s.schema, { id: newPropertyId(), name: "", type: "text" }] })}>
              <Plus className="size-4" /> {t.sections.addProperty}
            </Button>
          </div>
        </Field>

      </div>
    </Sheet>
  );
}
