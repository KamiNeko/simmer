# Simmer

A small, self-hosted recipe manager for a household: public read-only recipe pages, ingredient groups (main, marinade, sauce, …), and accounts for the people who add and edit recipes.

This is milestone 1 of the [specification](https://claude.ai/code/artifact/1f322e02-dcf9-40b4-a41e-3d696455e99c). Ratings, cooking notes, photos, LLM import and unit conversion follow in later milestones.

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

**Backup:** everything lives in `./data` (the SQLite database). Copy that folder.

**Updates:** `git pull && docker compose up -d --build`. Database migrations run automatically on start.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `SIMMER_ADMIN_USERNAME`, `SIMMER_ADMIN_PASSWORD` | unset | Admin account created on first start |
| `SIMMER_SECRET_KEY` | `change-me` | Secret for encrypting stored API keys (used from milestone 3) |
| `SIMMER_BASE_URL` | `http://localhost:8080` | Public URL, used in link previews |
| `SIMMER_COOKIE_SECURE` | `false` | Send the login cookie over HTTPS only |
| `SIMMER_DATA_DIR` | `/data` in Docker | Where the database is stored |

## Who can do what

| | Visitor | Member | Admin |
| --- | --- | --- | --- |
| Browse and search recipes | ✓ | ✓ | ✓ |
| Add recipes | | ✓ | ✓ |
| Edit or delete recipes | | own | all |
| Manage accounts | | | ✓ |

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
