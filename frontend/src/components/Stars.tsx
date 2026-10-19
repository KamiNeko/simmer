import { Star } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/** Read-only average rating, e.g. ★ 4.5 (2). */
export function RatingBadge({ value, count, className }: { value: number | null; count: number; className?: string }) {
  if (value === null) return null;
  return (
    <span className={cn("inline-flex items-center gap-1", className)} title={`${value} of 5 from ${count} rating${count === 1 ? "" : "s"}`}>
      <Star className="fill-primary text-primary size-3.5" />
      <span>{value.toFixed(1).replace(/\.0$/, "")}</span>
      <span className="opacity-70">({count})</span>
    </span>
  );
}

/** Clickable 1–5 star input. Clicking the current value clears it. */
export function StarInput({ value, onChange, disabled }: { value: number | null; onChange: (stars: number | null) => void; disabled?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="flex items-center" onMouseLeave={() => setHover(null)} role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          disabled={disabled}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(value === n ? null : n)}
          className="p-0.5 disabled:opacity-50"
        >
          <Star className={cn("size-5 transition-colors", n <= shown ? "fill-primary text-primary" : "text-muted-foreground/50")} />
        </button>
      ))}
    </div>
  );
}
