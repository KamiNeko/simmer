import { Minus, Plus } from "lucide-react";

import { formatNumber, stepServings } from "@/lib/quantity";
import { cn } from "@/lib/utils";

/** A compact minus/plus control for the servings of one recipe in a list. */
export function ServingsStepper({
  title,
  servings,
  perServing,
  onChange,
  className,
}: {
  title: string;
  servings: number;
  /** Whether the recipe states its servings; if not, the count is a multiplier. */
  perServing: boolean;
  onChange: (servings: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("text-muted-foreground flex items-center rounded-lg border", className)}>
      <button type="button" className="hover:text-foreground p-1.5 disabled:opacity-40" disabled={servings <= 0.5} onClick={() => onChange(stepServings(servings, -1))} aria-label={`Fewer servings of ${title}`}>
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-12 text-center text-xs tabular-nums">{perServing ? `${formatNumber(servings)} serv.` : `× ${formatNumber(servings)}`}</span>
      <button type="button" className="hover:text-foreground p-1.5" onClick={() => onChange(stepServings(servings, 1))} aria-label={`More servings of ${title}`}>
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
