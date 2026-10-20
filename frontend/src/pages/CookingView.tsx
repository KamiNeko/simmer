import { ChevronLeft, ChevronRight, Sun, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { handOverView, IngredientLine, useRecipeView, ViewControls } from "@/components/RecipeView";
import { Button } from "@/components/ui/button";
import type { UnitSystem } from "@/lib/api";
import { useRecipe } from "@/lib/queries";
import { useReadingLanguage } from "@/lib/readingLanguage";
import { convertText } from "@/lib/convert";
import { cn, sectionHeading } from "@/lib/utils";

/** Keep the screen on while cooking, where the browser supports it. */
function useWakeLock() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          sentinel.release();
          return;
        }
        setActive(true);
        sentinel.addEventListener("release", () => setActive(false));
      } catch {
        setActive(false);
      }
    };
    // The lock drops when the tab is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      sentinel?.release();
    };
  }, []);
  return active;
}

const UNITS: UnitSystem[] = ["metric", "us", "original"];

export function CookingView() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fromRecipe = !!(useLocation().state as { fromRecipe?: boolean } | null)?.fromRecipe;
  const recipe = useRecipe(slug, useReadingLanguage());
  const servingsParam = Number(params.get("servings"));
  const unitsParam = params.get("units") as UnitSystem | null;
  const view = useRecipeView(recipe.data, {
    servings: servingsParam > 0 ? servingsParam : undefined,
    units: unitsParam && UNITS.includes(unitsParam) ? unitsParam : undefined,
  });
  const [current, setCurrent] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"ingredients" | "steps">("steps");
  const awake = useWakeLock();
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const steps = recipe.data?.steps ?? [];

  const go = (index: number) => setCurrent(Math.min(Math.max(index, 0), Math.max(steps.length - 1, 0)));

  useEffect(() => {
    stepRefs.current[current]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        setCurrent((c) => Math.min(c + 1, steps.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setCurrent((c) => Math.max(c - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length]);

  if (recipe.isLoading) return <div className="text-muted-foreground p-8 text-sm">Loading…</div>;
  if (!recipe.data) return <div className="text-muted-foreground p-8 text-sm">Recipe not found.</div>;
  const r = recipe.data;

  // Return to the recipe with the servings and units chosen here, going back rather than adding history.
  const leave = () => {
    handOverView(r.slug, { servings: view.servings, units: view.units });
    if (fromRecipe) navigate(-1);
    else navigate(`/recipes/${r.slug}`, { replace: true });
  };

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="bg-panel flex h-full flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3 md:px-6">
        <Button variant="ghost" size="icon" asChild>
          <Link
            to={`/recipes/${r.slug}`}
            onClick={(e) => {
              e.preventDefault();
              leave();
            }}
            aria-label="Leave cooking view"
          >
            <X />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold md:text-xl">{r.title}</h1>
        {awake && (
          <span className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex" title="The screen stays on while this view is open">
            <Sun className="size-3.5" /> Screen stays on
          </span>
        )}
      </header>

      <div className="flex items-center gap-2 border-b px-4 py-2 md:px-6">
        <ViewControls view={view} large />
      </div>

      <div className="flex border-b md:hidden" role="tablist">
        {(["ingredients", "steps"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold capitalize",
              tab === t ? "border-primary text-foreground border-b-2" : "text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className={cn("overflow-y-auto border-r px-5 py-5 text-lg md:block md:px-8", tab === "ingredients" ? "block" : "hidden")}>
          <h2 className="mb-2 hidden text-sm font-semibold tracking-wider uppercase md:block">Ingredients</h2>
          <div className="space-y-5">
            {r.groups.map((group, gi) => (
              <div key={group.id ?? gi}>
                {group.name && <h3 className="text-primary mb-1 text-sm font-semibold tracking-wider uppercase">{group.name}</h3>}
                <ul>
                  {group.ingredients.map((ingredient, ii) => (
                    <IngredientLine
                      key={ingredient.id ?? ii}
                      ingredient={ingredient}
                      view={view}
                      large
                      checked={checked.has(`${gi}-${ii}`)}
                      onToggle={() => toggle(`${gi}-${ii}`)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className={cn("overflow-y-auto px-5 py-5 md:block md:px-8", tab === "steps" ? "block" : "hidden")}>
          <h2 className="mb-2 hidden text-sm font-semibold tracking-wider uppercase md:block">Steps</h2>
          <ol className="space-y-3 pb-24">
            {steps.map((step, i) => {
              const heading = sectionHeading(steps, i);
              const active = i === current;
              return (
                <li key={step.id ?? i} ref={(el) => void (stepRefs.current[i] = el)}>
                  {heading && <h3 className="text-primary mt-4 mb-2 text-sm font-semibold tracking-wider uppercase">{heading}</h3>}
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex w-full gap-4 rounded-xl border p-4 text-left transition-colors",
                      // Dim other steps with a muted colour rather than opacity, which would push them below readable contrast.
                      active ? "border-primary bg-primary/10" : "text-muted-foreground hover:text-foreground border-transparent",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-semibold",
                        active ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-xl leading-relaxed whitespace-pre-line md:text-2xl">{convertText(step.text, view.units)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {steps.length > 0 && (
        <footer className="bg-panel flex items-center gap-3 border-t px-4 py-3 md:px-6">
          <Button variant="outline" size="lg" onClick={() => go(current - 1)} disabled={current === 0}>
            <ChevronLeft /> Back
          </Button>
          <span className="text-muted-foreground flex-1 text-center font-mono text-sm">
            Step {current + 1} of {steps.length}
          </span>
          <Button
            size="lg"
            onClick={() => {
              go(current + 1);
              setTab("steps");
            }}
            disabled={current >= steps.length - 1}
          >
            Next <ChevronRight />
          </Button>
        </footer>
      )}
    </div>
  );
}
