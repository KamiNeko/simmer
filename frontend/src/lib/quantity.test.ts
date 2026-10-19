import { describe, expect, it } from "vitest";

import { formatNumber, formatQuantity, parseQuantity, unitLabel } from "./quantity";

describe("formatNumber", () => {
  it.each([
    [2, "2"],
    [1.5, "1½"],
    [0.25, "¼"],
    [1 / 3, "⅓"],
    [2.1, "2.1"],
    [250, "250"],
  ])("%s -> %s", (input, expected) => expect(formatNumber(input)).toBe(expected));
});

describe("parseQuantity", () => {
  it.each([
    ["2", { quantity: 2, quantity_max: null }],
    ["1 1/2", { quantity: 1.5, quantity_max: null }],
    ["1½", { quantity: 1.5, quantity_max: null }],
    ["0,5", { quantity: 0.5, quantity_max: null }],
    ["2-3", { quantity: 2, quantity_max: 3 }],
    ["", { quantity: null, quantity_max: null }],
  ])("%s", (input, expected) => expect(parseQuantity(input)).toEqual(expected));

  it("rejects text", () => expect(parseQuantity("some")).toBeNull());
});

describe("formatQuantity", () => {
  it("formats ranges", () => expect(formatQuantity(2, 3)).toBe("2–3"));
  it("formats empty", () => expect(formatQuantity(null, null)).toBe(""));
});

describe("unitLabel", () => {
  it("pluralises countable units", () => expect(unitLabel("cup", 2, null)).toBe("cups"));
  it("keeps singular for one", () => expect(unitLabel("cup", 1, null)).toBe("cup"));
  it("uses the upper end of a range", () => expect(unitLabel("clove", 1, 2)).toBe("cloves"));
  it("never pluralises abbreviations", () => expect(unitLabel("tbsp", 3, null)).toBe("tbsp"));
  it("labels fluid ounces", () => expect(unitLabel("fl_oz", 4, null)).toBe("fl oz"));
});
