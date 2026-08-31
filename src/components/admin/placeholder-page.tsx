type PlaceholderPageProps = {
  title: string;
  description?: string;
};

export function PlaceholderPage({
  title,
  description = "This page is a placeholder for now.",
}: PlaceholderPageProps) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="font-serif text-4xl text-ink">{title}</h1>
      <p className="mt-3 text-ink/60">{description}</p>
    </div>
  );
}
