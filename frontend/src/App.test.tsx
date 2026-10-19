// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigationType } from "react-router-dom";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { renamedSlugs } from "./lib/queries";
import { createQueryClient } from "./lib/queryClient";
import { fakeApi, recipe, USER } from "./test/fakeApi";

/** Shows how the router last moved (PUSH, REPLACE or POP) and where to, for checking history. */
function NavProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="nav">{`${useNavigationType()} ${pathname}${search}`}</output>;
}
const lastNavigation = () => screen.getByTestId("nav").textContent;

function renderApp(path: string | string[], client = createQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={Array.isArray(path) ? path : [path]}>
        <App />
        <NavProbe />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  renamedSlugs.clear();
});

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

  it("brings the problems into view and focuses a missing title", async () => {
    fakeApi({});
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    renderApp("/new");
    await userEvent.click(await screen.findByRole("button", { name: /save/i }));
    expect(screen.getByRole("list", { name: "Problems" })).toHaveTextContent("Give the recipe a title.");
    expect(scrolled).toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveFocus();

    await userEvent.type(screen.getByLabelText("Title"), "Bread");
    await userEvent.type(screen.getByLabelText("Servings"), "0");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByRole("list", { name: "Problems" })).toHaveFocus();
    scrolled.mockRestore();
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

describe("recipe list", () => {
  it("says nothing matches a search, rather than that there are no recipes", async () => {
    fakeApi({ "GET /api/recipes": [] });
    renderApp("/?q=zzz");
    expect(await screen.findByText("No recipes match.")).toBeInTheDocument();
    expect(screen.queryByText("No recipes yet.")).not.toBeInTheDocument();
  });

  it("shows visitors every recipe under All Recipes for a My Recipes link", async () => {
    const api = fakeApi({ "GET /api/auth/me": { user: null, needs_setup: false }, "GET /api/recipes": [recipe()] });
    renderApp("/?mine=1");
    expect(await screen.findByRole("heading", { name: "All Recipes" })).toBeInTheDocument();
    expect(api.mock.calls.some(([url]) => String(url).includes("author"))).toBe(false);
  });

  it("says there are no recipes yet when nothing narrows the list", async () => {
    fakeApi({ "GET /api/recipes": [] });
    renderApp("/");
    expect(await screen.findByText("No recipes yet.")).toBeInTheDocument();
  });

  it("says when the filter box hides every recipe", async () => {
    fakeApi({ "GET /api/recipes": [recipe()] });
    renderApp("/");
    await userEvent.type(await screen.findByPlaceholderText("Filter this list…"), "zzz");
    expect(await screen.findByText("Nothing matches this filter.")).toBeInTheDocument();
  });
});

describe("admin pages", () => {
  it.each(["/admin/ai", "/admin/users"])("send members from %s to the recipe list", async (path) => {
    const api = fakeApi({ "GET /api/auth/me": { user: { ...USER, role: "member" }, needs_setup: false } });
    renderApp(path);
    await vi.waitFor(() => expect(lastNavigation()).toBe("REPLACE /"));
    expect(api.mock.calls.some(([url]) => String(url).includes("/admin"))).toBe(false);
  });
});

describe("menu drawer on small screens", () => {
  it("is out of reach while closed, takes the focus when opened and closes on Escape", async () => {
    fakeApi({});
    renderApp("/");
    const button = await screen.findByRole("button", { name: "Open menu" });
    const drawer = document.getElementById("app-menu")!;
    expect(drawer).toHaveAttribute("inert");
    expect(button).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(button);
    expect(drawer).not.toHaveAttribute("inert");
    expect(screen.getByRole("dialog", { name: "Menu" })).toBe(drawer);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(drawer).toContainElement(document.activeElement as HTMLElement);

    await userEvent.keyboard("{Escape}");
    expect(drawer).toHaveAttribute("inert");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  it("stays in place on wide screens", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width"), addEventListener() {}, removeEventListener() {} }));
    fakeApi({});
    renderApp("/");
    await screen.findByRole("button", { name: "Open menu" });
    expect(document.getElementById("app-menu")).not.toHaveAttribute("inert");
  });
});

describe("import page without AI", () => {
  it("explains link imports only in link mode", async () => {
    fakeApi({ "GET /api/ai/providers": [] });
    renderApp("/import");
    const linkNote = /links are imported from the page's recipe data/;
    expect(await screen.findByText(linkNote)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /from text/i }));
    expect(await screen.findByText(/importing text needs an AI provider/i)).toBeInTheDocument();
    expect(screen.queryByText(linkNote)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /from photos/i }));
    expect(await screen.findByText(/importing photos needs an AI provider/i)).toBeInTheDocument();
    expect(screen.queryByText(linkNote)).not.toBeInTheDocument();
  });
});

describe("history", () => {
  it("goes back to the recipe after saving an edit, rather than adding it again", async () => {
    const soup = recipe();
    fakeApi({ "GET /api/recipes/soup": soup, "PUT /api/recipes/soup": () => ({ ...soup, description: "Hot" }) });
    renderApp("/recipes/soup");
    await userEvent.click(await screen.findByRole("link", { name: /edit/i }));
    await userEvent.click(await screen.findByRole("button", { name: /save/i }));
    expect(await screen.findByText("Hot")).toBeInTheDocument();
    expect(lastNavigation()).toBe("POP /recipes/soup");
  });

  it("follows a renamed recipe to its new address", async () => {
    const soup = recipe();
    const renamed = { ...soup, slug: "better-soup", title: "Better soup" };
    fakeApi({ "GET /api/recipes/soup": soup, "PUT /api/recipes/soup": () => renamed, "GET /api/recipes/better-soup": renamed });
    renderApp("/recipes/soup");
    await userEvent.click(await screen.findByRole("link", { name: /edit/i }));
    await userEvent.click(await screen.findByRole("button", { name: /save/i }));
    expect(await screen.findByRole("heading", { name: "Better soup", level: 1 })).toBeInTheDocument();
    expect(lastNavigation()).toBe("REPLACE /recipes/better-soup");
  });

  it("goes back when cancelling an edit", async () => {
    fakeApi({ "GET /api/recipes/soup": recipe() });
    renderApp("/recipes/soup");
    await userEvent.click(await screen.findByRole("link", { name: /edit/i }));
    await userEvent.click(await screen.findByRole("link", { name: /cancel/i }));
    expect(await screen.findByRole("heading", { name: "Soup", level: 1 })).toBeInTheDocument();
    expect(lastNavigation()).toBe("POP /recipes/soup");
  });

  it("replaces a deleted recipe's page so Back can't return to it", async () => {
    fakeApi({ "GET /api/recipes/soup": recipe(), "DELETE /api/recipes/soup": () => null });
    renderApp(["/?tag=dinner", "/recipes/soup?tag=dinner"]);
    await userEvent.click(await screen.findByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /delete recipe/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await vi.waitFor(() => expect(lastNavigation()).toBe("REPLACE /?tag=dinner"));
  });
});

describe("cooking view", () => {
  const steps = [{ id: 1, section: "", text: "Stir" }];

  it("goes back to the recipe keeping the servings and units chosen while cooking", async () => {
    fakeApi({ "GET /api/recipes/soup": recipe({ steps }) });
    renderApp("/recipes/soup");
    await userEvent.click(await screen.findByRole("link", { name: "Cooking view" }));
    const more = await screen.findByRole("button", { name: "More servings" });
    await userEvent.click(more);
    await userEvent.click(screen.getByRole("radio", { name: "US" }));

    await userEvent.click(screen.getByRole("link", { name: "Leave cooking view" }));
    expect(await screen.findByRole("heading", { name: "Soup", level: 1 })).toBeInTheDocument();
    expect(lastNavigation()).toBe("POP /recipes/soup");
    expect(screen.getByRole("button", { name: "More servings" }).previousElementSibling).toHaveTextContent(/^5/);
    expect(screen.getByRole("radio", { name: "US" })).toBeChecked();
  });

  it("replaces itself with the recipe when opened directly", async () => {
    fakeApi({ "GET /api/recipes/soup": recipe({ steps }) });
    renderApp("/recipes/soup/cook?servings=2&units=us");
    await userEvent.click(await screen.findByRole("link", { name: "Leave cooking view" }));
    expect(await screen.findByRole("heading", { name: "Soup", level: 1 })).toBeInTheDocument();
    expect(lastNavigation()).toBe("REPLACE /recipes/soup");
    expect(screen.getByRole("button", { name: "More servings" }).previousElementSibling).toHaveTextContent(/^2/);
    expect(screen.getByRole("radio", { name: "US" })).toBeChecked();
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
    // Earlier tests may have left the same toast up.
    expect(await screen.findAllByText("Recipe saved")).not.toHaveLength(0);
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
