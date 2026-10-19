# Simmer

A small, self-hosted recipe manager for a household. Recipe pages are public and read-only. People with an account add and edit recipes, rate them, log each time they cook one, and keep private notes such as "needs more salt" that they tick off once they have worked them into the recipe.

- Recipes with ingredient groups (main, marinade, sauce, ...), photos, tags and full-text search.
- Import from a link, pasted text or photos of cookbook pages, with Anthropic, OpenAI or Google Gemini sorting the ingredients into groups.
- Amounts convert between metric, US and the original units and scale with the servings. A cooking view keeps the screen on.
- A weekly meal plan shared by the household, and a shopping list that adds up the ingredients of several recipes.
- Recipe export and import, and a full backup download for admins.

All four milestones of the [specification](https://claude.ai/code/artifact/1f322e02-dcf9-40b4-a41e-3d696455e99c) are done. See [CHANGELOG.md](CHANGELOG.md) for what is in each release.

## Documentation

- [Self-hosting](docs/self-hosting.md): Docker on a Proxmox LXC, reverse proxy examples, HTTPS, updates and troubleshooting.
- [AI import](docs/ai-import.md): setting up providers and what each import sends to them.
- [Architecture](docs/architecture.md): how the code is laid out and how to extend it.
- [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md).
- The API reference is served by Simmer itself at `/api/docs`.

## Run it with Docker Compose

On your server (for example a Proxmox LXC with Docker):

```sh
git clone https://github.com/KamiNeko/simmer.git && cd simmer
cp .env.example .env        # set the base URL, and optionally the admin account and secret key
mkdir -p data && sudo chown 1000:1000 data   # the container runs as uid 1000
docker compose up -d --build
```

Simmer listens on port 8080. Put it behind a reverse proxy for HTTPS. [docs/self-hosting.md](docs/self-hosting.md) has Caddy and nginx examples and explains how to bind the port to localhost.

If `SIMMER_ADMIN_USERNAME` and `SIMMER_ADMIN_PASSWORD` are not set, the first visit shows a setup screen to create the admin account. These two variables are only used while there are no users at all, so changing them later does nothing. The admin creates further accounts under **Users**. There is no public sign-up.

## Configuration

Set these in `.env` next to `docker-compose.yml`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SIMMER_BASE_URL` | `http://localhost:8080` | Public URL of the app, used in link previews. An `https://` address turns on secure cookies. |
| `SIMMER_ADMIN_USERNAME`, `SIMMER_ADMIN_PASSWORD` | unset | Admin account created on start, but only while no users exist. |
| `SIMMER_SECRET_KEY` | generated into `data/secret.key` | Encrypts the stored AI provider keys. If it changes, re-enter the keys. |
| `SIMMER_COOKIE_SECURE` | follows `SIMMER_BASE_URL` | Send the login cookie over HTTPS only. Set `false` only to try Simmer over plain http. |
| `SIMMER_SESSION_DAYS` | `30` | How many days a login lasts. |
| `SIMMER_DATA_DIR` | `/data` in Docker, `./data` otherwise | Where the database, photos and `secret.key` live. |
| `SIMMER_STATIC_DIR` | `/app/static` in Docker, unset otherwise | The built frontend. Unset means the backend serves only the API, which is what development uses. |
| `FORWARDED_ALLOW_IPS` | `*` in Docker | Read by Uvicorn: the proxies trusted to set `X-Forwarded-For` and `X-Forwarded-Proto`. Use your proxy's IP, or keep `*` when port 8080 is bound to localhost. |

`SIMMER_STATIC_DIR` and `FORWARDED_ALLOW_IPS` are set in the Dockerfile. You rarely need to change the first one.

## Backup and restore

Everything lives in the data folder (`./data` with the compose file):

- `simmer.db` is the SQLite database, with `simmer.db-wal` and `simmer.db-shm` next to it while Simmer runs.
- `photos/` holds the recipe photos.
- `secret.key` encrypts the AI keys, unless you set `SIMMER_SECRET_KEY`.

**Back up** from the app: an admin opens **Export & backup** in the account menu and presses **Download full backup**. The zip holds a consistent copy of `simmer.db` taken while Simmer runs, the photos and `secret.key`.

If you copy the folder by hand instead, stop the container first (`docker compose stop`) or copy `simmer.db-wal` and `simmer.db-shm` along with `simmer.db`. Recent changes may still sit in the WAL file, and a copy of `simmer.db` alone can miss them.

**Restore:**

```sh
docker compose stop
rm -rf data/*                      # or move it aside to keep a copy
unzip simmer-backup-YYYY-MM-DD.zip -d data
sudo chown -R 1000:1000 data
docker compose start
```

Clearing the folder matters: an old `simmer.db-wal` or `simmer.db-shm` next to a restored database can damage it. If you set `SIMMER_SECRET_KEY`, the backup has no `secret.key`, so keep the same value in `.env`.

**Recipe export is not a backup.** **Download recipes** (any signed-in user) gives a zip with `recipes.json` and the photos, meant for moving recipes to another Simmer. It leaves out accounts, ratings, cook logs, notes, the meal plan, shopping lists and AI settings. **Import recipes** reads such a zip and skips recipes whose title already exists. The person importing becomes the author.

## Updating

```sh
git pull && docker compose up -d --build
```

Database migrations run automatically on start. Take a backup first. More in [docs/self-hosting.md](docs/self-hosting.md#updating).

## Who can do what

| | Visitor | Member | Admin |
| --- | --- | --- | --- |
| Browse and search recipes | ✓ | ✓ | ✓ |
| See average rating and cooked count | ✓ | ✓ | ✓ |
| Add recipes | | ✓ | ✓ |
| Edit or delete recipes | | own | all |
| Rate, log cooking, keep private notes | | ✓ | ✓ |
| Meal plan, shopping list, recipe export and import | | ✓ | ✓ |
| Import recipes and use Tidy up | | ✓ | ✓ |
| Manage accounts and AI providers, full backup | | | ✓ |

## Using Simmer

**Units.** Amounts are stored as written and only converted for display, so switching never loses anything. Each user picks a default (metric, US or as written) in **Settings**, and every recipe page has a toggle and a servings scaler. Weights convert both ways. Cups become grams when the ingredient has a density (imports fill it in), otherwise millilitres. Tablespoons and teaspoons stay spoons below about 20 g. Counted things (eggs, cloves, cans) never convert. Oven temperatures and pan sizes in the steps convert too.

**Cook** opens a full-screen view with large text, ingredient checkboxes and one highlighted step at a time. The screen stays on while it is open, in browsers that support it.

**Meal plan** shows a week from Monday to Sunday. Add a recipe or a note such as "Leftovers" to any day, change servings or move entries. Everyone who is signed in shares the same plan. **Add week to shopping list** puts the week's recipes on your own list.

**Shopping list.** **Add to list** on a recipe adds it at the servings you are viewing. The list adds up ingredients across recipes, shows them in your preferred units, and lets you add your own items and tick things off. Each user has their own list.

**Importing.** Use the import button next to **New**. Nothing is saved until you press Save. See [docs/ai-import.md](docs/ai-import.md).

## Development

You need Python 3.12 or newer (CI and the Docker image use 3.13) and Node 22.

Backend (FastAPI, SQLAlchemy, Alembic):

```sh
cd backend
python -m venv .venv && .venv/bin/pip install -e '.[dev]'
SIMMER_ADMIN_USERNAME=admin SIMMER_ADMIN_PASSWORD=password .venv/bin/uvicorn app.main:app --reload --port 8080
```

Frontend (React, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query):

```sh
cd frontend
npm install
npm run dev     # http://localhost:5173, proxies /api to port 8080
```

CI runs these checks. Run them before you open a pull request:

```sh
cd backend
.venv/bin/ruff check app tests
.venv/bin/ruff format --check app tests
.venv/bin/pytest -q --cov --cov-report=term-missing:skip-covered   # fails below 90% coverage

cd ../frontend
npm run lint        # tsc type check plus oxlint
npm test            # vitest
npm run coverage    # vitest with coverage, fails below 40% of lines
npm run build
```

### Adding a database migration

After changing `backend/app/models.py`, generate a migration. There is no `alembic.ini`, so call Alembic from Python. Give it the next revision id after the newest file in `backend/app/alembic/versions` (they are named `000N_name.py`):

```sh
cd backend
.venv/bin/python -c "from alembic import command; from app.db import get_engine; from app.migrations import alembic_config, upgrade_database; e = get_engine(); upgrade_database(e); command.revision(alembic_config(e), message='describe change', autogenerate=True, rev_id='0007')"
.venv/bin/ruff check --fix app/alembic && .venv/bin/ruff format app/alembic
```

This first brings your local `./data/simmer.db` up to date, then compares it with the models and writes `0007_describe_change.py`. Ruff then tidies the generated imports and quotes. Read the result before you commit it. The full-text search table (`recipe_search`, FTS5) is excluded from autogenerate, so changes to it are written by hand with `op.execute`. `tests/test_migrations.py` fails if the models and migrations disagree.

See [CONTRIBUTING.md](CONTRIBUTING.md) for code style and the pull request flow.

## License

[MIT](LICENSE)
