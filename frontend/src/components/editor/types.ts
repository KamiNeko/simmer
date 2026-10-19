import type { Ingredient, RecipeInput } from "@/lib/api";
import { formatQuantity, parseQuantity } from "@/lib/quantity";

let counter = 0;
export const uid = () => `k${++counter}`;

export interface IngredientRow {
  key: string;
  qty: string;
  unit: string;
  name: string;
  note: string;
  original_text: string;
  grams_per_ml: number | null;
}

export interface GroupDraft {
  key: string;
  name: string;
  rows: IngredientRow[];
}

export interface StepDraft {
  key: string;
  section: string;
  text: string;
}

export interface RecipeDraft {
  title: string;
  description: string;
  source_url: string;
  servings: string;
  prep_minutes: string;
  cook_minutes: string;
  total_minutes: string;
  tags: string[];
  groups: GroupDraft[];
  steps: StepDraft[];
}

export const emptyRow = (): IngredientRow => ({
  key: uid(),
  qty: "",
  unit: "",
  name: "",
  note: "",
  original_text: "",
  grams_per_ml: null,
});

export const rowFromIngredient = (i: Ingredient): IngredientRow => ({
  key: uid(),
  qty: formatQuantity(i.quantity, i.quantity_max).replace("–", "-"),
  unit: i.unit ?? "",
  name: i.name,
  note: i.note,
  original_text: i.original_text,
  grams_per_ml: i.grams_per_ml,
});

export function draftFromRecipe(recipe?: RecipeInput): RecipeDraft {
  if (!recipe)
    return {
      title: "",
      description: "",
      source_url: "",
      servings: "",
      prep_minutes: "",
      cook_minutes: "",
      total_minutes: "",
      tags: [],
      groups: [{ key: uid(), name: "", rows: [emptyRow()] }],
      steps: [{ key: uid(), section: "", text: "" }],
    };
  const num = (v: number | null) => (v === null ? "" : String(v));
  return {
    title: recipe.title,
    description: recipe.description,
    source_url: recipe.source_url ?? "",
    servings: num(recipe.servings),
    prep_minutes: num(recipe.prep_minutes),
    cook_minutes: num(recipe.cook_minutes),
    total_minutes: num(recipe.total_minutes),
    tags: recipe.tags,
    groups: recipe.groups.map((g) => ({ key: uid(), name: g.name, rows: g.ingredients.map(rowFromIngredient) })),
    steps: recipe.steps.map((s) => ({ key: uid(), section: s.section, text: s.text })),
  };
}

/** Convert the form into the API payload, or return a list of problems to show. */
export function toInput(draft: RecipeDraft): { input?: RecipeInput; errors: string[] } {
  const errors: string[] = [];
  const optionalNumber = (value: string, label: string) => {
    if (!value.trim()) return null;
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      errors.push(`${label} must be a number.`);
      return null;
    }
    return n;
  };

  if (!draft.title.trim()) errors.push("Give the recipe a title.");
  const groups = draft.groups
    .map((g) => ({
      name: g.name.trim(),
      ingredients: g.rows
        .filter((r) => r.name.trim() || r.qty.trim())
        .map((r) => {
          const parsed = parseQuantity(r.qty);
          if (!parsed) errors.push(`Amount “${r.qty}” for ${r.name || "an ingredient"} is not a number.`);
          if (!r.name.trim()) errors.push(`The ingredient with amount “${r.qty}” needs a name.`);
          return {
            quantity: parsed?.quantity ?? null,
            quantity_max: parsed?.quantity_max ?? null,
            unit: r.unit.trim() || null,
            name: r.name.trim(),
            note: r.note.trim(),
            original_text: r.original_text,
            grams_per_ml: r.grams_per_ml,
          };
        }),
    }))
    .filter((g) => g.name || g.ingredients.length);

  const input: RecipeInput = {
    title: draft.title.trim(),
    description: draft.description.trim(),
    source_url: draft.source_url.trim() || null,
    servings: optionalNumber(draft.servings, "Servings"),
    prep_minutes: optionalNumber(draft.prep_minutes, "Prep time"),
    cook_minutes: optionalNumber(draft.cook_minutes, "Cook time"),
    total_minutes: optionalNumber(draft.total_minutes, "Total time"),
    tags: draft.tags,
    groups,
    steps: draft.steps
      .filter((s) => s.text.trim())
      .map((s) => ({ section: s.section.trim(), text: s.text.trim() })),
  };
  return errors.length ? { errors } : { input, errors };
}
