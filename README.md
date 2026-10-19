# Simmer

A small, self-hosted recipe manager for a household: public read-only recipe pages, ingredient groups (main, marinade, sauce, …), photos, full-text search, and accounts for the people who add and edit recipes. Logged-in users rate recipes, log each time they cook one, and keep private notes such as "needs more salt" that they can tick off once worked into the recipe. Visitors see the average rating and how often a recipe was cooked. Recipes can be imported from a link, pasted text or photos of cookbook pages, with Anthropic, OpenAI or Google Gemini sorting ingredients into groups. Amounts convert between metric, US and the original units, scale with the servings, a cooking view keeps the screen on, and a shopping list adds up the ingredients of several recipes.

All four milestones of the [specification](https://claude.ai/code/artifact/1f322e02-dcf9-40b4-a41e-3d696455e99c) are done.

## Run it with Docker Compose

On your server (for example a Proxmox LXC with Docker):

```sh
git clone https://github.com/KamiNeko/simmer.git && cd simmer
cp .env.example .env        # set the admin password, secret key and base URL
mkdir -p data && sudo chown 1000:1000 data   # the container runs as uid 1000
docker compose up -d --build
```

Simmer listens on port 8080. Put it behind your reverse proxy (Nginx Proxy Manager, Traefik, Caddy) for HTTPS and keep `SIMMER_COOKIE_SECURE=true`.

If `SIMMER_ADMIN_USERNAME` and `SIMMER_ADMIN_PASSWORD` are not set, the first visit shows a setup screen to create the admin account. Further accounts are created by the admin under **Users**; there is no public sign-up.

**Backup:** everything lives in `./data` (the SQLite database, recipe photos and, unless you set `SIMMER_SECRET_KEY`, the generated `secret.key` that encrypts the AI keys). Copy that folder.

**Updates:** `git pull && docker compose up -d --build`. Database migrations run automatically on start.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `SIMMER_ADMIN_USERNAME`, `SIMMER_ADMIN_PASSWORD` | unset | Admin account created on first start |
| `SIMMER_SECRET_KEY` | generated into `data/secret.key` | Encrypts the stored AI provider keys. If it changes, re-enter the keys |
| `SIMMER_BASE_URL` | `http://localhost:8080` | Public URL, used in link previews |
| `SIMMER_COOKIE_SECURE` | `false` | Send the login cookie over HTTPS only |
| `SIMMER_DATA_DIR` | `/data` in Docker | Where the database and photos are stored |

## Who can do what

| | Visitor | Member | Admin |
| --- | --- | --- | --- |
| Browse and search recipes | ✓ | ✓ | ✓ |
| Add recipes | | ✓ | ✓ |
| Edit or delete recipes | | own | all |
| See average rating and cooked count | ✓ | ✓ | ✓ |
| Rate, log cooking, keep private notes | | ✓ | ✓ |
| Import recipes and use Tidy up | | ✓ | ✓ |
| Manage accounts and AI providers | | | ✓ |

## Units and cooking

Amounts are stored as written and only converted for display, so switching never loses anything. Each user picks a default (metric, US or as written) in **Settings**, and every recipe page has a toggle and a servings scaler. Visitors' last choice is remembered in their browser.

- Weights convert both ways (lb and oz to g and kg).
- Cups and other volumes become grams when the ingredient has a density (imports fill it in), otherwise millilitres.
- Tablespoons and teaspoons stay spoons below about 20 g, which keeps spices and sauces readable.
- Counted things (eggs, cloves, cans) never convert.
- Oven temperatures and sizes in the steps convert too (425°F to 220 °C, 9x13-inch to 23 × 33 cm).

**Cook** opens a full-screen view with large text, ingredient checkboxes and one highlighted step at a time (arrow keys or the Back and Next buttons). The screen stays on while it is open, in browsers that support it.

## Shopping list

Press **Add to list** on a recipe to put it on your shopping list at the servings you are viewing. The list adds up ingredients across recipes (weights and ingredients with a density in grams, other volumes in millilitres, everything else in its own unit) and shows them in your preferred units, with the recipes each line comes from. You can change servings per recipe, add your own items, tick things off as they go in the basket, copy the open items as text, or clear the list. Each user has their own list.

## Importing recipes

Use the import button next to **New** and paste a link or the recipe text, or add photos of cookbook pages or a handwritten card (up to 6, in page order). Simmer reads the recipe data most recipe sites embed (including ingredient headings from WP Recipe Maker and Tasty Recipes), hands it to the AI, and opens the result in the editor with each ingredient's source line beside it. Nothing is saved until you press Save; the page's photo is downloaded then.

The admin adds API keys under **AI providers** (Anthropic, OpenAI, Google Gemini), picks the model and the default, and can test the connection. Keys are stored encrypted and never sent back to the browser. The import screen can switch provider, and the review screen can re-import with another one when a result looks wrong.

Without any provider, links still import from the page's recipe data, without grouping fixes or densities. Pasted text, photos and **Tidy up** (which splits typed ingredient lines into fields and suggests groups) need a provider.

Imports only fetch public addresses, so the import can't be used to reach services on your home network.

## Development

Backend (Python 3.12+, FastAPI, SQLAlchemy, Alembic):

```sh
cd backend
python -m venv .venv && .venv/bin/pip install -e '.[dev]'
SIMMER_ADMIN_USERNAME=admin SIMMER_ADMIN_PASSWORD=password .venv/bin/uvicorn app.main:app --reload --port 8080
.venv/bin/pytest
```

Frontend (React, TypeScript, Vite, Tailwind CSS, shadcn/ui):

```sh
cd frontend
npm install
npm run dev     # http://localhost:5173, proxies /api to port 8080
npm test
```

After changing models, create a migration with:

```sh
cd backend && .venv/bin/python -c "from alembic import command; from app.migrations import alembic_config; from app.db import get_engine; command.revision(alembic_config(get_engine()), message='describe change', autogenerate=True)"
```

## License

[MIT](LICENSE)
