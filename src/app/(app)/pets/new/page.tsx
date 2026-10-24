import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireHome, getT } from "@/lib/session";
import { Card } from "@/components/ui";
import { PetForm } from "@/components/pets/PetForm";

export default async function NewPetPage() {
  await requireHome();
  const t = await getT();
  return (
    <div className="safe-top">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft className="size-4 rtl:rotate-180" /> {t.nav.today}
      </Link>
      <h1 className="text-[30px] font-extrabold tracking-tight">🐶 {t.pets.add}</h1>
      <p className="mb-4 mt-1 text-muted">{t.pets.addHint}</p>
      <Card>
        <PetForm />
      </Card>
    </div>
  );
}
