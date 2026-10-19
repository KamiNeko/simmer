import { describe, expect, it } from "vitest";

import { formatMinutes, sectionHeading } from "./utils";

describe("sectionHeading", () => {
  const steps = [{ section: "" }, { section: "Sauce" }, { section: "Sauce" }, { section: "" }, { section: "Sauce" }];

  it("shows a heading where a section starts", () => {
    expect(steps.map((_, i) => sectionHeading(steps, i))).toEqual([null, "Sauce", null, null, "Sauce"]);
  });
});

describe("formatMinutes", () => {
  it.each([
    [null, null],
    [0, null],
    [45, "45 min"],
    [60, "1 h"],
    [95, "1 h 35 min"],
  ])("%s", (minutes, expected) => expect(formatMinutes(minutes)).toBe(expected));
});
