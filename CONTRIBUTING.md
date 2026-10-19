# Contributing to Simmer

Thanks for helping. Simmer is a small app for households, so changes should stay small and easy to run on a home server. If you plan something bigger than a bug fix, open an issue first so we can agree on the approach.

Security problems go through a private advisory, not an issue. See [SECURITY.md](SECURITY.md).

## Setup

You need Python 3.12 or newer (CI uses 3.13), Node 22 and git.

```sh
git clone https://github.com/KamiNeko/simmer.git && cd simmer

# Backend
cd backend
python -m venv .venv && .venv/bin/pip install -e '.[dev]'
SIMMER_ADMIN_USERNAME=admin SIMMER_ADMIN_PASSWORD=password .venv/bin/uvicorn app.main:app --reload --port 8080

# Frontend, in a second terminal
cd frontend
npm install
npm run dev     # http://localhost:5173, proxies /api to port 8080
```

The backend keeps its database and photos in `backend/data/`, which git ignores. Delete that folder to start over.

The Vite dev server passes `/api` and `/media` (recipe photos) through to the backend on port 8080.

[docs/architecture.md](docs/architecture.md) explains how the code is laid out.

## Checks

CI (`.github/workflows/ci.yml`) runs these on every pull request. Run them locally first:

```sh
cd backend
.venv/bin/ruff check app tests
.venv/bin/ruff format --check app tests
.venv/bin/pytest -q --cov --cov-report=term-missing:skip-covered

cd ../frontend
npm run lint        # tsc type check, then oxlint with warnings treated as errors
npm test            # vitest, once
npm run coverage    # vitest with coverage
npm run build
```

Coverage has a floor: 90% for the backend (`fail_under` in `backend/pyproject.toml`) and 40% of lines for the frontend (`thresholds` in `frontend/vite.config.ts`). Raise them when you add tests, never lower them.

## Code style

- **Python:** Ruff formats and lints the code with a line length of 100 (`[tool.ruff]` in `pyproject.toml`). `ruff format app tests` and `ruff check --fix app tests` fix most things. Use type hints on function signatures.
- **TypeScript:** strict type checking with `tsc`, and oxlint with the rules in `frontend/.oxlintrc.json`. Use the `@/` import alias for `src/`. UI building blocks live in `src/components/ui` (shadcn/ui).
- **Comments and docstrings:** one plain-English line that says why, not what. Public backend functions get a one-line docstring. Route docstrings show up in the API reference at `/api/docs`.
- **Words in the UI:** short, friendly sentences. Error messages say what to do next, for example "An admin can add one under AI providers."
- **Database changes** need an Alembic migration. See [Adding a database migration](README.md#adding-a-database-migration).
- Keep dependencies few. Ask in an issue before adding a new one.

## Tests

Every change in behaviour comes with a test.

- **Backend** tests live in `backend/tests` and use FastAPI's test client against a fresh SQLite database in a temporary folder. The `client`, `admin` and `member` fixtures in `conftest.py` give you an anonymous client, a signed-in admin and a signed-in member. Test through the HTTP API where you can, including the permission checks (see `test_permissions.py`). Tests never touch the network: AI providers and page fetching are replaced with fakes.
- **Frontend** tests sit next to the code as `*.test.ts` or `*.test.tsx` and run with Vitest, jsdom and Testing Library. `src/test/fakeApi.ts` has sample data and a fake API.
- A bug fix starts with a test that fails without the fix.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change in small commits with clear messages, such as "Keep the servings when a recipe is planned twice".
3. Run the checks above.
4. Update the docs when behaviour, settings or commands change: `README.md`, the files in `docs/`, and `CHANGELOG.md` under a new "Unreleased" heading.
5. Open a pull request against `main` and describe what changed and why. Add screenshots for UI changes.
6. CI must pass. A maintainer reviews the change and merges it. Pushes to `main` publish a new Docker image.
