import Link from "next/link";

export default function TemplateNotFound() {
  return (
    <div className="w-full">
      <h1 className="font-serif text-4xl text-ink">Template not found</h1>
      <Link
        href="/admin/templates"
        className="mt-6 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        Back to templates
      </Link>
    </div>
  );
}