import type { ReactNode } from "react";

export function PageFrame({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex h-14 items-center gap-2 border-b px-4 md:px-6">
        <h1 className="font-semibold">{title}</h1>
        <div className="ml-auto">{actions}</div>
      </div>
      <div className="mx-auto max-w-3xl space-y-6 px-5 py-8 md:px-10">{children}</div>
    </div>
  );
}

export function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="bg-card space-y-4 rounded-xl border p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {children}
    </section>
  );
}
