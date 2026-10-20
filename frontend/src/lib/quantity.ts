import type { LanguageCode } from "./languages";

const FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];

const UNICODE: Record<string, number> = Object.fromEntries(FRACTIONS.map(([v, s]) => [s, v]));

/** Format a number the way a cook writes it: 1.5 -> "1½", 0.333 -> "⅓", 250 -> "250". */
export function formatNumber(value: number): string {
  const whole = Math.floor(value);
  const rest = value - whole;
  if (rest < 0.01) return String(whole);
  if (rest > 0.99) return String(whole + 1);
  const match = FRACTIONS.find(([v]) => Math.abs(v - rest) < 0.02);
  if (match) return `${whole || ""}${match[1]}`;
  return String(Math.round(value * 100) / 100);
}

export function formatQuantity(quantity: number | null, max: number | null): string {
  if (quantity === null) return "";
  return max !== null && max !== quantity ? `${formatNumber(quantity)}–${formatNumber(max)}` : formatNumber(quantity);
}

/** A plain decimal without exponent notation, which parseQuantity could not read back. */
function plainDecimal(value: number): string {
  const text = String(value);
  if (!text.includes("e")) return text;
  return value >= 1 ? BigInt(Math.round(value)).toString() : value.toFixed(20).replace(/0+$/, "");
}

/** Format a number for editing: a fraction glyph only when it is exact, so saving doesn't round it. */
function formatExactNumber(value: number): string {
  const whole = Math.floor(value);
  const match = FRACTIONS.find(([v]) => Math.abs(value - whole - v) < 1e-9);
  return match ? `${whole || ""}${match[1]}` : plainDecimal(value);
}

/** An amount as the quantity field shows it: "1½", "0.12", "2-3". */
export function formatQuantityInput(quantity: number | null, max: number | null): string {
  if (quantity === null) return "";
  return max !== null && max !== quantity ? `${formatExactNumber(quantity)}-${formatExactNumber(max)}` : formatExactNumber(quantity);
}

function parseNumber(text: string): number | null {
  let total = 0;
  const parts = text
    .trim()
    .replace(",", ".")
    .replace(/(\d)([⅛¼⅓⅜½⅝⅔¾⅞])/g, "$1 $2")
    .split(/\s+/);
  for (const part of parts) {
    if (!part) continue;
    if (part in UNICODE) total += UNICODE[part];
    else if (/^\d+\/\d+$/.test(part)) {
      const [n, d] = part.split("/").map(Number);
      if (!d) return null;
      total += n / d;
    } else if (/^\d+(\.\d+)?$/.test(part)) total += Number(part);
    else return null;
  }
  return parts.some(Boolean) ? total : null;
}

/** Parse what a user types into the quantity field: "2", "1 1/2", "½", "2-3". */
export function parseQuantity(text: string): { quantity: number | null; quantity_max: number | null } | null {
  const trimmed = text.trim();
  if (!trimmed) return { quantity: null, quantity_max: null };
  const [low, high, ...extra] = trimmed.split(/\s*(?:-|–|to)\s*/);
  if (extra.length) return null;
  const quantity = parseNumber(low);
  if (quantity === null) return null;
  if (high === undefined) return { quantity, quantity_max: null };
  const quantity_max = parseNumber(high);
  return quantity_max === null ? null : { quantity, quantity_max };
}

const UNIT_LABELS: Record<string, string> = { fl_oz: "fl oz" };
const PLURALS: Record<string, string> = {
  cup: "cups",
  pint: "pints",
  quart: "quarts",
  pinch: "pinches",
  clove: "cloves",
  can: "cans",
  piece: "pieces",
  slice: "slices",
  bunch: "bunches",
  stalk: "stalks",
  handful: "handfuls",
};

/** Unit names in the languages recipes are translated into, as [singular, plural]; units left out keep their code. */
const TRANSLATED_UNITS: Partial<Record<LanguageCode, Record<string, [string, string?]>>> = {
  de: {
    tsp: ["TL"],
    tbsp: ["EL"],
    cup: ["Tasse", "Tassen"],
    pinch: ["Prise", "Prisen"],
    clove: ["Zehe", "Zehen"],
    can: ["Dose", "Dosen"],
    piece: ["Stück"],
    slice: ["Scheibe", "Scheiben"],
    bunch: ["Bund"],
    stalk: ["Stange", "Stangen"],
    handful: ["Handvoll"],
  },
};

/** Display label for a unit code, pluralised for amounts above one ("2 cups"), in the recipe's language. */
export function unitLabel(unit: string | null, quantity: number | null = null, max: number | null = null, language: LanguageCode = "en"): string {
  if (!unit) return "";
  const amount = max ?? quantity;
  const translated = TRANSLATED_UNITS[language]?.[unit];
  if (translated) return amount !== null && amount > 1 && translated[1] ? translated[1] : translated[0];
  if (amount !== null && amount > 1 && unit in PLURALS) return PLURALS[unit];
  return UNIT_LABELS[unit] ?? unit;
}

/** The next servings count up or down: whole servings, with halves below two. */
export function stepServings(value: number, direction: 1 | -1): number {
  const step = (direction === 1 ? value < 2 : value <= 2) ? 0.5 : 1;
  return Math.max(0.5, Math.round((value + direction * step) * 2) / 2);
}
