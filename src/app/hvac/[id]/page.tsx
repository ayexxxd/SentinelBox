import HvacDetail from "@/components/HvacDetail";
import Navbar from "@/components/Navbar";
import { getHvacById, HVAC_UNITS } from "@/data/sentinel";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return HVAC_UNITS.map((u) => ({ id: u.id }));
}

export default async function HvacDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const unit = getHvacById(id);
  if (!unit) notFound();

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-400/40 hover:text-sky-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to 3D dashboard
        </Link>
        <HvacDetail unit={unit} />
      </main>
    </div>
  );
}
