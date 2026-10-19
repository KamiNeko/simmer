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

function renderApp(path: string, client = createQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
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

describe("recipe detail", () => {
  it("starts afresh when switching to another recipe", async () => {
    const ingredients = [{ quantity: 1, quantity_max: null, unit: null, name: "Egg", note: "", original_text: "", grams_per_ml: null }];
    const alpha = recipe({ id: 1, slug: "alpha", title: "Alpha", servings: 4, groups: [{ id: 1, name: "", ingredients }] });
    const beta = recipe({ id: 2, slug: "beta", title: "Beta", servings: 2, groups: [{ id: 2, name: "", ingredients }] });
    fakeApi({ "GET /api/recipes": [alpha, beta], "GET /api/recipes/alpha": alpha, "GET /api/recipes/beta": beta });
    renderApp("/recipes/alpha");

    const more = await screen.findByRole("button", { name: "More servings" });
    await userEvent.click(more);
    await userEvent.click(more);
    expect(more.previousElementSibling).toHaveTextContent(/^6/);
    await userEvent.click(screen.getByRole("checkbox", { name: /egg/i }));
    expect(screen.getByRole("checkbox", { name: /egg/i })).toBeChecked();

    await userEvent.click(screen.getByRole("link", { name: /beta/i }));
    expect(await screen.findByRole("heading", { name: "Beta", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More servings" }).previousElementSibling).toHaveTextContent(/^2/);
    expect(screen.getByRole("checkbox", { name: /egg/i })).not.toBeChecked();
  });
});

describe("lists that show recipes", () => {
  it("update the shopping count after deleting a recipe on the list", async () => {
    const soup = recipe();
    let onList = [{ servings: 4, recipe: soup }];
    fakeApi({
      "GET /api/recipes/soup": soup,
      "GET /api/shopping": () => ({ recipes: onList, extras: [], checked: [] }),
      "DELETE /api/recipes/soup": () => {
        onList = [];
        return null;
      },
    });
    renderApp("/recipes/soup");
    expect(await screen.findByRole("link", { name: /^Shopping list\s*1$/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /delete recipe/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("link", { name: "Shopping list" })).toBeInTheDocument();
  });

  it("refresh the meal plan and shopping list after saving a recipe", async () => {
    const soup = recipe({ title: "Soup" });
    fakeApi({ "GET /api/recipes/soup": soup, "PUT /api/recipes/soup": () => ({ ...soup, title: "Better soup" }) });
    const client = createQueryClient();
    client.setQueryData(["plan", "2026-10-19"], []);
    renderApp("/recipes/soup/edit", client);
    await userEvent.click(await screen.findByRole("button", { name: /save/i }));
    await screen.findByText("Recipe saved");
    expect(client.getQueryState(["plan", "2026-10-19"])?.isInvalidated).toBe(true);
    // The sidebar shows the shopping list, so it is fetched again rather than left stale.
    await vi.waitFor(() => expect(client.getQueryState(["shopping"])?.dataUpdateCount).toBe(2));
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
