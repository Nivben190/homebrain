"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button, Field, Input, Segmented, Sheet, Textarea } from "@/components/ui";
import { googleCalendarLink, icsLink } from "@/lib/engine/render";
import { PropertyInput, type Member } from "./PropertyInput";
import { dueFromProps } from "@/lib/registry/properties";
import { PHOTOS_PROP, readPhotos } from "@/lib/photos";
import { PhotoField } from "@/components/photos/PhotoField";
import type { Item, Section } from "@/lib/db-types";
import { spaceType } from "@/lib/registry/spaces";
import { syncItemToCalendar } from "@/app/actions";
import { dueReminderAt, LEAD_OPTIONS, readLead, REMIND_PROP } from "@/lib/engine/due";

export function ItemSheet({
  item,
  section,
  members,
  onClose,
  onChange,
  onDelete,
}: {
  item: Item | null;
  section: Section;
  members: Member[];
  onClose: () => void;
  onChange: (id: string, patch: Partial<Item>) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [gcal, setGcal] = useState<"idle" | "busy" | "done">("idle");

  useEffect(() => {
    setTitle(item?.title ?? "");
    setNotes(typeof item?.props._notes === "string" ? item.props._notes : "");
    setGcal(item?.gcal_event_id ? "done" : "idle");
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  // Plain dated items (not trackers / reminder calendars, which schedule themselves) can remind before they're due.
  const remindable = spaceType(section.view).datesAreDue && !spaceType(section.view).reminds;
  const setProp = (id: string, v: unknown) => {
    const props = { ...item.props, [id]: v };
    // Memory dates are when it happened, not something due.
    const due_at = !spaceType(section.view).datesAreDue ? null : dueFromProps(section.schema, props, Intl.DateTimeFormat().resolvedOptions().timeZone);
    onChange(item.id, remindable ? { props, due_at, remind_at: dueReminderAt(due_at, readLead(props)) } : { props, due_at });
    // Already in Google Calendar: move (or remove) the event with the date.
    if (item.gcal_event_id && due_at !== item.due_at) setTimeout(() => void syncItemToCalendar(item.id), 800);
  };
  const addToGoogle = async () => {
    setGcal("busy");
    const r = await syncItemToCalendar(item.id);
    if (r.ok) return setGcal("done");
    setGcal("idle");
    // Not connected: fall back to Google's add-event page.
    if (dueDay) window.open(googleCalendarLink(item.title, dueDay, new Date(dueDay.getTime() + 86400000)), "_blank", "noopener");
  };
  const lead = readLead(item.props);
  const photosField = (
    <Field label={t.photos.title}>
      <PhotoField
        photos={readPhotos(item.props)}
        target={{ householdId: section.household_id, sectionId: section.id, itemId: item.id }}
        onChange={(photos) => onChange(item.id, { props: { ...item.props, [PHOTOS_PROP]: photos } })}
      />
    </Field>
  );
  const commitText = () => {
    if (title.trim() && title !== item.title) onChange(item.id, { title: title.trim() });
    if (notes !== (item.props._notes ?? "")) onChange(item.id, { props: { ...item.props, _notes: notes } });
  };

  const due = item.due_at ? new Date(item.due_at) : null;
  // The calendar day where the phone is (a UTC date is a day early just after midnight in Israel).
  const dueDay = due ? new Date(`${new Intl.DateTimeFormat("en-CA").format(due)}T00:00:00Z`) : null;

  return (
    <Sheet
      open
      onClose={() => {
        commitText();
        onClose();
      }}
      title={`${section.icon} ${section.title}`}
      footer={
        <div className="flex gap-2">
          {spaceType(section.view).checkable && (
            <Button size="lg" variant={item.done ? "ghost" : "soft"} className="flex-1" onClick={() => onChange(item.id, { done: !item.done })}>
              {item.done ? "↺" : "✓"} {t.common.done}
            </Button>
          )}
          <Button size="lg" variant="danger" className={spaceType(section.view).checkable ? "" : "flex-1"} onClick={() => onDelete(item.id)} aria-label={t.common.delete}>
            <Trash2 className="size-5" /> {spaceType(section.view).checkable ? "" : t.common.delete}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-4">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commitText} className="h-14 text-lg font-bold" />
        {spaceType(section.view).photos && photosField}
        {section.schema.map((def) => (
          <Field key={def.id} label={def.name}>
            <PropertyInput def={def} value={item.props[def.id]} onChange={(v) => setProp(def.id, v)} members={members} />
          </Field>
        ))}
        <Field label={t.sections.notes}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={commitText} rows={4} />
        </Field>
        {section.view !== "gallery" && photosField}

        {dueDay && remindable && (
          <Field label={t.sections.remind}>
            <Segmented<string>
              value={lead === null ? "off" : String(lead)}
              onChange={(v) => setProp(REMIND_PROP, v === "off" ? null : Number(v))}
              options={[{ value: "off", label: t.sections.remindOff }, ...LEAD_OPTIONS.map((m) => ({ value: String(m), label: t.sections.remindLead[m] }))]}
            />
          </Field>
        )}

        {dueDay && (
          <Field label={t.sections.addToCalendar}>
            <div className="flex gap-2">
              <a
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-sunken font-semibold"
                href={icsLink(item.title, dueDay, new Date(dueDay.getTime() + 86400000)) + "&allDay=1"}
              >
                🍎 Apple
              </a>
              <button
                type="button"
                disabled={gcal !== "idle"}
                onClick={addToGoogle}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-sunken font-semibold"
              >
                {gcal === "done" ? t.settings.gcalAdded : "📅 Google"}
              </button>
            </div>
          </Field>
        )}

      </div>
    </Sheet>
  );
}
