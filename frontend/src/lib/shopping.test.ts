import { describe, expect, it } from "vitest";

import type { Recipe, ShoppingList } from "./api";
import { combineIngredients, listAsText } from "./shopping";

const recipe = (title: string, servings: number | null, ingredients: Partial<Recipe["groups"][0]["ingredients"][0]>[]): Recipe =>
  ({
    title,
    servings,
    groups: [
      {
        name: "",
        ingredients: ingredients.map((i) => ({ quantity: null, quantity_max: null, unit: null, name: "", note: "", original_text: "", grams_per_ml: null, ...i })),
      },
    ],
  }) as unknown as Recipe;

const list: ShoppingList = {
  recipes: [
    {
      servings: 2,
      recipe: recipe("Chicken", 4, [
        { quantity: 2, unit: "lb", name: "Chicken thigh" },
        { quantity: 2, unit: "cup", name: "rice", grams_per_ml: 0.85 },
        { quantity: 2, unit: "cup", name: "water" },
        { quantity: 1, quantity_max: 2, name: "green onion" },
        { name: "salt" },
      ]),
    },
    {
      servings: 1,
      recipe: recipe("Fried rice", null, [
        { quantity: 300, unit: "g", name: "rice" },
        { quantity: 1, unit: "l", name: "Water" },
        { quantity: 3, name: "green onion" },
        { name: "salt" },
      ]),
    },
  ],
  extras: [],
  checked: [],
};

describe("combineIngredients", () => {
  it("sums matching ingredients across recipes", () => {
    const lines = combineIngredients(list, "metric");
    expect(lines.map((l) => [l.name, l.amount, l.recipes.length])).toEqual([
      ["Chicken thigh", "455 g", 1],
      ["rice", "500 g", 2],
      ["water", "1.25 l", 2],
      ["green onion", "3½–4", 2],
      ["salt", "", 2],
    ]);
    expect(lines[1].key).toBe("rice|g");
  });

  it("shows US amounts", () => {
    const lines = combineIngredients(list, "us");
    expect(lines.slice(0, 3).map((l) => l.amount)).toEqual(["1 lb", "1 lb", "5¼ cups"]);
  });

  it("formats as text", () => {
    expect(listAsText(combineIngredients(list, "metric").slice(0, 2), ["Kitchen paper"])).toBe("- 455 g Chicken thigh\n- 500 g rice\n- Kitchen paper");
  });
});
