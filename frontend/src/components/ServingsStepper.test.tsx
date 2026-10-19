// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ServingsStepper } from "./ServingsStepper";

describe("ServingsStepper", () => {
  it("steps servings up and down", async () => {
    const onChange = vi.fn<(servings: number) => void>();
    render(<ServingsStepper title="Soup" servings={2} perServing onChange={onChange} />);
    expect(screen.getByText("2 serv.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More servings of Soup" }));
    await userEvent.click(screen.getByRole("button", { name: "Fewer servings of Soup" }));
    expect(onChange.mock.calls).toEqual([[3], [1.5]]);
  });

  it("shows a multiplier for recipes without servings and stops at a half", () => {
    render(<ServingsStepper title="Bread" servings={0.5} perServing={false} onChange={() => {}} />);
    expect(screen.getByText("× ½")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fewer servings of Bread" })).toBeDisabled();
  });
});
