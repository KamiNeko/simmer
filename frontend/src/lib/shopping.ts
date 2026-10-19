/** Combine the ingredients of several recipes into one shopping list. */
import type { ShoppingList, UnitSystem } from "./api";
import { convertAmount, formatAmount, GRAMS, ML } from "./convert";

export interface ShoppingLine {
  /** Stable key for ticking the line off: name plus the unit it is summed in. */
  key: string;
  name: string;
  amount: string;
  /** Titles of the recipes that need it. */
  recipes: string[];
}

interface Total {
  name: string;
  unit: string | null;
  low: number;
  high: number;
  hasAmount: boolean;
  hasRange: boolean;
  recipes: string[];
}

/** Sum amounts in grams (weights, and volumes with a density), millilitres, or the counted unit. */
export function combineIngredients(list: ShoppingList, units: UnitSystem): ShoppingLine[] {
  const totals = new Map<string, Total>();
  for (const { servings, recipe } of list.recipes) {
    const scale = servings / (recipe.servings ?? 1);
    for (const group of recipe.groups) {
      for (const ingredient of group.ingredients) {
        const name = ingredient.name.trim();
        let unit = ingredient.unit;
        let factor = 1;
        if (unit && unit in GRAMS) {
          factor = GRAMS[unit];
          unit = "g";
        } else if (unit && unit in ML) {
          factor = ML[unit] * (ingredient.grams_per_ml ?? 1);
          unit = ingredient.grams_per_ml ? "g" : "ml";
        }
        const key = `${name.toLowerCase()}|${unit ?? ""}`;
        const total = totals.get(key) ?? { name, unit, low: 0, high: 0, hasAmount: false, hasRange: false, recipes: [] };
        if (ingredient.quantity !== null) {
          total.hasAmount = true;
          total.low += ingredient.quantity * scale * factor;
          total.high += (ingredient.quantity_max ?? ingredient.quantity) * scale * factor;
          if (ingredient.quantity_max !== null && ingredient.quantity_max !== ingredient.quantity) total.hasRange = true;
        }
        if (!total.recipes.includes(recipe.title)) total.recipes.push(recipe.title);
        totals.set(key, total);
      }
    }
  }

  // Shopping lists read best in one system; "as written" falls back to metric here.
  const system = units === "us" ? "us" : "metric";
  return [...totals.entries()].map(([key, t]) => {
    let amount = "";
    if (t.hasAmount) {
      const converted = convertAmount(
        { quantity: t.low, quantity_max: t.hasRange ? t.high : null, unit: t.unit, grams_per_ml: null },
        t.unit === "g" || t.unit === "ml" ? system : "original",
      );
      amount = formatAmount(converted);
    }
    return { key, name: t.name, amount, recipes: t.recipes };
  });
}

/** Plain text for pasting into a notes app or a message. */
export function listAsText(lines: ShoppingLine[], extras: string[]): string {
  return [...lines.map((l) => (l.amount ? `${l.amount} ${l.name}` : l.name)), ...extras].map((l) => `- ${l}`).join("\n");
}
