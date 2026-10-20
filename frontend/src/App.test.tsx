// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigationType } from "react-router-dom";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { renamedSlugs } from "./lib/queries";
import { setReadingLanguage } from "./lib/readingLanguage";
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
  setReadingLanguage("en");
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

  it("narrows My Recipes by several tags at once", async () => {
    const api = fakeApi({ "GET /api/tags": [{ name: "Dinner", count: 2 }, { name: "Quick", count: 1 }] });
    renderApp("/?mine=1");
    await userEvent.click(await screen.findByRole("link", { name: /^Dinner ?2$/ }));
    await userEvent.click(screen.getByRole("link", { name: /^Quick ?1$/ }));
    expect(lastNavigation()).toBe("PUSH /?mine=1&tag=Dinner&tag=Quick");
    expect(await screen.findByRole("heading", { name: "Dinner + Quick" })).toBeInTheDocument();
    expect(api.mock.calls.map(([url]) => String(url))).toContain("/api/recipes?author=1&tag=Dinner&tag=Quick");

    await userEvent.click(screen.getByRole("link", { name: /^Dinner ?2$/ }));
    expect(lastNavigation()).toBe("PUSH /?mine=1&tag=Quick");
    await userEvent.click(screen.getByRole("link", { name: "My Recipes" }));
    expect(lastNavigation()).toBe("PUSH /?tag=Quick");
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

function importBody(api: ReturnType<typeof fakeApi>) {
  const call = api.mock.calls.find(([url, init]) => init?.method === "POST" && String(url).endsWith("/api/import"));
  return call && JSON.parse(String(call[1]!.body));
}

describe("importing pages from the browser", () => {
  const PAGE = `<!doctype html><html><head><title>Beans</title><script type="application/ld+json">{"@type":"Recipe","name":"Beans"}</script></head><body><article>Fry the beans</article></body></html>`;
  const imported = { recipe: { title: "Beans", groups: [], steps: [], tags: [] }, image_url: null, provider: null, model: null, warning: null };

  it("reads pasted page source without AI", async () => {
    const api = fakeApi({ "GET /api/ai/providers": [], "POST /api/import": imported });
    renderApp("/import");
    await userEvent.click(await screen.findByRole("button", { name: /from text/i }));
    await userEvent.click(screen.getByLabelText("Recipe text"));
    await userEvent.paste(PAGE);
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await vi.waitFor(() => expect(importBody(api)).toBeDefined());
    const body = importBody(api);
    expect(body.text).toBeUndefined();
    expect(body.html).toContain('"name":"Beans"');
    expect(body.provider).toBe("none");
  });

  it("explains the bookmark and offers its address to copy", async () => {
    fakeApi({ "GET /api/ai/providers": [] });
    renderApp("/import");
    await userEvent.click(await screen.findByText("How does the bookmark work?"));
    expect(screen.getByText("Show the bookmarks bar")).toBeVisible();
    expect(screen.getByRole("img", { name: /dragging the save to simmer button/i })).toBeInTheDocument();
    // jsdom can't copy, so the address is shown to copy by hand.
    await userEvent.click(screen.getByRole("button", { name: /copy bookmark address/i }));
    const address = await screen.findByRole("textbox", { name: "Bookmark address" });
    expect((address as HTMLTextAreaElement).value).toMatch(/^javascript:.*simmer-ready/);
  });

  it("imports the page the Save to Simmer bookmark sends", async () => {
    Object.defineProperty(window, "opener", { value: window, configurable: true });
    try {
      const api = fakeApi({ "GET /api/ai/providers": [], "POST /api/import": imported });
      renderApp("/import?from=browser");
      expect(await screen.findByText(/reading the recipe from your browser tab/i)).toBeInTheDocument();
      // The page listens once it knows which AI providers there are.
      await screen.findByText(/links are imported from the page's recipe data/);
      window.dispatchEvent(new MessageEvent("message", { data: { type: "simmer-page", url: "https://beans.example/", html: PAGE }, source: window }));
      await vi.waitFor(() => expect(lastNavigation()).toBe("PUSH /new"));
      expect(importBody(api)).toMatchObject({ url: "https://beans.example/", provider: "none" });
    } finally {
      Object.defineProperty(window, "opener", { value: null, configurable: true });
    }
  });
});

/** The requests made, as "METHOD url", whose text contains a part. */
const calls = (api: ReturnType<typeof fakeApi>, part: string) =>
  api.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`).filter((c) => c.includes(part));

describe("translations", () => {
  const shared = { "GET /api/languages": { base: "en", translations: ["de"] } };
  const soup = recipe({
    groups: [{ name: "", ingredients: [{ quantity: 2, quantity_max: null, unit: "tbsp", name: "soy sauce", note: "", original_text: "", grams_per_ml: null }] }],
  });
  const german = { ...soup, title: "Suppe", language: "de", groups: [{ name: "", ingredients: [{ ...soup.groups[0].ingredients[0], name: "Sojasauce" }] }] };

  it("opens a shared link in its language and keeps reading in it", async () => {
    const api = fakeApi({ ...shared, "GET /api/recipes/soup": german, "GET /api/auth/me": { user: null, needs_setup: false } });
    renderApp("/recipes/soup?lang=de");
    expect(await screen.findByRole("heading", { name: "Suppe", level: 1 })).toBeInTheDocument();
    expect(calls(api, "/api/recipes/soup")).toContain("GET /api/recipes/soup?lang=de");
    // Amounts use the German unit names.
    expect(screen.getByText(/2 EL/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recipe language: Deutsch" })).toBeInTheDocument();
    await vi.waitFor(() => expect(calls(api, "/api/recipes?")).toContainEqual(expect.stringContaining("lang=de")));

    await userEvent.click(screen.getByRole("button", { name: "Recipe language: Deutsch" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "English" }));
    expect(await screen.findByRole("button", { name: "Recipe language: English" })).toBeInTheDocument();
    expect(lastNavigation()).toBe("REPLACE /recipes/soup");
  });

  it("offers to translate a recipe that has no translation yet", async () => {
    setReadingLanguage("de");
    const api = fakeApi({ ...shared, "GET /api/recipes/soup": { ...soup, translation_outdated: true }, "POST /api/recipes/soup/translations/de": german });
    renderApp("/recipes/soup");
    expect(await screen.findByText("This recipe isn't translated into German yet, so it shows in English.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Translate now" }));
    expect(await screen.findByRole("heading", { name: "Suppe", level: 1 })).toBeInTheDocument();
    expect(calls(api, "/translations/")).toEqual(["POST /api/recipes/soup/translations/de"]);
    expect(screen.queryByRole("button", { name: "Translate now" })).not.toBeInTheDocument();
  });

  it("says when a translation is outdated", async () => {
    setReadingLanguage("de");
    fakeApi({ ...shared, "GET /api/recipes/soup": { ...german, translation_outdated: true } });
    renderApp("/recipes/soup");
    expect(await screen.findByText("This German translation was made from an older version of the recipe.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Translate again" })).toBeInTheDocument();
  });

  it("copies a link in the chosen language", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    fakeApi({ ...shared, "GET /api/recipes/soup": soup });
    renderApp("/recipes/soup");
    await userEvent.click(await screen.findByRole("button", { name: "Share" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Deutsch" }));
    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/recipes/soup?lang=de");
  });

  it("shows the link to copy by hand when the browser can't copy", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    fakeApi({ "GET /api/recipes/soup": soup });
    renderApp("/recipes/soup");
    await userEvent.click(await screen.findByRole("button", { name: "Share" }));
    expect(await screen.findByRole("textbox", { name: "Link" })).toHaveValue("http://localhost:3000/recipes/soup");
  });

  it("lets the author skip translating an edit", async () => {
    const api = fakeApi({ ...shared, "GET /api/ai/providers": [{ kind: "anthropic", configured: true }], "GET /api/recipes/soup": soup, "PUT /api/recipes/soup": () => soup });
    renderApp("/recipes/soup/edit");
    const box = await screen.findByRole("checkbox", { name: /update the german translation/i });
    expect(box).toBeChecked();
    await userEvent.click(box);
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() => expect(calls(api, "PUT")).toEqual(["PUT /api/recipes/soup?update_translations=false"]));
  });
});

describe("translation settings", () => {
  it("chooses the languages to share in and translates the missing recipes", async () => {
    const status = { languages: [], missing: 0, running: false, done: 0, total: 0, failed: 0, error: null };
    const api = fakeApi({
      "GET /api/admin/ai/providers": [{ kind: "anthropic", label: "Anthropic", model: "claude", is_default: true, configured: true, key_hint: "1234", default_model: "claude" }],
      "GET /api/admin/translations": status,
      "PUT /api/admin/translations": (init: RequestInit) => ({ ...status, languages: JSON.parse(String(init.body)).languages, missing: 3 }),
      "POST /api/admin/translations/fill": { ...status, languages: ["de"], missing: 3, running: true, total: 3 },
    });
    renderApp("/admin/ai");
    await userEvent.click(await screen.findByRole("checkbox", { name: "German" }));
    expect(await screen.findByText("3 translations are missing or outdated.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Translate now" }));
    expect(await screen.findByText("Translating… 0 of 3 done.")).toBeInTheDocument();
    expect(api.mock.calls.some(([url, init]) => init?.method === "POST" && String(url).endsWith("/api/admin/translations/fill"))).toBe(true);
  });
});

describe("users page", () => {
  it("asks in a dialog before deleting an account", async () => {
    const sam = { ...USER, id: 2, username: "sam", display_name: "Sam", role: "member" };
    const api = fakeApi({ "GET /api/users": [USER, sam], "DELETE /api/users/2": () => null });
    renderApp("/admin/users");
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Sam" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /delete account/i }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete the account of Sam?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => expect(api.mock.calls.some(([url, init]) => init?.method === "DELETE" && String(url).endsWith("/api/users/2"))).toBe(true));
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

  it("refresh the shopping list after saving a recipe", async () => {
    const soup = recipe({ title: "Soup" });
    fakeApi({ "GET /api/recipes/soup": soup, "PUT /api/recipes/soup": () => ({ ...soup, title: "Better soup" }) });
    const client = createQueryClient();
    renderApp("/recipes/soup/edit", client);
    await userEvent.click(await screen.findByRole("button", { name: /save/i }));
    // Earlier tests may have left the same toast up.
    expect(await screen.findAllByText("Recipe saved")).not.toHaveLength(0);
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

describe("about dialog", () => {
  it("shows the version and the commit the image was built from", async () => {
    fakeApi({ "GET /api/version": { version: "0.2.0", commit: "827aa0a1b2c3d4e5" } });
    renderApp("/settings");
    await userEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "About Simmer" }));

    const dialog = await screen.findByRole("dialog", { name: "About Simmer" });
    expect(await within(dialog).findByText("0.2.0")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "827aa0a" })).toHaveAttribute(
      "href",
      "https://github.com/KamiNeko/simmer/commit/827aa0a1b2c3d4e5",
    );
    expect(within(dialog).getByRole("link", { name: "Report an issue" })).toBeInTheDocument();
  });

  it("says when the app was built from source", async () => {
    fakeApi({ "GET /api/version": { version: "0.2.0", commit: null } });
    renderApp("/settings");
    await userEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "About Simmer" }));
    expect(await screen.findByText("Built from source")).toBeInTheDocument();
  });
});
