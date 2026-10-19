import { describe, expect, it } from "vitest";

import { draftFromRecipe, rowFromIngredient, toInput } from "./types";

const draft = (changes: Partial<ReturnType<typeof draftFromRecipe>> = {}) => ({ ...draftFromRecipe(), title: "Soup", ...changes });

describe("toInput", () => {
  it("needs a title", () => {
    expect(toInput(draftFromRecipe()).errors).toEqual(["Give the recipe a title."]);
  });

  it("drops empty rows, groups and steps", () => {
    const { input } = toInput(draft());
    expect(input).toMatchObject({ title: "Soup", groups: [], steps: [], servings: null, prep_minutes: null });
  });

  it("reads servings with a decimal comma", () => {
    expect(toInput(draft({ servings: "2,5" })).input?.servings).toBe(2.5);
  });

  it.each(["0", "-1", "lots"])("rejects %s servings", (servings) => {
    expect(toInput(draft({ servings })).errors).toEqual(["Servings must be a number above zero."]);
  });

  it.each(["1.5", "-5", "soon"])("rejects %s as minutes", (prep_minutes) => {
    expect(toInput(draft({ prep_minutes })).errors).toEqual(["Prep time must be a whole number of minutes."]);
  });

  it("parses ingredient amounts and flags bad ones", () => {
    const groups = [
      {
        key: "g",
        name: "",
        rows: [
          { ...draftFromRecipe().groups[0].rows[0], qty: "1-2", unit: "cup", name: " Rice " },
          { ...draftFromRecipe().groups[0].rows[0], qty: "some", name: "Salt" },
        ],
      },
    ];
    const { input, errors } = toInput(draft({ groups }));
    expect(input).toBeUndefined();
    expect(errors).toEqual(["Amount “some” for Salt is not a number."]);

    groups[0].rows.pop();
    expect(toInput(draft({ groups })).input?.groups[0].ingredients[0]).toMatchObject({ quantity: 1, quantity_max: 2, unit: "cup", name: "Rice" });
  });
});

const ingredient = (quantity: number | null, quantity_max: number | null = null) => ({
  quantity,
  quantity_max,
  unit: "cup",
  name: "Rice",
  note: "",
  original_text: "",
  grams_per_ml: null,
});

describe("rowFromIngredient", () => {
  it.each([
    [1.5, null, "1½"],
    [1 / 3, null, "⅓"],
    [2, 3, "2-3"],
    [0.12, null, "0.12"],
    [1.49, null, "1.49"],
    [0.3, 0.33, "0.3-0.33"],
    [1e21, null, "1000000000000000000000"],
    [1e-7, null, "0.0000001"],
    [null, null, ""],
  ])("shows %s–%s as %s and saves it unchanged", (quantity, max, text) => {
    const row = rowFromIngredient(ingredient(quantity, max));
    expect(row.qty).toBe(text);
    const saved = toInput(draft({ groups: [{ key: "g", name: "", rows: [row] }] })).input?.groups[0].ingredients[0];
    expect(saved).toMatchObject({ quantity, quantity_max: max });
  });
});
