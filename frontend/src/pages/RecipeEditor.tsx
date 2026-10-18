import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { GroupEditor } from "@/components/editor/GroupEditor";
import { SortableItem, SortableList } from "@/components/editor/Sortable";
import { TagInput } from "@/components/editor/TagInput";
import { draftFromRecipe, emptyRow, type RecipeDraft, toInput, uid } from "@/components/editor/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-muted-foreground mb-1.5 text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function RecipeEditor() {
  const { slug } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const existing = useQuery({ queryKey: ["recipe", slug], queryFn: () => api.recipe(slug!), enabled: !!slug });
  const tags = useQuery({ queryKey: ["tags"], queryFn: api.tags });
  const [draft, setDraft] = useState<RecipeDraft | null>(slug ? null : draftFromRecipe());
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (existing.data && !draft) setDraft(draftFromRecipe(existing.data));
  }, [existing.data, draft]);

  const save = useMutation({
    mutationFn: (input: ReturnType<typeof toInput>["input"] & object) =>
      slug ? api.updateRecipe(slug, input) : api.createRecipe(input),
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
    const { input, errors } = toInput(draft);
    setErrors(errors);
    if (input) save.mutate(input);
  };

  const moveGroup = (index: number, direction: -1 | 1) => {
    const groups = [...draft.groups];
    [groups[index], groups[index + direction]] = [groups[index + direction], groups[index]];
    set("groups", groups);
  };

  return (
    <form onSubmit={submit}>
      <div className="bg-panel/95 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur md:px-6">
        <h1 className="font-semibold">{slug ? "Edit recipe" : "New recipe"}</h1>
        <div className="ml-auto flex gap-2">
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
        {errors.length > 0 && (
          <ul className="border-destructive/40 bg-destructive/10 text-destructive space-y-1 rounded-lg border p-3 text-sm">
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
          <Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Short description (optional)" rows={2} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Servings">
              <Input inputMode="decimal" value={draft.servings} onChange={(e) => set("servings", e.target.value)} placeholder="4" />
            </Field>
            <Field label="Prep (min)">
              <Input inputMode="numeric" value={draft.prep_minutes} onChange={(e) => set("prep_minutes", e.target.value)} />
            </Field>
            <Field label="Cook (min)">
              <Input inputMode="numeric" value={draft.cook_minutes} onChange={(e) => set("cook_minutes", e.target.value)} />
            </Field>
            <Field label="Total (min)">
              <Input inputMode="numeric" value={draft.total_minutes} onChange={(e) => set("total_minutes", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tags">
              <TagInput value={draft.tags} onChange={(t) => set("tags", t)} suggestions={tags.data?.map((t) => t.name) ?? []} />
            </Field>
            <Field label="Source URL">
              <Input type="url" value={draft.source_url} onChange={(e) => set("source_url", e.target.value)} placeholder="https://…" />
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
