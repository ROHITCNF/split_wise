/** Stand-in for screens built in later milestones (plan M10–M12). */
export function PlaceholderPage({ title, milestone }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">This screen is built in {milestone}.</p>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">This page doesn&apos;t exist.</p>
    </div>
  );
}
