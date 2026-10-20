import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import type { Ingredient, Recipe, UnitSystem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LanguageCode } from "@/lib/languages";
import { convertAmount, formatAmount } from "@/lib/convert";
import { formatNumber, formatQuantity, stepServings, unitLabel } from "@/lib/quantity";
import { cn } from "@/lib/utils";

const UNIT_KEY = "simmer-units";

function storedUnits(): UnitSystem | null {
  try {
    const value = localStorage.getItem(UNIT_KEY);
    return value === "metric" || value === "us" || value === "original" ? value : null;
  } catch {
    return null;
  }
}

/** Servings and unit choice for viewing one recipe; the page and cooking view share it. */
export function useRecipeView(recipe: Recipe | undefined, initial?: { servings?: number; units?: UnitSystem }) {
  const { user } = useAuth();
  const [units, setUnitsState] = useState<UnitSystem>(initial?.units ?? user?.unit_system ?? storedUnits() ?? "metric");
  // Until the reader changes it, servings follow the recipe's own.
  const [servings, setServings] = useState<number | null>(initial?.servings ?? null);

  const setUnits = (value: UnitSystem) => {
    setUnitsState(value);
    // Visitors have no profile setting, so their last choice is remembered here.
    if (!user)
      try {
        localStorage.setItem(UNIT_KEY, value);
      } catch {
        /* private mode */
      }
  };

  const base = recipe?.servings ?? 1;
  const scale = servings ? servings / base : 1;
  const language = recipe?.language ?? "en";
  return { units, setUnits, servings: servings ?? base, setServings, scale, hasServings: !!recipe?.servings, language };
}

export type RecipeViewState = ReturnType<typeof useRecipeView>;

type ViewChoice = { servings: number; units: UnitSystem };
const handedOver = new Map<string, ViewChoice>();

/** Pass the cooking view's servings and units back to the recipe page it returns to. */
export function handOverView(slug: string, choice: ViewChoice) {
  handedOver.set(slug, choice);
}

/** The servings and units handed over for this recipe, used once by the page that mounts next. */
export function useHandedOverView(slug: string | undefined) {
  const [choice] = useState(() => (slug ? handedOver.get(slug) : undefined));
  useEffect(() => {
    if (slug) handedOver.delete(slug);
  }, [slug]);
  return choice;
}

const UNIT_OPTIONS: { value: UnitSystem; label: string; short?: string; title: string }[] = [
  { value: "metric", label: "Metric", title: "Grams, millilitres and °C" },
  { value: "us", label: "US", title: "Cups, ounces and °F" },
  { value: "original", label: "Original", short: "Orig.", title: "As written in the recipe" },
];

export function ViewControls({ view, large = false }: { view: RecipeViewState; large?: boolean }) {
  const label = view.hasServings ? (view.servings === 1 ? "serving" : "servings") : "× recipe";
  const size = large ? "h-10" : "h-8";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={cn("bg-card flex items-center rounded-lg border", size)}>
        <button
          type="button"
          onClick={() => view.setServings(stepServings(view.servings, -1))}
          disabled={view.servings <= 0.5}
          className="text-muted-foreground hover:text-foreground flex h-full w-7 items-center justify-center disabled:opacity-40"
          aria-label="Fewer servings"
        >
          <Minus className="size-3.5" />
        </button>
        <span className="min-w-12 text-center text-sm whitespace-nowrap tabular-nums sm:min-w-16" aria-live="polite">
          <span className="font-semibold">{formatNumber(view.servings)}</span> {view.hasServings ? <span className="max-sm:hidden">{label}</span> : label}
          {view.hasServings && <span className="sm:hidden">serv.</span>}
        </span>
        <button
          type="button"
          onClick={() => view.setServings(stepServings(view.servings, 1))}
          className="text-muted-foreground hover:text-foreground flex h-full w-7 items-center justify-center"
          aria-label="More servings"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className={cn("bg-muted flex items-center gap-0.5 rounded-lg p-0.5", size)} role="radiogroup" aria-label="Units">
        {UNIT_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={view.units === o.value}
            title={o.title}
            onClick={() => view.setUnits(o.value)}
            className={cn(
              "h-full rounded-md px-2 text-xs font-medium transition-colors sm:px-2.5",
              view.units === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.short ? (
              <>
                <span className="sm:hidden">{o.short}</span>
                <span className="hidden sm:inline">{o.label}</span>
              </>
            ) : (
              o.label
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

const asWritten = (i: Ingredient, language: LanguageCode) =>
  [formatQuantity(i.quantity, i.quantity_max), unitLabel(i.unit, i.quantity, i.quantity_max, language)].filter(Boolean).join(" ");

export function IngredientLine({
  ingredient,
  view,
  checked,
  onToggle,
  large = false,
}: {
  ingredient: Ingredient;
  view: RecipeViewState;
  checked: boolean;
  onToggle: () => void;
  large?: boolean;
}) {
  const amount = formatAmount(convertAmount(ingredient, view.units, view.scale), view.language);
  const original = asWritten(ingredient, view.language);
  const converted = view.units !== "original" && amount !== formatAmount(convertAmount(ingredient, "original", view.scale), view.language);
  return (
    <li>
      <label className={cn("flex cursor-pointer items-start gap-3", large ? "py-2.5" : "py-1.5")}>
        <Checkbox checked={checked} onChange={onToggle} className={large ? "mt-1 size-5.5" : "mt-0.5"} />
        <span className={cn("leading-snug", checked && "text-muted-foreground line-through")}>
          {amount && (
            <span className="font-semibold" title={converted ? `${original} in the recipe` : undefined}>
              {amount}{" "}
            </span>
          )}
          {ingredient.name}
          {ingredient.note && <span className="text-muted-foreground">, {ingredient.note}</span>}
        </span>
      </label>
    </li>
  );
}
