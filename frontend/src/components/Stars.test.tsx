// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StarInput } from "./Stars";

describe("StarInput", () => {
  it("sets a rating, and clears it when the current star is clicked again", async () => {
    const onChange = vi.fn<(stars: number | null) => void>();
    const { rerender } = render(<StarInput value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    expect(onChange).toHaveBeenLastCalledWith(4);

    rerender(<StarInput value={4} onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "4 stars" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
