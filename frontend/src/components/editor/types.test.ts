import { describe, expect, it } from "vitest";

import { draftFromRecipe, toInput } from "./types";

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
