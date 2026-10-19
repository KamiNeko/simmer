// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { createQueryClient } from "./lib/queryClient";
import { fakeApi, recipe } from "./test/fakeApi";

function renderApp(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("recipe editor", () => {
  it("starts empty when going from editing a recipe to a new one", async () => {
    fakeApi({ "GET /api/recipes/soup": recipe({ title: "Tomato soup", servings: 4 }) });
    renderApp("/recipes/soup/edit");
    expect(await screen.findByDisplayValue("Tomato soup")).toBeInTheDocument();
    expect(screen.getByLabelText("Servings")).toHaveValue("4");

    await userEvent.click(screen.getByTitle("New recipe"));
    expect(await screen.findByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Servings")).toHaveValue("");
  });

  it("explains what to fix before saving", async () => {
    const api = fakeApi({});
    renderApp("/new");
    await userEvent.type(await screen.findByLabelText("Title"), "Bread");
    await userEvent.type(screen.getByLabelText("Servings"), "0");
    await userEvent.type(screen.getByLabelText("Prep (min)"), "1.5");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    const problems = screen.getByRole("list", { name: "Problems" });
    expect(within(problems).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Servings must be a number above zero.",
      "Prep time must be a whole number of minutes.",
    ]);
    expect(api.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
});

describe("failed actions", () => {
  it("show the server's message as a toast", async () => {
    fakeApi({
      "GET /api/recipes/soup": recipe(),
      "PUT /api/recipes/soup/rating": () => {
        throw new Error("The recipe was deleted");
      },
    });
    renderApp("/recipes/soup");
    await userEvent.click(await screen.findByRole("radio", { name: "4 stars" }));
    expect(await screen.findByText("The recipe was deleted")).toBeInTheDocument();
  });
});
