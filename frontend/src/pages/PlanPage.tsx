import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CookingPot, Minus, MoreHorizontal, MoveRight, Plus, ShoppingBasket, StickyNote, Trash2, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { PlanDialog } from "@/components/PlanDialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, type PlanEntry } from "@/lib/api";
import { addDays, dayMonth, shortDay, today, weekday, weekDays, weekLabel, weekStart } from "@/lib/dates";
import { formatNumber } from "@/lib/quantity";
import { cn } from "@/lib/utils";

import { PageFrame } from "./PageFrame";

const VALID_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Whole servings, with halves below two (as on the recipe page). */
const step = (value: number, direction: 1 | -1) =>
  Math.max(0.5, Math.round((value + direction * ((direction === 1 ? value < 2 : value <= 2) ? 0.5 : 1)) * 2) / 2);

function ServingsStepper({ title, servings, perServing, onChange, className }: { title: string; servings: number; perServing: boolean; onChange: (servings: number) => void; className?: string }) {
  return (
    <div className={cn("text-muted-foreground flex items-center rounded-lg border", className)}>
      <button type="button" className="hover:text-foreground p-1.5 disabled:opacity-40" disabled={servings <= 0.5} onClick={() => onChange(step(servings, -1))} aria-label={`Fewer servings of ${title}`}>
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-12 text-center text-xs tabular-nums">{perServing ? `${formatNumber(servings)} serv.` : `× ${formatNumber(servings)}`}</span>
      <button type="button" className="hover:text-foreground p-1.5" onClick={() => onChange(step(servings, 1))} aria-label={`More servings of ${title}`}>
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function EntryRow({ entry, days, onChange, onRemove }: { entry: PlanEntry; days: string[]; onChange: (data: { day?: string; servings?: number }) => void; onRemove: () => void }) {
  const r = entry.recipe;
  const servings = entry.servings ?? r?.servings ?? 1;
  const otherDays = days.filter((d) => d !== entry.day);
  const stepper = (className: string) =>
    r && <ServingsStepper title={r.title} servings={servings} perServing={!!r.servings} onChange={(value) => onChange({ servings: value })} className={className} />;
  return (
    <li className="group flex items-center gap-3 py-2">
      {r ? (
        r.thumb_url ? (
          <img src={r.thumb_url} alt="" className="size-11 shrink-0 rounded-lg border object-cover" />
        ) : (
          <span className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-lg border">
            <UtensilsCrossed className="text-muted-foreground size-4" />
          </span>
        )
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-dashed">
          <StickyNote className="text-muted-foreground size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {r ? (
          <Link to={`/recipes/${r.slug}`} className="block truncate font-medium hover:underline">
            {r.title}
          </Link>
        ) : (
          <p className="text-foreground/90 truncate italic">{entry.note}</p>
        )}
        {entry.added_by && <p className="text-muted-foreground hidden truncate text-xs sm:block">Added by {entry.added_by.display_name}</p>}
        {stepper("mt-1 w-fit sm:hidden")}
      </div>
      {stepper("hidden sm:flex")}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Options for ${r?.title ?? entry.note}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {r && (
            <>
              <DropdownMenuItem asChild>
                <Link to={`/recipes/${r.slug}/cook?servings=${servings}`}>
                  <CookingPot /> Cook
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Move to</DropdownMenuLabel>
          {otherDays.map((d) => (
            <DropdownMenuItem key={d} onSelect={() => onChange({ day: d })}>
              <MoveRight /> {d === addDays(entry.day, 7) ? `Next week (${shortDay(d)})` : shortDay(d)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onRemove}>
            <Trash2 /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function PlanPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get("week");
  const start = weekStart(requested && VALID_DAY.test(requested) ? requested : today());
  const end = addDays(start, 6);
  const days = weekDays(start);
  const plan = useQuery({ queryKey: ["plan", start], queryFn: () => api.plan(start, end) });
  const [adding, setAdding] = useState(false);
  const [addingTo, setAddingTo] = useState(today());

  const refresh = () => client.invalidateQueries({ queryKey: ["plan"] });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { day?: string; servings?: number } }) => api.planUpdate(id, data),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({ mutationFn: api.planDelete, onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const toShopping = useMutation({
    mutationFn: () => api.planToShopping(start, end),
    onSuccess: (data) => {
      client.setQueryData(["shopping"], data);
      toast.success("The week's recipes are on your shopping list", { action: { label: "Open list", onClick: () => navigate("/shopping") } });
    },
    onError: (e) => toast.error(e.message),
  });

  const go = (week: string) => setParams(week === weekStart(today()) ? {} : { week });
  const entries = plan.data ?? [];
  const hasRecipes = entries.some((e) => e.recipe);
  const now = today();

  return (
    <PageFrame
      title="Meal plan"
      actions={
        <Button variant="ghost" size="sm" onClick={() => toShopping.mutate()} disabled={!hasRecipes || toShopping.isPending} title="Add this week's recipes to your shopping list">
          <ShoppingBasket /> <span className="hidden sm:inline">Add week to shopping list</span>
          <span className="sm:hidden">To list</span>
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => go(addDays(start, -7))} aria-label="Previous week">
          <ChevronLeft />
        </Button>
        <h2 className="min-w-36 text-center font-semibold tabular-nums">{weekLabel(start)}</h2>
        <Button variant="outline" size="icon-sm" onClick={() => go(addDays(start, 7))} aria-label="Next week">
          <ChevronRight />
        </Button>
        {start !== weekStart(now) && (
          <Button variant="ghost" size="sm" onClick={() => go(weekStart(now))}>
            This week
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {days.map((day) => {
          const items = entries.filter((e) => e.day === day);
          const isToday = day === now;
          return (
            <section key={day} className={cn("bg-card rounded-xl border px-4 py-3", isToday && "border-primary/60", day < now && "opacity-70")} aria-label={`${weekday(day)} ${dayMonth(day)}`}>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{weekday(day)}</h3>
                <span className="text-muted-foreground text-sm">{dayMonth(day)}</span>
                {isToday && <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase">Today</span>}
                <Button variant="ghost" size="sm" className="text-muted-foreground ml-auto" onClick={() => {
                    setAddingTo(day);
                    setAdding(true);
                  }} aria-label={`Add to ${weekday(day)}`}>
                  <Plus /> Add
                </Button>
              </div>
              {items.length > 0 && (
                <ul className="divide-y">
                  {items.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      days={[...days, addDays(entry.day, 7)]}
                      onChange={(data) => update.mutate({ id: entry.id, data })}
                      onRemove={() => remove.mutate(entry.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <PlanDialog open={adding} onOpenChange={setAdding} day={addingTo} />
    </PageFrame>
  );
}
