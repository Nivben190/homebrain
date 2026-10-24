import { notFound } from "next/navigation";
import { requireHome } from "@/lib/session";
import { PetScreen, type PetRoutine } from "@/components/pets/PetScreen";
import { isDue, readHabit, todayKey } from "@/lib/engine/habits";
import type { CheckinRow, Item, Pet, PetWeight, Section } from "@/lib/db-types";

export default async function PetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireHome();
  const today = todayKey(profile.timezone);
  const [{ data: pet }, { data: weights }, { data: spaces }] = await Promise.all([
    supabase.from("pets").select("*").eq("id", id).maybeSingle<Pet>(),
    supabase.from("pet_weights").select("*").eq("pet_id", id).order("day", { ascending: false }).limit(24).returns<PetWeight[]>(),
    // Spaces made from the dog templates, with today's check-ins for trackers.
    supabase
      .from("sections")
      .select("*, items(id,title,props,done, checkins(day))")
      .like("template", "dog-%")
      .eq("items.checkins.day", today)
      .order("position")
      .returns<(Section & { items: (Pick<Item, "id" | "title" | "props" | "done"> & { checkins: Pick<CheckinRow, "day">[] })[] })[]>(),
  ]);
  if (!pet) notFound();

  const routines: PetRoutine[] = (spaces ?? []).map((s) => {
    const dueToday = s.view === "tracker" ? s.items.filter((i) => !i.done && readHabit(i.props) && isDue(readHabit(i.props)!, today)) : [];
    return {
      id: s.id,
      title: s.title,
      icon: s.icon,
      color: s.color,
      open: s.view === "tracker" ? dueToday.filter((i) => i.checkins.length === 0).map((i) => i.title) : s.items.filter((i) => !i.done).map((i) => i.title),
      doneToday: dueToday.filter((i) => i.checkins.length > 0).length,
      tracker: s.view === "tracker",
    };
  });

  return <PetScreen pet={pet} weights={(weights ?? []).reverse()} routines={routines} today={today} />;
}
