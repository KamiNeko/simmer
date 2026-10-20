import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, ChefHat, Check, Clock, CookingPot, ExternalLink, Hash, Languages, Loader2, MoreHorizontal, Pencil, RefreshCw, ShoppingBasket, Timer, Trash2, User, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
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
import { IngredientLine, useHandedOverView, useRecipeView, ViewControls } from "@/components/RecipeView";
import { ShareMenu } from "@/components/ShareMenu";
import { RatingBadge } from "@/components/Stars";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, type Recipe } from "@/lib/api";
import { BASE_LANGUAGE, LANGUAGES, type LanguageCode } from "@/lib/languages";
import { renamedSlugs, useRecipe } from "@/lib/queries";
import { useReadingLanguage } from "@/lib/readingLanguage";
import { useAuth } from "@/lib/auth";
import { convertText } from "@/lib/convert";
import { formatNumber } from "@/lib/quantity";
import { formatDate, formatMinutes, relativeDate, sectionHeading } from "@/lib/utils";

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 [&_svg]:size-3.5">
      {icon}
      {children}
    </span>
  );
}

/** Says when the recipe isn't shown in the reader's language, or its translation is outdated, with a button to translate it. */
function TranslationNotice({ recipe, language }: { recipe: Recipe; language: LanguageCode }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const translate = useMutation({
    mutationFn: () => api.translateRecipe(recipe.slug, language),
    onSuccess: (translated) => {
      client.setQueryData(["recipe", recipe.slug, language], translated);
      client.invalidateQueries({ queryKey: ["recipes"] });
      toast.success(`Translated into ${LANGUAGES[language]}`);
    },
  });
  if (language === BASE_LANGUAGE || (recipe.language === language && !recipe.translation_outdated)) return null;
  const name = LANGUAGES[language];
  const message =
    recipe.language === language
      ? `This ${name} translation was made from an older version of the recipe.`
      : `This recipe isn't translated into ${name} yet, so it shows in English.`;
  return (
    <div className="bg-muted/60 text-muted-foreground mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-sm">
      <Languages className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {user && (
        <Button size="sm" variant="outline" onClick={() => translate.mutate()} disabled={translate.isPending}>
          {translate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {translate.isPending ? "Translating…" : recipe.language === language ? "Translate again" : "Translate now"}
        </Button>
      )}
    </div>
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
  const language = useReadingLanguage();
  const recipe = useRecipe(slug, language);
  const view = useRecipeView(recipe.data, useHandedOverView(slug));
  const shopping = useQuery({ queryKey: ["shopping"], queryFn: api.shopping, enabled: !!user });
  const listed = shopping.data?.recipes.find((e) => e.recipe.slug === slug);
  const addToList = useMutation({
    mutationFn: () => api.shoppingPutRecipe(slug!, view.servings),
    onSuccess: (data) => {
      client.setQueryData(["shopping"], data);
      toast.success(listed ? "Shopping list updated" : "Added to your shopping list", {
        action: { label: "Open list", onClick: () => navigate("/shopping") },
      });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteRecipe(slug!),
    onSuccess: () => {
      toast.success("Recipe deleted");
      client.invalidateQueries({ queryKey: ["recipes"] });
      client.invalidateQueries({ queryKey: ["tags"] });
      // The shopping list shows recipes too.
      client.invalidateQueries({ queryKey: ["shopping"] });
      // The recipe's page is gone, so don't leave it in history for Back to find.
      navigate(`/${search}`, { replace: true });
    },
  });

  const renamedTo = slug && renamedSlugs.get(slug);
  if (renamedTo) return <Navigate to={`/recipes/${renamedTo}${search}`} replace />;

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
        <div className="ml-auto flex items-center gap-1">
          <ShareMenu slug={r.slug} />
          {r.can_edit && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/recipes/${r.slug}/edit${search}`} state={{ fromRecipe: true }}>
                <Pencil /> Edit
              </Link>
            </Button>
          )}
          {r.can_edit && (
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
          )}
        </div>
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
          {r.source_language && r.source_language !== BASE_LANGUAGE && r.source_language !== r.language && (
            <Meta icon={<Languages />}>Originally in {LANGUAGES[r.source_language]}</Meta>
          )}
        </div>
        <TranslationNotice recipe={r} language={language} />
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
          {user && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => addToList.mutate()}
              disabled={addToList.isPending || listed?.servings === view.servings}
              title={listed ? `On your shopping list for ${listed.servings} servings` : "Add the ingredients to your shopping list"}
              aria-label={listed ? "On shopping list" : "Add to shopping list"}
            >
              {listed?.servings === view.servings ? <Check /> : <ShoppingBasket />}
              <span className="hidden sm:inline">{listed ? (listed.servings === view.servings ? "On list" : "Update list") : "Add to list"}</span>
            </Button>
          )}
          <Button size="sm" className={user ? "" : "ml-auto"} asChild>
            <Link
              to={`/recipes/${r.slug}/cook?servings=${view.servings}&units=${view.units}`}
              state={{ fromRecipe: true }}
              aria-label="Cooking view"
              title="Cooking view"
            >
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
                const heading = sectionHeading(r.steps, i);
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
