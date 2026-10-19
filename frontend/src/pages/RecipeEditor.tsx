import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, RotateCcw, Save, Sparkles, TriangleAlert, X } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { GroupEditor } from "@/components/editor/GroupEditor";
import { type PhotoChange, PhotoField } from "@/components/editor/PhotoField";
import { SortableItem, SortableList } from "@/components/editor/Sortable";
import { TagInput } from "@/components/editor/TagInput";
import { draftFromRecipe, emptyRow, type RecipeDraft, toInput, uid } from "@/components/editor/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useRecipe } from "@/lib/queries";

import { type ImportState, ProviderSelect, providerParam } from "./ImportPage";

function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className="text-muted-foreground mb-1.5 text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function RecipeEditor() {
  const { slug } = useParams();
  const { search, state } = useLocation();
  const imported = (state as { imported?: ImportState } | null)?.imported;
  const navigate = useNavigate();
  const client = useQueryClient();
  const existing = useRecipe(slug);
  const tags = useQuery({ queryKey: ["tags"], queryFn: api.tags });
  const providers = useQuery({ queryKey: ["ai-providers"], queryFn: api.aiProviders });
  const [draft, setDraft] = useState<RecipeDraft | null>(slug ? null : draftFromRecipe(imported?.result.recipe));
  const [errors, setErrors] = useState<string[]>([]);
  const [photo, setPhoto] = useState<PhotoChange>(
    imported?.result.image_url ? { kind: "url", url: imported.result.image_url } : { kind: "keep" },
  );
  const [importInfo, setImportInfo] = useState(imported);
  const [showSource, setShowSource] = useState(!!imported);
  const [retryProvider, setRetryProvider] = useState("default");
  const hasAI = (providers.data?.length ?? 0) > 0;

  /** Replace the draft with an AI result, keeping the old one a click away. */
  const replaceDraft = (next: RecipeDraft, message: string) => {
    const previous = draft;
    setDraft(next);
    setShowSource(true);
    toast.success(message, previous ? { action: { label: "Undo", onClick: () => setDraft(previous) } } : undefined);
  };

  const tidy = useMutation({
    mutationFn: (input: NonNullable<ReturnType<typeof toInput>["input"]>) => api.tidy(input),
    onSuccess: (recipe) => replaceDraft(draftFromRecipe(recipe), "Tidied up. Check the result before saving."),
  });
  const reimport = useMutation({
    mutationFn: (provider: string) => {
      const request = { ...importInfo!.request, provider: providerParam(provider) };
      return api.importRecipe(request).then((result) => ({ request, result }));
    },
    onSuccess: (next: ImportState) => {
      setImportInfo(next);
      replaceDraft(draftFromRecipe(next.result.recipe), "Imported again");
    },
  });

  // Fill the form once the recipe has loaded (set during render, so no empty frame shows).
  if (existing.data && !draft) setDraft(draftFromRecipe(existing.data));

  const save = useMutation({
    mutationFn: async (input: ReturnType<typeof toInput>["input"] & object) => {
      let recipe = slug ? await api.updateRecipe(slug, input) : await api.createRecipe(input);
      try {
        if (photo.kind === "replace") recipe = await api.uploadPhoto(recipe.slug, photo.file);
        if (photo.kind === "url") recipe = await api.photoFromUrl(recipe.slug, photo.url);
        if (photo.kind === "remove" && recipe.photo_url) recipe = await api.deletePhoto(recipe.slug);
      } catch (e) {
        toast.error(`Recipe saved, but the photo failed: ${(e as Error).message}`);
      }
      return recipe;
    },
    onSuccess: (recipe) => {
      client.invalidateQueries({ queryKey: ["recipes"] });
      client.invalidateQueries({ queryKey: ["tags"] });
      client.setQueryData(["recipe", recipe.slug], recipe);
      toast.success(slug ? "Recipe saved" : "Recipe added");
      navigate(`/recipes/${recipe.slug}${search}`, { replace: true });
    },
    onError: (e) => setErrors([e.message]),
  });

  if (slug && existing.isError) return <div className="text-muted-foreground p-8 text-sm">Recipe not found.</div>;
  if (slug && existing.data && !existing.data.can_edit)
    return <div className="text-muted-foreground p-8 text-sm">You can only edit your own recipes.</div>;
  if (!draft) return <div className="text-muted-foreground p-8 text-sm">Loading…</div>;

  const set = <K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]) => setDraft({ ...draft, [key]: value });
  const cancelTo = slug ? `/recipes/${slug}${search}` : `/${search}`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: problems } = toInput(draft);
    setErrors(problems);
    if (input) save.mutate(input);
  };

  const runTidy = () => {
    const { input, errors: problems } = toInput(draft);
    setErrors(problems);
    if (input) tidy.mutate(input);
  };

  const moveGroup = (index: number, direction: -1 | 1) => {
    const groups = [...draft.groups];
    [groups[index], groups[index + direction]] = [groups[index + direction], groups[index]];
    set("groups", groups);
  };

  return (
    <form onSubmit={submit}>
      <div className="bg-panel/95 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur md:px-6">
        <h1 className="font-semibold">{slug ? "Edit recipe" : importInfo ? "Review import" : "New recipe"}</h1>
        <div className="ml-auto flex gap-2">
          {hasAI && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runTidy}
              disabled={tidy.isPending}
              title="Split ingredient lines into fields, suggest groups and add densities"
            >
              {tidy.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Tidy up
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link to={cancelTo}>
              <X /> Cancel
            </Link>
          </Button>
          <Button type="submit" size="sm" disabled={save.isPending}>
            <Save /> Save
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-8 px-5 py-8 md:px-10">
        {importInfo && <ImportBanner info={importInfo} />}
        {importInfo && hasAI && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Doesn't look right? Import again with</span>
            <ProviderSelect
              providers={providers.data!}
              value={retryProvider}
              onChange={setRetryProvider}
              allowNone={!!importInfo.request.url}
              className="h-8 w-60"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => reimport.mutate(retryProvider)} disabled={reimport.isPending}>
              {reimport.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Import again
            </Button>
          </div>
        )}
        {errors.length > 0 && (
          <ul aria-label="Problems" className="border-destructive/40 bg-destructive/10 text-destructive space-y-1 rounded-lg border p-3 text-sm">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <section className="space-y-4">
          <input
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Recipe title"
            aria-label="Title"
            className="placeholder:text-muted-foreground/60 w-full bg-transparent text-3xl font-extrabold tracking-tight outline-none md:text-4xl"
            autoFocus={!slug}
          />
          <Textarea aria-label="Description" value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Short description (optional)" rows={2} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Servings" htmlFor="recipe-servings">
              <Input id="recipe-servings" inputMode="decimal" value={draft.servings} onChange={(e) => set("servings", e.target.value)} placeholder="4" />
            </Field>
            <Field label="Prep (min)" htmlFor="recipe-prep-minutes">
              <Input id="recipe-prep-minutes" inputMode="numeric" value={draft.prep_minutes} onChange={(e) => set("prep_minutes", e.target.value)} />
            </Field>
            <Field label="Cook (min)" htmlFor="recipe-cook-minutes">
              <Input id="recipe-cook-minutes" inputMode="numeric" value={draft.cook_minutes} onChange={(e) => set("cook_minutes", e.target.value)} />
            </Field>
            <Field label="Total (min)" htmlFor="recipe-total-minutes">
              <Input id="recipe-total-minutes" inputMode="numeric" value={draft.total_minutes} onChange={(e) => set("total_minutes", e.target.value)} />
            </Field>
          </div>
          <Field label="Photo">
            <PhotoField current={existing.data?.photo_url ?? null} value={photo} onChange={setPhoto} />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tags" htmlFor="recipe-tags">
              <TagInput id="recipe-tags" value={draft.tags} onChange={(t) => set("tags", t)} suggestions={tags.data?.map((t) => t.name) ?? []} />
            </Field>
            <Field label="Source URL" htmlFor="recipe-source-url">
              <Input id="recipe-source-url" type="url" value={draft.source_url} onChange={(e) => set("source_url", e.target.value)} placeholder="https://…" />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Ingredients</h2>
          {draft.groups.map((group, i) => (
            <GroupEditor
              key={group.key}
              group={group}
              isFirst={i === 0}
              isLast={i === draft.groups.length - 1}
              showSource={showSource}
              onMove={(d) => moveGroup(i, d)}
              onChange={(g) => set("groups", draft.groups.map((x) => (x.key === g.key ? g : x)))}
              onRemove={() => set("groups", draft.groups.filter((x) => x.key !== group.key))}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => set("groups", [...draft.groups, { key: uid(), name: "", rows: [emptyRow()] }])}
          >
            <Plus /> Ingredient group
          </Button>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Instructions</h2>
          <SortableList items={draft.steps} onChange={(steps) => set("steps", steps)}>
            <div className="space-y-3">
              {draft.steps.map((step, i) => (
                <SortableItem key={step.key} id={step.key}>
                  <div className="bg-card flex gap-3 rounded-xl border p-3">
                    <span className="bg-primary/15 text-primary mt-1 flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold">
                      {i + 1}
                    </span>
                    <div className="flex-1 space-y-2">
                      <Input
                        value={step.section}
                        onChange={(e) => set("steps", draft.steps.map((s) => (s.key === step.key ? { ...s, section: e.target.value } : s)))}
                        placeholder="Section (optional), e.g. Make the sauce"
                        className="h-8 text-xs"
                      />
                      <Textarea
                        value={step.text}
                        onChange={(e) => set("steps", draft.steps.map((s) => (s.key === step.key ? { ...s, text: e.target.value } : s)))}
                        placeholder="Describe this step"
                        rows={2}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => set("steps", draft.steps.filter((s) => s.key !== step.key))}
                      aria-label="Remove step"
                    >
                      <X />
                    </Button>
                  </div>
                </SortableItem>
              ))}
            </div>
          </SortableList>
          <Button type="button" variant="outline" size="sm" onClick={() => set("steps", [...draft.steps, { key: uid(), section: "", text: "" }])}>
            <Plus /> Step
          </Button>
        </section>
      </div>
    </form>
  );
}

function ImportBanner({ info }: { info: ImportState }) {
  const { result, request } = info;
  let site = request.photos ? `your ${request.photos.length === 1 ? "photo" : "photos"}` : "the pasted text";
  if (request.url) {
    try {
      site = new URL(request.url).hostname.replace(/^www\./, "");
    } catch {
      site = request.url;
    }
  }
  const how = result.provider ? `with ${result.model}` : "from the page's recipe data";
  return (
    <div className="space-y-2">
      <p className="border-primary/30 bg-primary/10 rounded-lg border p-3 text-sm">
        Imported from <span className="font-medium">{site}</span> {how}. Compare the ingredients with their source lines, then save.
      </p>
      {result.warning && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {result.warning}
        </p>
      )}
    </div>
  );
}
