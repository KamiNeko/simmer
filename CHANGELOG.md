# Changelog

All notable changes to Simmer are listed here. Versions follow [Semantic Versioning](https://semver.org/).

## 0.5.0 (2026-10-20)

### Added

- **Translate recipes on import.** Pick a language under **Language of imported recipes** in Settings, and AI imports translate the recipe into it: title, description, ingredients, steps and tags. It is off by default, and the import screen can change it for a single import. Each ingredient keeps its original line as the source, so you can check the translation. See [AI import](docs/ai-import.md#translating-imports).

### Fixed

- Chrome no longer offers saved passwords in the recipe list's filter field.

## 0.4.0 (2026-10-20)

### Changed

- **Filters combine.** My Recipes and the tags in the sidebar now narrow the recipe list together instead of replacing each other. Click a tag to add it, click it again to remove it; picking several tags shows recipes that have all of them. All Recipes clears every filter. The API accepts `tag` more than once.

### Fixed

- Chrome no longer offers saved passwords in the header search field.

## 0.3.0 (2026-10-20)

### Removed

- **Meal plan.** The Meal plan page, the Plan button on recipes and the `/api/plan` endpoints are gone. The shopping list works as before. Existing meal plan entries stay in the database but are no longer shown.

### Added

- **About Simmer** in the account menu shows the version and the commit the Docker image was built from, with links to GitHub, the changelog and the issue tracker. Include the version when you report a bug.
- The import page explains step by step how to add the **Save to Simmer** bookmark and use it.

## 0.2.0 (2026-10-19)

### Import

- **Save to Simmer bookmark** for recipe sites that block Simmer from downloading their pages, such as sites behind Cloudflare's browser check. Drag the button on the import page to the bookmarks bar, then click the bookmark on a recipe page: Simmer opens with the recipe in the review editor, read from the page's recipe data without AI.
- **From text** also accepts a recipe page's source (Ctrl+U, then copy everything) and reads the recipe data in it, without needing an AI provider.
- When a site refuses a link import, the error explains that the site blocked Simmer and points to the bookmark, From text and From photos, instead of showing a bare error code.
- Link imports send the headers a browser would, which gets past simpler bot filters.
- Signing in keeps the full address you were going to, so the bookmark still works when you weren't signed in.

## 0.1.0 (2026-10-19)

The first release.

### Recipes

- Recipes with ingredient groups (main, marinade, sauce, ...), ordered steps with optional sections, tags, servings, times, a source link and a photo.
- Public, read-only recipe pages, with link previews when a recipe is shared.
- Accounts for the people who add recipes. Members edit their own recipes, admins edit all of them. The first admin is created on a setup screen or from environment variables. There is no public sign-up.
- Full-text search over titles, descriptions, ingredients and tags, which also finds words inside longer words. Filter by tag or author, and sort by rating, how often a recipe was cooked or when.
- Amounts are stored as written and shown in metric, US or the original units, scaled to the servings you pick. Oven temperatures and pan sizes in the steps convert too.
- A full-screen cooking view with large text, ingredient checkboxes and one step at a time, which keeps the screen on.

### Import

- Import from a link: Simmer reads the recipe data most recipe sites embed, including ingredient headings from WP Recipe Maker and Tasty Recipes.
- Import from pasted text, and from up to 6 photos of cookbook pages or a handwritten card.
- Anthropic, OpenAI and Google Gemini as AI providers, set up by the admin, with a default and a per-import switch. Keys are stored encrypted and never sent to the browser.
- A review screen shows each ingredient next to its source line, and can re-import with another provider. Nothing is saved until you press Save.
- **Tidy up** splits typed ingredient lines into fields and suggests groups.

### Journal

- Star ratings, an "I cooked this" log and private notes per user, which can be ticked off once worked into the recipe.
- Visitors see the average rating and how often a recipe was cooked.

### Shopping list and meal plan

- A personal shopping list that adds up the ingredients of several recipes, in your preferred units, with your own extra items and checkboxes.
- A weekly meal plan shared by the household, with recipes and notes per day. A whole week can go onto the shopping list.

### Export and backup

- Recipe export as a zip of `recipes.json` and photos, and import of such a zip into another Simmer.
- A full backup download for admins: a consistent copy of the database taken while Simmer runs, the photos and `secret.key`.

### Security hardening

- Login throttling per address and per username from one address, so guessing from elsewhere can't lock an account out, and signing out other devices when a password changes.
- The Docker image trusts `X-Forwarded-For` only from loopback and private network addresses.
- Recipe file imports are capped at 5000 recipes and limit photo decoding, and Simmer's data files are readable by its own user only.
- A strict Content-Security-Policy and other security headers, and a same-origin check on every request that changes data.
- Request body limits enforced before the body is read, with larger uploads only for signed-in users.
- Link imports only fetch public addresses, check the address actually connected to, and stop after 60 seconds or 5 MB.
- Uploaded images over 40 megapixels are refused before decoding.

### Quality

- Backend tests for permissions, sessions, AI providers, fetching and the frontend routes, with a 90% coverage floor in CI.
- Frontend type checking, oxlint and component tests with Vitest.
- Shared recipe helpers, batched stats queries and indexes on foreign keys.
- CI runs Ruff, pytest, the frontend lint, tests and build, and publishes the Docker image from `main`.
- Documentation for self-hosting, AI import, architecture, contributing and security, and a README with screenshots generated from a demo household (`npm run screenshots`).
- Light-mode colours meet WCAG AA contrast, the theme follows the system until you choose one, and the menu drawer and dialogs work with the keyboard.
