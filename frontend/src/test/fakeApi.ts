import { vi } from "vitest";

import type { Recipe, User } from "@/lib/api";

export const USER: User = { id: 1, username: "alex", display_name: "Alex", role: "admin", unit_system: "metric", created_at: "2026-01-01T00:00:00Z" };

export function recipe(changes: Partial<Recipe> = {}): Recipe {
  return {
    id: 1,
    slug: "soup",
    title: "Soup",
    description: "",
    servings: 4,
    total_minutes: null,
    tags: [],
    author: { id: 1, display_name: "Alex" },
    ingredient_preview: "",
    photo_url: null,
    thumb_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    can_edit: true,
    avg_rating: null,
    rating_count: 0,
    cooked_count: 0,
    my_rating: null,
    my_cooked_count: 0,
    my_last_cooked_at: null,
    source_url: null,
    prep_minutes: null,
    cook_minutes: null,
    groups: [],
    steps: [],
    ...changes,
  };
}

type Handler = (init: RequestInit | undefined) => unknown;

/**
 * Replace fetch with canned answers keyed by "METHOD /path". Unlisted GETs answer with an
 * empty list; a handler that throws answers with that message as a 400.
 */
export function fakeApi(routes: Record<string, Handler | unknown>) {
  const answers: Record<string, Handler | unknown> = {
    "GET /api/auth/me": { user: USER, needs_setup: false },
    "GET /api/shopping": { recipes: [], extras: [], checked: [] },
    ...routes,
  };
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input), "http://simmer.test");
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    const answer = answers[key] ?? (/^GET \/api\/recipes\/[^/]+\/journal$/.test(key) ? { rating: null, cooks: [], comments: [] } : undefined);
    if (answer === undefined) {
      if (key.startsWith("GET ")) return Response.json([]);
      return Response.json({ detail: `No fake for ${key}` }, { status: 500 });
    }
    try {
      return Response.json(typeof answer === "function" ? (answer as Handler)(init) : answer);
    } catch (error) {
      return Response.json({ detail: (error as Error).message }, { status: 400 });
    }
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
