import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, ChefHat, Clock, CookingPot, ExternalLink, Hash, MoreHorizontal, Pencil, Timer, Trash2, User, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CookBar, NotesSection } from "@/components/Journal";
import { IngredientLine, useRecipeView, ViewControls } from "@/components/RecipeView";
import { RatingBadge } from "@/components/Stars";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { convertText } from "@/lib/convert";
import { formatNumber } from "@/lib/quantity";
import { formatDate, formatMinutes, relativeDate } from "@/lib/utils";

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 [&_svg]:size-3.5">
      {icon}
      {children}
    </span>
  );
}

export function RecipeDetail() {
  const { slug } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { user } = useAuth();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const recipe = useQuery({ queryKey: ["recipe", slug], queryFn: () => api.recipe(slug!) });
  const view = useRecipeView(recipe.data);

  const remove = useMutation({
    mutationFn: () => api.deleteRecipe(slug!),
    onSuccess: () => {
      toast.success("Recipe deleted");
      client.invalidateQueries({ queryKey: ["recipes"] });
      client.invalidateQueries({ queryKey: ["tags"] });
      navigate(`/${search}`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (recipe.isLoading) return <div className="text-muted-foreground p-8 text-sm">Loading…</div>;
  if (recipe.isError || !recipe.data)
    return (
      <div className="text-muted-foreground p-8 text-sm">
        Recipe not found. <Link to="/" className="text-primary hover:underline">Back to all recipes</Link>
      </div>
    );

  const r = recipe.data;
  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  let sectionShown = "";

  return (
    <article>
      <div className="flex h-14 items-center gap-2 border-b px-4 md:px-6">
        <Button variant="ghost" size="icon-sm" className="md:hidden" asChild>
          <Link to={`/${search}`} aria-label="Back to list">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {r.tags.map((t) => (
            <Link
              key={t}
              to={`/?tag=${encodeURIComponent(t)}`}
              className="bg-card hover:border-primary/50 flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs"
            >
              <Hash className="text-muted-foreground size-3" /> {t}
            </Link>
          ))}
        </div>
        {r.can_edit && (
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/recipes/${r.slug}/edit${search}`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete recipe
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-5xl px-5 py-8 md:px-12">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{r.title}</h1>
        <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
          <Meta icon={<Clock />}>Updated {relativeDate(r.updated_at)}</Meta>
          <Meta icon={<CalendarDays />}>Created {formatDate(r.created_at)}</Meta>
          {r.author && <Meta icon={<User />}>{r.author.display_name}</Meta>}
          <RatingBadge value={r.avg_rating} count={r.rating_count} />
          {r.cooked_count > 0 && <Meta icon={<ChefHat />}>Cooked {r.cooked_count}×</Meta>}
          {r.servings && <Meta icon={<Users />}>{formatNumber(r.servings)} servings</Meta>}
          {(r.total_minutes || r.prep_minutes || r.cook_minutes) && (
            <Meta icon={<Timer />}>
              {[
                r.prep_minutes && `Prep ${formatMinutes(r.prep_minutes)}`,
                r.cook_minutes && `Cook ${formatMinutes(r.cook_minutes)}`,
                r.total_minutes && `Total ${formatMinutes(r.total_minutes)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Meta>
          )}
          {r.source_url && (
            <a href={r.source_url} target="_blank" rel="noreferrer" className="hover:text-foreground">
              <Meta icon={<ExternalLink />}>{new URL(r.source_url).hostname.replace(/^www\./, "")}</Meta>
            </a>
          )}
        </div>
        {r.photo_url && (
          <img src={r.photo_url} alt="" className="mt-6 max-h-[420px] w-full rounded-xl border object-cover" />
        )}
        {user && (
          <div className="mt-6">
            <CookBar recipe={r} />
          </div>
        )}
        <hr className="my-6" />

        {r.description && <p className="text-foreground/90 mb-8 max-w-3xl leading-relaxed whitespace-pre-line">{r.description}</p>}

        <div className="bg-panel/95 sticky top-0 z-10 -mx-5 mb-6 flex flex-wrap items-center gap-2 border-b px-5 py-2.5 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <ViewControls view={view} />
          <Button size="sm" className="ml-auto" asChild>
            <Link to={`/recipes/${r.slug}/cook?servings=${view.servings}&units=${view.units}`} aria-label="Cooking view" title="Cooking view">
              <CookingPot /> <span className="hidden sm:inline">Cook</span>
            </Link>
          </Button>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section>
            <h2 className="mb-3 text-lg font-bold">Ingredients</h2>
            {r.groups.length === 0 && <p className="text-muted-foreground text-sm">No ingredients yet.</p>}
            <div className="space-y-5">
              {r.groups.map((group, gi) => (
                <div key={group.id ?? gi}>
                  {group.name && (
                    <h3 className="text-primary mb-1 text-xs font-semibold tracking-wider uppercase">{group.name}</h3>
                  )}
                  <ul>
                    {group.ingredients.map((ingredient, ii) => (
                      <IngredientLine
                        key={ingredient.id ?? ii}
                        ingredient={ingredient}
                        view={view}
                        checked={checked.has(`${gi}-${ii}`)}
                        onToggle={() => toggle(`${gi}-${ii}`)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">Instructions</h2>
            {r.steps.length === 0 && <p className="text-muted-foreground text-sm">No steps yet.</p>}
            <ol className="space-y-5">
              {r.steps.map((step, i) => {
                const heading = step.section && step.section !== sectionShown ? step.section : null;
                sectionShown = step.section;
                return (
                  <li key={step.id ?? i}>
                    {heading && (
                      <h3 className="text-primary mb-2 text-xs font-semibold tracking-wider uppercase">{heading}</h3>
                    )}
                    <div className="flex gap-4">
                      <span className="bg-primary/15 text-primary flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold">
                        {i + 1}
                      </span>
                      <p className="pt-0.5 leading-relaxed whitespace-pre-line">{convertText(step.text, view.units)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
        {user && <NotesSection slug={r.slug} />}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{r.title}”?</AlertDialogTitle>
            <AlertDialogDescription>This removes the recipe for everyone and cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
