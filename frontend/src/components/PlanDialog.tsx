import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, StickyNote, UtensilsCrossed } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type RecipeSummary } from "@/lib/api";
import { addDays, relativeDay, shortDay, today, weekStart } from "@/lib/dates";
import { cn } from "@/lib/utils";

const dayName = (d: string) => (d === today() ? "today" : d === addDays(today(), 1) ? "tomorrow" : shortDay(d));

/** Add a recipe or a note to a day of the meal plan. Opened from the planner (day fixed) or a recipe (recipe fixed). */
export function PlanDialog({
  open,
  onOpenChange,
  day: fixedDay,
  recipe: fixedRecipe,
  servings: initialServings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day?: string;
  recipe?: RecipeSummary;
  servings?: number;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"recipe" | "note">("recipe");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<RecipeSummary | null>(null);
  const [note, setNote] = useState("");
  const [pickedDay, setDay] = useState(today());
  const day = fixedDay ?? pickedDay;
  const [servings, setServings] = useState("");
  const recipe = fixedRecipe ?? picked;
  const fallback = fixedRecipe ? initialServings : recipe?.servings;
  const shownServings = servings || (fallback ? String(fallback) : "");
  const results = useQuery({
    queryKey: ["recipes", { q: query }],
    queryFn: () => api.recipes({ q: query }),
    enabled: open && !fixedRecipe && mode === "recipe",
  });

  const reset = () => {
    setMode("recipe");
    setQuery("");
    setPicked(null);
    setNote("");
    setServings("");
    setDay(today());
  };

  const add = useMutation({
    mutationFn: () =>
      api.planAdd(
        mode === "note"
          ? { day, note: note.trim() }
          : { day, recipe: recipe!.slug, servings: Number(shownServings) > 0 ? Number(shownServings) : undefined },
      ),
    onSuccess: (entry) => {
      client.invalidateQueries({ queryKey: ["plan"] });
      onOpenChange(false);
      reset();
      if (fixedRecipe)
        toast.success(`Planned for ${dayName(entry.day)}`, {
          action: { label: "Open plan", onClick: () => navigate(`/plan?week=${weekStart(entry.day)}`) },
        });
    },
  });

  const pick = (r: RecipeSummary) => {
    setPicked(r);
    setServings(r.servings ? String(r.servings) : "");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };

  // Today and the next two weeks.
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i));
  const canSubmit = mode === "note" ? !!note.trim() : !!recipe;

  const tab = (value: "recipe" | "note", icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors [&_svg]:size-4",
        mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon} {label}
    </button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) reset();
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="grid min-w-0 gap-4">
          <DialogHeader>
            <DialogTitle>{fixedRecipe ? `Plan ${fixedRecipe.title}` : `Add to ${shortDay(day)}`}</DialogTitle>
            <DialogDescription>Everyone in the household sees the meal plan.</DialogDescription>
          </DialogHeader>

          {!fixedRecipe && (
            <div className="bg-muted flex gap-1 rounded-lg p-1">
              {tab("recipe", <UtensilsCrossed />, "Recipe")}
              {tab("note", <StickyNote />, "Note")}
            </div>
          )}

          {mode === "note" ? (
            <div className="space-y-2">
              <Label htmlFor="plan-note">Note</Label>
              <Input id="plan-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Leftovers, eating out" maxLength={200} autoFocus />
            </div>
          ) : (
            !fixedRecipe && (
              <div className="min-w-0 space-y-2">
                <div className="relative">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes" aria-label="Search recipes" className="pl-9" autoFocus />
                </div>
                <ul className="max-h-64 overflow-y-auto rounded-lg border" role="listbox" aria-label="Recipes">
                  {results.data?.slice(0, 30).map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={picked?.id === r.id}
                        onClick={() => pick(r)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                          picked?.id === r.id ? "bg-primary/15 text-foreground" : "hover:bg-muted",
                        )}
                      >
                        {r.thumb_url ? (
                          <img src={r.thumb_url} alt="" className="size-8 shrink-0 rounded object-cover" />
                        ) : (
                          <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded">
                            <UtensilsCrossed className="text-muted-foreground size-4" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                      </button>
                    </li>
                  ))}
                  {results.data?.length === 0 && <li className="text-muted-foreground px-3 py-4 text-center text-sm">No recipes found.</li>}
                </ul>
              </div>
            )
          )}

          <div className="flex flex-wrap gap-3">
            {!fixedDay && (
              <div className="flex-1 space-y-2">
                <Label>Day</Label>
                <Select value={day} onValueChange={setDay}>
                  <SelectTrigger className="w-full" aria-label="Day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {days.map((d) => (
                      <SelectItem key={d} value={d}>
                        {relativeDay(d) === shortDay(d) ? shortDay(d) : `${relativeDay(d)} · ${shortDay(d)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {mode === "recipe" && recipe && (
              <div className="w-32 space-y-2">
                <Label htmlFor="plan-servings">{recipe.servings ? "Servings" : "Times the recipe"}</Label>
                <Input
                  id="plan-servings"
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={shownServings}
                  onChange={(e) => setServings(e.target.value)}
                  placeholder="1"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!canSubmit || add.isPending}>
              {mode === "recipe" && !recipe ? "Pick a recipe" : "Add to plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
