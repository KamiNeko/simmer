import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp, Check, ChefHat, Download, Plus, Search, UtensilsCrossed } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { RatingBadge } from "@/components/Stars";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, formatMinutes, relativeDate } from "@/lib/utils";

const SORTS = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Newest first" },
  { value: "title", label: "Title A–Z" },
  { value: "rating", label: "Top rated" },
  { value: "cooked", label: "Most cooked" },
  { value: "last_cooked", label: "Last cooked by me", needsUser: true },
];

export function RecipeList() {
  const { user } = useAuth();
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("");
  const tag = params.get("tag") ?? undefined;
  const q = params.get("q") ?? undefined;
  // Visitors have no recipes of their own, so they see them all.
  const mine = params.get("mine") === "1" && !!user;
  const sortParam = params.get("sort") ?? undefined;
  const sort = sortParam ?? (q ? "relevance" : "updated");

  const recipes = useQuery({
    queryKey: ["recipes", { q, tag, mine, sort: sortParam, userId: user?.id }],
    queryFn: () => api.recipes({ q, tag, sort: sortParam, author: mine ? user?.id : undefined }),
  });

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = recipes.data ?? [];
    return needle ? list.filter((r) => `${r.title} ${r.ingredient_preview}`.toLowerCase().includes(needle)) : list;
  }, [recipes.data, filter]);

  const heading = q ? `“${q}”` : tag ? tag : mine ? "My Recipes" : "All Recipes";
  const subtitle = q ? "Search results" : tag ? "Tagged recipes" : mine ? "Added by you" : "Recipe collection";
  const query = params.toString() ? `?${params}` : "";

  const setSort = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === (q ? "relevance" : "updated")) next.delete("sort");
    else next.set("sort", value);
    setParams(next, { replace: true });
  };

  return (
    <>
      <div className="space-y-3 border-b p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{heading}</h2>
            <p className="text-muted-foreground text-xs">{subtitle}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground font-mono text-[11px]">
              {visible.length} {visible.length === 1 ? "recipe" : "recipes"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Sort">
                  <ArrowDownUp />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {[...(q ? [{ value: "relevance", label: "Best match" }] : []), ...SORTS]
                  .filter((s) => !("needsUser" in s) || user)
                  .map((s) => (
                    <DropdownMenuItem key={s.value} onSelect={() => setSort(s.value)}>
                      <Check className={cn(sort !== s.value && "opacity-0")} /> {s.label}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {user && (
              <Button size="icon-sm" variant="outline" asChild>
                <Link to="/import" title="Import recipe" aria-label="Import recipe">
                  <Download />
                </Link>
              </Button>
            )}
            {user && (
              <Button size="sm" asChild>
                <Link to="/new">
                  <Plus /> New
                </Link>
              </Button>
            )}
          </div>
        </div>
        <label className="bg-background/60 text-muted-foreground focus-within:border-ring flex h-9 items-center gap-2 rounded-lg border px-3 text-sm">
          <Search className="size-4 shrink-0" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter this list…"
            className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {recipes.isLoading && <p className="text-muted-foreground p-3 text-sm">Loading…</p>}
        {recipes.isSuccess && visible.length === 0 && (
          <div className="text-muted-foreground p-6 text-center text-sm">
            <UtensilsCrossed className="mx-auto mb-2 size-6 opacity-60" />
            {recipes.data.length ? "Nothing matches this filter." : q || tag || mine ? "No recipes match." : "No recipes yet."}
          </div>
        )}
        {visible.map((recipe) => {
          const active = recipe.slug === slug;
          const time = formatMinutes(recipe.total_minutes);
          return (
            <Link
              key={recipe.id}
              to={`/recipes/${recipe.slug}${query}`}
              className={cn(
                "block rounded-xl border border-transparent p-3.5 transition-colors",
                active ? "bg-card border-border border-l-primary border-l-[3px] shadow-sm" : "hover:bg-card/60",
              )}
            >
              <div className="flex items-start gap-2.5">
                <UtensilsCrossed className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate text-[15px] font-semibold">{recipe.title}</h3>
                    <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                      {relativeDate(recipe.updated_at)}
                    </span>
                  </div>
                  {recipe.ingredient_preview && (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-[13px] leading-relaxed">
                      {recipe.ingredient_preview}
                    </p>
                  )}
                  {(time || recipe.tags.length > 0 || recipe.avg_rating !== null || recipe.cooked_count > 0) && (
                    <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <RatingBadge value={recipe.avg_rating} count={recipe.rating_count} className="mr-1" />
                      {recipe.cooked_count > 0 && (
                        <span className="mr-1 inline-flex items-center gap-1">
                          <ChefHat className="size-3" /> {recipe.cooked_count}×
                        </span>
                      )}
                      {time && <span className="font-mono">{time}</span>}
                      {recipe.tags.slice(0, 3).map((t) => (
                        <span key={t} className="bg-muted rounded px-1.5 py-0.5">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {recipe.thumb_url && (
                  <img src={recipe.thumb_url} alt="" loading="lazy" className="size-16 shrink-0 rounded-lg border object-cover" />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
