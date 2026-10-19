import { describe, expect, it } from "vitest";

import { addDays, relativeDay, shortDay, weekDays, weekLabel, weekStart } from "./dates";

describe("dates", () => {
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
  });

  it("adds days across months and the clock change", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(weekDays("2026-10-26")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });

  it("labels weeks and days", () => {
    expect(weekLabel("2026-10-19")).toBe("19 – 25 Oct");
    expect(weekLabel("2026-10-26")).toBe("26 Oct – 1 Nov");
    expect(shortDay("2026-10-20")).toBe("Tue 20 Oct");
    expect(relativeDay("2026-10-20", "2026-10-19")).toBe("Tomorrow");
    expect(relativeDay("2026-10-19", "2026-10-19")).toBe("Today");
  });
});
