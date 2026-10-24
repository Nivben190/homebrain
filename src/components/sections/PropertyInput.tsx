"use client";
import { Chip, Input, Toggle } from "@/components/ui";
import { formatPropertyValue, type PropertyDef } from "@/lib/registry/properties";

export interface Member {
  id: string;
  name: string;
  emoji: string;
}

export function PropertyInput({ def, value, onChange, members }: { def: PropertyDef; value: unknown; onChange: (v: unknown) => void; members: Member[] }) {
  switch (def.type) {
    case "checkbox":
      return <Toggle checked={!!value} onChange={onChange} label={def.name} />;
    case "number":
    case "price":
      return <Input type="number" inputMode="decimal" value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
    case "date":
      return <Input type="date" value={typeof value === "string" ? value.slice(0, 10) : ""} onChange={(e) => onChange(e.target.value || null)} />;
    case "url":
      return <Input type="url" inputMode="url" placeholder="https://" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "select":
      return (
        <div className="flex flex-wrap gap-2">
          {(def.options ?? []).map((o) => (
            <Chip key={o} active={value === o} onClick={() => onChange(value === o ? null : o)}>
              {o}
            </Chip>
          ))}
        </div>
      );
    case "rating": {
      const n = Number(value) || 0;
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" onClick={() => onChange(n === i ? 0 : i)} aria-label={`${i}`} className={`text-3xl transition active:scale-75 ${i <= n ? "" : "opacity-25 grayscale"}`}>
              ❤️
            </button>
          ))}
        </div>
      );
    }
    case "person":
      return (
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <Chip key={m.id} active={value === m.id} onClick={() => onChange(value === m.id ? null : m.id)}>
              {m.emoji} {m.name}
            </Chip>
          ))}
        </div>
      );
    default:
      return <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Small read-only chips shown under an item's title. */
export function PropertyChips({ schema, props, members, locale }: { schema: PropertyDef[]; props: Record<string, unknown>; members: Member[]; locale: string }) {
  const chips = schema
    .map((def) => {
      const v = props[def.id];
      if (v === null || v === undefined || v === "" || v === false) return null;
      if (def.type === "person") {
        const m = members.find((x) => x.id === v);
        return m ? { id: def.id, text: `${m.emoji} ${m.name}` } : null;
      }
      if (def.type === "url") return { id: def.id, text: "🔗 " + String(v).replace(/^https?:\/\/(www\.)?/, "").slice(0, 24) };
      if (def.type === "checkbox") return { id: def.id, text: `✓ ${def.name}` };
      return { id: def.id, text: (def.type === "date" ? "📅 " : "") + formatPropertyValue(def, v, locale) };
    })
    .filter(Boolean) as { id: string; text: string }[];
  if (!chips.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c.id} className="rounded-lg bg-sunken px-2 py-0.5 text-xs font-semibold text-muted">
          {c.text}
        </span>
      ))}
    </span>
  );
}
