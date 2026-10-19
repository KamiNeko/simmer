/**
 * Display-time unit conversion and servings scaling. Recipes are stored as entered;
 * these functions only change how amounts and step text are shown.
 */
import type { UnitSystem } from "./api";
import { formatQuantity, unitLabel } from "./quantity";

/** Millilitres per volume unit. */
const ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892,
  tbsp: 14.7868,
  fl_oz: 29.5735,
  cup: 236.588,
  pint: 473.176,
  quart: 946.353,
};

/** Grams per weight unit. */
const GRAMS: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };

const DECIMAL_UNITS: Record<string, true> = { mg: true, g: true, kg: true, ml: true, l: true };
const decimal = (value: number) => String(Math.round(value * 100) / 100);
const SPOONS = new Set(["tsp", "tbsp"]);
const US_UNITS = new Set(["tsp", "tbsp", "fl_oz", "cup", "pint", "quart", "oz", "lb"]);
/** Spoon measures stay spoons below this weight (spices, sauces). */
const SPOON_GRAMS_LIMIT = 20;

export interface ConvertibleIngredient {
  quantity: number | null;
  quantity_max: number | null;
  unit: string | null;
  grams_per_ml: number | null;
}

export interface Amount {
  quantity: number | null;
  max: number | null;
  unit: string | null;
}

const roundTo = (value: number, step: number) => Math.max(step, Math.round(value / step) * step);

function grams(value: number): [number, string] {
  if (value >= 1000) return [roundTo(value / 1000, 0.05), "kg"];
  if (value >= 50) return [roundTo(value, 5), "g"];
  if (value >= 10) return [roundTo(value, 1), "g"];
  return [roundTo(value, 0.5), "g"];
}

function millilitres(value: number): [number, string] {
  if (value >= 1000) return [roundTo(value / 1000, 0.05), "l"];
  if (value > 250) return [roundTo(value, 10), "ml"];
  if (value >= 10) return [roundTo(value, 5), "ml"];
  return [roundTo(value, 0.5), "ml"];
}

function usWeight(value: number): [number, string] {
  const ounces = value / GRAMS.oz;
  if (ounces >= 16) return [roundTo(value / GRAMS.lb, 0.25), "lb"];
  return [roundTo(ounces, 0.25), "oz"];
}

function usVolume(value: number): [number, string] {
  if (value < ML.tbsp) return [roundTo(value / ML.tsp, 0.125), "tsp"];
  if (value < ML.cup / 4) return [roundTo(value / ML.tbsp, 0.5), "tbsp"];
  return [roundTo(value / ML.cup, 0.125), "cup"];
}

/** Rounding step for an amount already expressed in a display unit. */
function step(unit: string, value: number): number {
  switch (unit) {
    case "g":
      return value >= 50 ? 5 : value >= 10 ? 1 : 0.5;
    case "ml":
      return value > 250 ? 10 : value >= 10 ? 5 : 0.5;
    case "kg":
    case "l":
      return 0.05;
    case "tsp":
    case "cup":
      return 0.125;
    case "tbsp":
      return 0.5;
    default:
      return 0.25;
  }
}

/** Pick the display unit from the lower amount and express the upper one in the same unit. */
function convertPair(low: number, high: number | null, base: number, pick: (v: number) => [number, string]): Amount {
  const [quantity, unit] = pick(low * base);
  if (high === null) return { quantity, max: null, unit };
  const inUnit = (high * base) / (GRAMS[unit] ?? ML[unit]);
  return { quantity, max: roundTo(inUnit, step(unit, inUnit)), unit };
}

/** The amount to show for an ingredient in a unit system, after scaling. */
export function convertAmount(ingredient: ConvertibleIngredient, system: UnitSystem, scale = 1): Amount {
  const { unit, grams_per_ml: density } = ingredient;
  if (ingredient.quantity === null) return { quantity: null, max: null, unit };
  const low = ingredient.quantity * scale;
  const high = ingredient.quantity_max === null ? null : ingredient.quantity_max * scale;
  const unchanged = { quantity: low, max: high, unit };
  if (system === "original" || !unit) return unchanged;

  if (system === "metric") {
    if (unit in GRAMS) return convertPair(low, high, GRAMS[unit], grams);
    if (unit in ML) {
      if (density) {
        const weight = low * ML[unit] * density;
        if (!SPOONS.has(unit) || weight >= SPOON_GRAMS_LIMIT) return convertPair(low, high, ML[unit] * density, grams);
        return unchanged;
      }
      if (SPOONS.has(unit)) return unchanged;
      return convertPair(low, high, ML[unit], millilitres);
    }
    return unchanged;
  }

  // US: metric weights and volumes become US measures; US units stay as written.
  if (US_UNITS.has(unit)) return unchanged;
  if (unit in GRAMS) return convertPair(low, high, GRAMS[unit], usWeight);
  if (unit in ML) return convertPair(low, high, ML[unit], usVolume);
  return unchanged;
}

/** "250 g", "1½ cups", or "" when there is no amount. */
export function formatAmount(amount: Amount): string {
  const { quantity, max, unit } = amount;
  // Metric amounts read as decimals ("1.5 kg"), everything else as kitchen fractions.
  const value =
    unit && unit in DECIMAL_UNITS && quantity !== null
      ? max !== null && max !== quantity
        ? `${decimal(quantity)}–${decimal(max)}`
        : decimal(quantity)
      : formatQuantity(quantity, max);
  return [value, unitLabel(unit, quantity, max)].filter(Boolean).join(" ");
}

/** A scaled number for things like servings: 2.666 -> 2.67. */
export const scaled = (value: number, scale: number) => Math.round(value * scale * 100) / 100;

// Step text

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const FAHRENHEIT = String.raw`\s*(?:°|º|degrees?)\s*F(?:ahrenheit)?\b|F\b`;
const CELSIUS = String.raw`\s*(?:°|º|degrees?)\s*C(?:elsius)?\b|C\b`;
const INCH = String.raw`\s*-?\s*(?:inch(?:es)?\b|in\.|″|")`;
const CM = String.raw`\s*(?:cm|centimet(?:er|re)s?)\b`;

const num = (text: string) => Number(text.replace(",", "."));
const round5 = (value: number) => Math.round(value / 5) * 5;
const fToC = (f: number) => round5(((f - 32) * 5) / 9);
const cToF = (c: number) => round5((c * 9) / 5 + 32);
const inchToCm = (inch: number) => (inch < 1 ? Math.round(inch * 2.54 * 2) / 2 : Math.round(inch * 2.54));
const cmToInch = (cm: number) => {
  const inch = cm / 2.54;
  const unit = inch >= 4 ? 0.5 : 0.25;
  return formatQuantity(Math.max(0.25, Math.round(inch / unit) * unit), null);
};

const FRACTION_INCH: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75, "1/4": 0.25, "1/2": 0.5, "3/4": 0.75 };

/** Convert oven temperatures and sizes inside instruction text. A no-break space keeps "220 °C" on one line. */
export function convertText(text: string, system: UnitSystem): string {
  if (system === "original") return text;
  if (system === "metric") {
    return text
      .replace(new RegExp(String.raw`(${NUMBER})\s*(?:-|–|to)\s*(${NUMBER})(?:${FAHRENHEIT})`, "g"), (_, a, b) => `${fToC(num(a))}–${fToC(num(b))}\u00a0°C`)
      .replace(new RegExp(String.raw`(${NUMBER})(?:${FAHRENHEIT})`, "g"), (_, f) => `${fToC(num(f))}\u00a0°C`)
      .replace(new RegExp(String.raw`(\d+)\s*[x×]\s*(\d+)(?:\s*[x×]\s*(\d+))?(?:${INCH})`, "g"), (_, a, b, c) =>
        [a, b, c].filter(Boolean).map((v) => inchToCm(num(v))).join(" × ") + "\u00a0cm",
      )
      .replace(new RegExp(String.raw`(\d+\s+)?(¼|½|¾|1/4|1/2|3/4)(?:${INCH})`, "g"), (_, whole, frac) => `${inchToCm((whole ? num(whole) : 0) + FRACTION_INCH[frac])}\u00a0cm`)
      .replace(new RegExp(String.raw`(${NUMBER})(?:${INCH})`, "g"), (_, inch) => `${inchToCm(num(inch))}\u00a0cm`);
  }
  return text
    .replace(new RegExp(String.raw`(${NUMBER})\s*(?:-|–|to)\s*(${NUMBER})(?:${CELSIUS})`, "g"), (_, a, b) => `${cToF(num(a))}–${cToF(num(b))}\u00a0°F`)
    .replace(new RegExp(String.raw`(${NUMBER})(?:${CELSIUS})`, "g"), (_, c) => `${cToF(num(c))}\u00a0°F`)
    .replace(new RegExp(String.raw`(\d+)\s*[x×]\s*(\d+)(?:\s*[x×]\s*(\d+))?(?:${CM})`, "g"), (_, a, b, c) =>
      [a, b, c].filter(Boolean).map((v) => cmToInch(num(v))).join(" × ") + "\u00a0inch",
    )
    .replace(new RegExp(String.raw`(${NUMBER})(?:${CM})`, "g"), (_, cm) => `${cmToInch(num(cm))}\u00a0inch`);
}
