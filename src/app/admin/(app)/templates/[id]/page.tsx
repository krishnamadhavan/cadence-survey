import { notFound } from "next/navigation";
import { z } from "zod";
import { getTemplateById } from "@/db/templates";
import { TemplateDetailPanel } from "./template-detail";

export const dynamic = "force-dynamic";

type TemplateDetailPageProps = {
  params: Promise<{ id: string }>;
};

const idSchema = z.string().uuid();

export async function generateMetadata({ params }: TemplateDetailPageProps) {
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return { title: "Template · Cadence" };
  }
  const template = await getTemplateById(parsed.data).catch(() => null);
  return { title: `${template?.name ?? "Template"} · Cadence` };
}

export default async function AdminTemplateDetailPage({
  params,
}: TemplateDetailPageProps) {
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    notFound();
  }

  let template: Awaited<ReturnType<typeof getTemplateById>> = null;
  let dbError = false;

  try {
    template = await getTemplateById(parsed.data);
  } catch {
    dbError = true;
  }

  if (dbError) {
    return <p className="text-ink/70">Could not reach Postgres.</p>;
  }
  if (!template) {
    notFound();
  }

  return (
    <div className="w-full">
      <TemplateDetailPanel template={template} />
    </div>
  );
}