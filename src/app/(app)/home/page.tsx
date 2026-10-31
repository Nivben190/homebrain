import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireHome, getT } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import type { Pet } from "@/lib/db-types";

/** The Home tab: the home-wide screens (calendar, meals, money, weekly, info) and the pets, in one place. */
export default async function HomeHubPage() {
  const { supabase, household, profile } = await requireHome();
  const t = await getT();
  const { data: pets } = await supabase.from("pets").select("id,name,emoji").order("created_at").returns<Pick<Pet, "id" | "name" | "emoji">[]>();
  const canAddPet = ["owner", "adult"].includes(profile.role);
  const tiles = [
    { href: "/calendar", icon: "📅", title: t.calendar.title, hint: t.hub.calendar },
    { href: "/meals", icon: "🍽️", title: t.meals.link, hint: t.hub.meals },
    { href: "/money", icon: "💰", title: t.money.title, hint: t.hub.money },
    { href: "/weekly", icon: "🗓️", title: t.weekly.title, hint: t.hub.weekly },
    { href: "/home-info", icon: "🏠", title: t.homeInfo.title, hint: t.hub.info },
  ];
  return (
    <>
      <PageHeader title={household.name || t.hub.title} />
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <Link key={tile.href} href={tile.href} className="glass flex flex-col gap-1 rounded-3xl p-4 transition active:scale-[0.98]">
            <span className="text-3xl">{tile.icon}</span>
            <span className="font-bold">{tile.title}</span>
            <span className="text-xs leading-snug text-muted">{tile.hint}</span>
          </Link>
        ))}
      </div>
      {((pets ?? []).length > 0 || canAddPet) && (
        <div className="glass mt-3 divide-y divide-card-border overflow-hidden rounded-3xl">
          {(pets ?? []).map((pet) => (
            <Link key={pet.id} href={`/pets/${pet.id}`} className="flex items-center gap-3 px-4 py-3.5">
              <span className="text-2xl">{pet.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{pet.name}</span>
                <span className="block text-xs text-muted">{t.hub.pet}</span>
              </span>
              <ChevronRight className="size-5 text-faint rtl:rotate-180" />
            </Link>
          ))}
          {canAddPet && (
            <Link href="/pets/new" className="flex items-center gap-3 px-4 py-3.5">
              <span className="text-2xl">🐾</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t.hub.addPet}</span>
                <span className="block text-xs text-muted">{t.hub.addPetHint}</span>
              </span>
              <ChevronRight className="size-5 text-faint rtl:rotate-180" />
            </Link>
          )}
        </div>
      )}
    </>
  );
}
