# Architecture

Simmer is a FastAPI backend with a SQLite database and a React single-page app. In production both run from one Docker image: the Dockerfile builds the frontend with Node 22, copies the result into a Python 3.13 image, and Uvicorn serves the API and the built files on port 8080.

## Layout

```
backend/
  pyproject.toml          dependencies, Ruff, pytest and coverage settings
  app/
    main.py               the FastAPI app: middleware, routers, photo route, SPA and link previews
    config.py             settings from SIMMER_* environment variables and .env
    db.py                 engine (foreign keys and WAL on), session per request
    models.py             SQLAlchemy models
    schemas.py            Pydantic request and response models
    deps.py               session cookie lookup: OptionalUser, CurrentUser, AdminUser
    security.py           Argon2 password hashing, session tokens
    hardening.py          security headers, same-origin check, body size limits
    crypto.py             encryption of AI provider keys with secret.key
    migrations.py         runs Alembic to head on start
    alembic/              migration environment and versions/000N_name.py
    recipe_service.py     shared recipe helpers: slugs, loading, saving, edit rights
    stats.py              ratings and cook counts for many recipes in one query
    search.py             the FTS5 search index
    photos.py             photo decoding, resizing to WebP, images for the AI
    importer.py           fetching pages safely and reading their recipe data
    ingredient_parser.py  "1 1/2 cups flour, sifted" to quantity, unit, name and note
    units.py              unit names and aliases
    llm/                  AI providers behind one interface, plus the recipe prompts
    routers/              one module per area: auth, users, recipes, journal, ai,
                          shopping, plan, backup
  tests/                  pytest, one file per area

frontend/
  package.json            scripts: dev, build, lint, test, coverage
  vite.config.ts          dev proxy for /api, Vitest and coverage settings
  src/
    main.tsx              QueryClientProvider, router and toaster
    App.tsx               routes
    lib/
      api.ts              types for every API object and the `api` object of fetch calls
      queries.ts          shared queries used by several screens
      queryClient.ts      TanStack Query setup, including the global error toast
      auth.tsx            useAuth: the signed-in user and setup state
      convert.ts          unit conversion and servings scaling, for display only
      shopping.ts         combines the ingredients of several recipes
      quantity.ts, dates.ts, theme.ts, utils.ts
    pages/                one component per screen
    components/           shared pieces: app shell, recipe view, journal, editor parts
    components/ui/        shadcn/ui building blocks
    test/                 test setup and a fake API
```

## Request flow

1. The browser talks to the reverse proxy, which forwards to Uvicorn on port 8080. Uvicorn runs with `--proxy-headers` and trusts `X-Forwarded-For` and `X-Forwarded-Proto` from the addresses in `FORWARDED_ALLOW_IPS`.
2. `HardeningMiddleware` (`hardening.py`) sees every request first. For requests that change data it checks that they come from Simmer's own pages and that the body is within its size limit, and for large uploads that a valid session cookie is present. It adds the security headers to every response.
3. FastAPI routes the request:
   - `/api/...` goes to a router in `app/routers/`. The interactive reference is at `/api/docs`.
   - `/media/photos/<name>.webp` serves a photo from the data folder.
   - `/assets/...` serves the built JavaScript and CSS.
   - Anything else returns `index.html`, so the React router can take over. For `/recipes/<slug>` the server first puts the recipe's title, description and photo into Open Graph tags, so shared links get a preview.
4. Route handlers get their database session and user through dependencies in `deps.py`. The session cookie `simmer_session` holds a random token; the database stores its SHA-256 hash in the `sessions` table. `OptionalUser` allows visitors, `CurrentUser` needs a login, and `AdminUser` needs an admin.
5. Handlers use SQLAlchemy 2.0 models and commit explicitly. Shared recipe logic lives in `recipe_service.py`, so the recipe, import and backup routers save recipes the same way.

On start, the `lifespan` function in `main.py` runs the Alembic migrations to head and creates the admin from the environment if there are no users yet.

## Data model

All tables are defined in `backend/app/models.py`.

- **users** and **sessions**: accounts with a role (`admin` or `member`), an Argon2 password hash and a preferred unit system. Sessions store the token hash and expiry.
- **recipes**: title, unique slug, description, source URL, servings, times, author and photo name. A recipe has:
  - **ingredient_groups** (an empty name for the main group), each with ordered **ingredients**: quantity, optional maximum for ranges, unit, name, note, the original text and an optional density (`grams_per_ml`).
  - ordered **steps**, each with an optional section name.
  - **tags** through the `recipe_tags` table. Tags no recipe uses any more are removed.
- **ratings** (one per user and recipe), **cook_log** (each time someone cooked a recipe) and **comments** (private notes, which can be ticked off as done). Together these are the journal.
- **shopping_recipes**, **shopping_extras** and **shopping_checks**: each user's shopping list, as recipes with servings, typed-in items and ticked-off lines. The server stores these, and the browser adds up the ingredients (`lib/shopping.ts`).
- **plan_entries**: the household's meal plan, one recipe or note per entry and day.
- **llm_providers**: the configured AI providers, with the encrypted API key and its last 4 characters.
- **recipe_search**: the FTS5 full-text index (see below). It is not a model.

Amounts are stored as entered. Unit conversion and servings scaling happen only in the browser (`lib/convert.ts`).

## Search

Search uses an SQLite FTS5 virtual table, `recipe_search`, with the columns title, description, ingredients and tags. It uses the `unicode61` tokenizer with `remove_diacritics 2`, so "creme" finds "crème". The table is created in migration `0002` and is excluded from Alembic autogenerate (`include_object` in `alembic/env.py`), so any change to it is a hand-written migration.

`search.py` keeps it in sync: `index_recipe` rewrites a recipe's row whenever it is created, changed or imported, and `remove_recipe` deletes it. The row id is the recipe id.

`search_ids` runs a query in two passes:

1. Every word of the input must match as a word prefix (`"word"*`). Results are ranked with `bm25`, weighting title matches highest, then tags, ingredients and description.
2. Recipes that only contain the words inside longer words (such as "salat" in "Kartoffelsalat") follow, found with `LIKE`.

`GET /api/recipes?q=...` keeps that order unless the user picked another sort.

## Adding an AI provider

Providers live in `backend/app/llm/`. Each one is a small adapter that turns a prompt, optional images and a JSON schema into JSON text. The prompts and validation in `llm/recipes.py` are shared by all of them.

1. **Write the adapter**, for example `llm/mistral_provider.py`, following `anthropic_provider.py`. It needs:
   - `kind` (a short id of at most 16 characters, stored in `llm_providers.kind`) and `model` attributes,
   - `generate_json(system, prompt, schema, images=())` that returns the model's answer as JSON text matching `schema`. `images` are `Image` objects with JPEG bytes.
   - The client stored as `self._client`, created with `TIMEOUT_SECONDS` and limited to `MAX_OUTPUT_TOKENS` from `llm/base.py`.
   - Errors mapped to `LLMError` with a short message for the user: rejected key, unknown model, other API errors, connection failures, refusals, cut-off and empty answers.
2. **Register it** in `llm/base.py`: add an entry to `KINDS` with its `label` and `default_model`, and a branch in `build_provider`. The import there stays inside the branch, so an SDK only loads when it is used. `KINDS` drives the API, so the admin page and the provider switch pick it up.
3. **Add the SDK** to `dependencies` in `backend/pyproject.toml` with a version range.
4. **Test it** in `backend/tests/test_llm_providers.py`. Teach `_fake_client` how to stand in for the new SDK's client, and add cases to `CASES` for each error mapping and for a good answer. The tests never touch the network.
5. **Frontend:** add the kind to `ProviderKind` in `src/lib/api.ts` and a link to the provider's API key page in `KEY_LINKS` in `src/pages/AIProvidersPage.tsx`. TypeScript reports both if you miss one.
6. Update [ai-import.md](ai-import.md) and the README.

No migration is needed: providers are stored by their `kind` string.

## Frontend data fetching

All server state goes through TanStack Query. There is no other global store.

- **`lib/api.ts`** has the types for every API object and one `api` object with a function per endpoint. They all go through `request()`, which sends the session cookie, encodes JSON or `FormData`, and turns an error reply into an `ApiError` with the HTTP status and the server's `detail` message.
- **Queries** call `useQuery` with a key such as `["recipe", slug]`. Queries that several screens share live in **`lib/queries.ts`** (for example `useRecipe`), so they use the same key and cache. `useAuth` in `lib/auth.tsx` wraps the `/api/auth/me` query.
- Queries retry only on network errors and 5xx replies, at most twice, and don't refetch on window focus (`lib/queryClient.ts`).
- **Mutations** call `useMutation` and, on success, update or invalidate the affected query keys.
- **Errors from mutations** show as a toast automatically, through the `MutationCache` in `lib/queryClient.ts`. A screen that shows the error next to its form opts out with `meta: { inlineError: true }`, as the login and import screens do. A mutation with its own `onError` also gets no global toast. The `meta` type is declared in `lib/queryClient.d.ts`.
