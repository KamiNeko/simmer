import { describe, expect, it } from "vitest";

import { type ConvertibleIngredient, convertAmount, convertText, formatAmount } from "./convert";

const ing = (quantity: number | null, unit: string | null, grams_per_ml: number | null = null, quantity_max: number | null = null): ConvertibleIngredient => ({
  quantity,
  quantity_max,
  unit,
  grams_per_ml,
});

/** Test strings use plain spaces; the output uses no-break spaces before units. */
const text = (value: string, system: "metric" | "us" | "original") => convertText(value, system).replaceAll("\u00a0", " ");

const show = (i: ConvertibleIngredient, system: "metric" | "us" | "original", scale = 1) => formatAmount(convertAmount(i, system, scale));

describe("metric", () => {
  it.each([
    [ing(2, "lb"), "905 g"],
    [ing(3, "lb"), "1.35 kg"],
    [ing(8, "oz"), "225 g"],
    [ing(2, "cup", 0.85), "400 g"],
    [ing(1, "cup"), "235 ml"],
    [ing(4, "cup"), "950 ml"],
    [ing(5, "cup"), "1.2 l"],
    [ing(3, "tbsp", 1.2), "55 g"],
    [ing(1, "tbsp", 1.2), "1 tbsp"],
    [ing(2, "tsp", 0.6), "2 tsp"],
    [ing(2, "tbsp", 0.96), "28 g"],
    [ing(1, "tbsp"), "1 tbsp"],
    [ing(2, "clove"), "2 cloves"],
    [ing(1, "pinch"), "1 pinch"],
    [ing(3, null), "3"],
    [ing(250, "g"), "250 g"],
    [ing(1500, "g"), "1.5 kg"],
    [ing(200, "ml", 0.53), "105 g"],
    [ing(null, "g"), "g"],
  ])("%j -> %s", (i, expected) => expect(show(i, "metric")).toBe(expected));

  it("keeps ranges in one unit", () => {
    expect(show(ing(2, "lb", null, 3), "metric")).toBe("905–1360 g");
  });

  it("scales before converting", () => {
    expect(show(ing(2, "lb"), "metric", 0.5)).toBe("455 g");
    expect(show(ing(1, "tbsp", 1.2), "metric", 2)).toBe("35 g");
    expect(show(ing(3, null), "metric", 0.5)).toBe("1½");
  });
});

describe("us", () => {
  it.each([
    [ing(500, "g"), "1 lb"],
    [ing(100, "g"), "3½ oz"],
    [ing(5, "ml"), "1 tsp"],
    [ing(30, "ml"), "2 tbsp"],
    [ing(250, "ml"), "1 cup"],
    [ing(2, "cup", 0.85), "2 cups"],
    [ing(2, "lb"), "2 lb"],
  ])("%j -> %s", (i, expected) => expect(show(i, "us")).toBe(expected));
});

describe("original", () => {
  it("only scales", () => {
    expect(show(ing(2, "cup", 0.85), "original", 1.5)).toBe("3 cups");
    expect(show(ing(2, "lb"), "original")).toBe("2 lb");
  });
});

describe("convertText", () => {
  it("converts temperatures and sizes to metric", () => {
    expect(text("Preheat the oven to 400°F (or 375 degrees F).", "metric")).toBe("Preheat the oven to 205 °C (or 190 °C).");
    expect(text("Bake at 350F in a 9x13-inch pan.", "metric")).toBe("Bake at 175 °C in a 23 × 33 cm pan.");
    expect(text("Cut into 1-inch pieces, ½ inch thick.", "metric")).toBe("Cut into 3 cm pieces, 1.5 cm thick.");
    expect(text("Heat to 325-350°F.", "metric")).toBe("Heat to 165–175 °C.");
    expect(text("Cook 5 minutes in the pan.", "metric")).toBe("Cook 5 minutes in the pan.");
  });

  it("converts to US", () => {
    expect(text("Bake at 200°C in a 20 x 30 cm dish, slices 1 cm thick.", "us")).toBe("Bake at 390 °F in a 8 × 12 inch dish, slices ½ inch thick.");
  });

  it("leaves the original alone", () => {
    expect(text("Bake at 400°F.", "original")).toBe("Bake at 400°F.");
  });
});
