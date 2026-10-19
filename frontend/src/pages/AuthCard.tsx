import type { ReactNode } from "react";

import { Logo } from "@/components/Logo";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-full items-center justify-center p-4">
      <div className="bg-panel w-full max-w-sm space-y-6 rounded-2xl border p-8 shadow-sm">
        <Logo />
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
