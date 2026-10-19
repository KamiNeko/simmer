# Self-hosting Simmer

Simmer is one Docker image: a FastAPI server that also serves the built frontend, with a SQLite database and the photos in one data folder. A small Proxmox LXC with Docker, behind a reverse proxy that handles HTTPS, is the setup this guide assumes. Any Linux host with Docker works the same way.

## Docker Compose on a Proxmox LXC

1. Create a Debian or Ubuntu LXC. 1 CPU core, 1 GB of RAM and a few GB of disk are plenty for a household. Docker inside an LXC needs the **nesting** feature, and for an unprivileged container also **keyctl** (Options > Features in the Proxmox UI).
2. Install Docker and the compose plugin in the container, for example with Docker's own install instructions for your distribution.
3. Get Simmer and configure it:

   ```sh
   git clone https://github.com/KamiNeko/simmer.git && cd simmer
   cp .env.example .env
   mkdir -p data && sudo chown 1000:1000 data   # the container runs as uid 1000
   ```

   In `.env`, set at least `SIMMER_BASE_URL` to the address people will use, such as `https://recipes.example.com`. The [README](../README.md#configuration) lists every setting.

4. Start it:

   ```sh
   docker compose up -d --build
   docker compose logs -f simmer     # Ctrl+C to stop following
   ```

5. Open the site. If you did not set `SIMMER_ADMIN_USERNAME` and `SIMMER_ADMIN_PASSWORD`, the first visit asks you to create the admin account.

The image has a health check that calls `/api/health`. `docker compose ps` shows `healthy` once Simmer is up.

## Bind the port to localhost behind a proxy

The compose file publishes port 8080 on every interface. When your reverse proxy runs on the same machine, publish it on localhost only, so nobody can reach Simmer around the proxy. In `docker-compose.yml`:

```yaml
    ports:
      - "127.0.0.1:8080:8080"
```

Then run `docker compose up -d` again.

`FORWARDED_ALLOW_IPS` tells Uvicorn which addresses may set `X-Forwarded-For` and `X-Forwarded-Proto`. The image trusts private network addresses (`127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7`), which covers a proxy on the same host (it reaches the container through Docker's bridge network) or elsewhere on your LAN. Simmer uses the forwarded address for the login throttle, so it matters that it is right. Don't set it to `*` if port 8080 can be reached from the internet: anyone could then claim to be any address.

If the proxy runs on another machine (for example Nginx Proxy Manager in its own LXC), you can't bind to localhost. Bind to the LAN address instead. The default `FORWARDED_ALLOW_IPS` already trusts LAN addresses; set it in `.env` to just the proxy's IP to be stricter, so other machines on your network can't claim to be any address.

## Reverse proxy

The proxy needs to:

- **Allow large request bodies.** Simmer caps uploads itself: 500 MB for importing a recipe export zip, 121 MB for the photos of one AI import (6 photos of up to 20 MB), 21 MB for a recipe photo, and 2 MB for everything else. Set the proxy limit to at least 500 MB, or recipe imports fail with a 413 from the proxy.
- **Wait for AI imports.** An AI import can take a few minutes: fetching a page may take up to 60 seconds, each call to the AI provider may take up to 180 seconds, and Simmer retries once when the answer is not a valid recipe. Give the proxy a read timeout of 10 minutes.
- **Pass the original host and the `X-Forwarded-*` headers**, so Simmer sees the real client address and protocol.

### Caddy

Caddy gets certificates on its own, sets `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host`, keeps the `Host` header and has no response timeout by default. Only the body size needs a line, and only if you set a global limit elsewhere:

```caddy
recipes.example.com {
	request_body {
		max_size 512MB
	}
	reverse_proxy 127.0.0.1:8080
}
```

### nginx

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name recipes.example.com;

    ssl_certificate     /etc/letsencrypt/live/recipes.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/recipes.example.com/privkey.pem;

    # Recipe export zips can be up to 500 MB.
    client_max_body_size 512m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # AI imports can take several minutes.
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}

server {
    listen 80;
    server_name recipes.example.com;
    return 301 https://$host$request_uri;
}
```

nginx's defaults are a 1 MB body limit and a 60 second read timeout, so both settings are needed.

**Nginx Proxy Manager** sets the forwarded headers itself. Add the body size and timeouts in the proxy host's **Advanced** tab:

```nginx
client_max_body_size 512m;
proxy_read_timeout 600s;
proxy_send_timeout 600s;
```

## HTTPS and secure cookies

The login cookie is `HttpOnly` and `SameSite=Lax`. It is also marked `Secure` (sent over HTTPS only) when:

- `SIMMER_COOKIE_SECURE=true`, or
- `SIMMER_COOKIE_SECURE` is unset and `SIMMER_BASE_URL` starts with `https://`.

So for a normal setup, set `SIMMER_BASE_URL=https://recipes.example.com` and leave `SIMMER_COOKIE_SECURE` unset. To try Simmer over plain http first (for example `http://<server-ip>:8080`), set `SIMMER_COOKIE_SECURE=false`, and remove it again once HTTPS works.

`SIMMER_BASE_URL` is also used for the link previews (Open Graph tags) of shared recipe links, so it should be the public address.

## Updating

Back up first (see [Backup and restore](../README.md#backup-and-restore)). Then, from the `simmer` folder:

```sh
git pull
docker compose up -d --build
```

On start, Simmer runs any new database migrations before it serves requests (`upgrade_database` in `backend/app/main.py`), so there is nothing else to do. Check `docker compose logs simmer` if the container doesn't become healthy.

CI publishes `ghcr.io/kamineko/simmer:latest` from the main branch, which is the image name in the compose file, and a version tag such as `ghcr.io/kamineko/simmer:0.1.0` for each release. Pin a version in `docker-compose.yml` to update only when you choose. If you can pull it, `docker compose pull && docker compose up -d` updates without building.

**About Simmer** in the account menu shows the version you run and the commit its image was built from. Images built by CI fill in the commit; to fill it in when you build yourself, run `docker compose build --build-arg SIMMER_COMMIT=$(git rev-parse HEAD)` before `docker compose up -d`.

Migrations only go forward on their own. To go back to an older version, restore the backup you took before updating.

## Troubleshooting

### "Requests from other sites are not allowed" (403) on every save or login

Simmer refuses requests that change data unless they come from its own pages. Modern browsers say so with the `Sec-Fetch-Site` header, which proxies don't change. Older browsers only send `Origin`, and Simmer then compares it with `X-Forwarded-Host` or, if that is missing, `Host`.

So when the proxy rewrites `Host` (nginx sends `127.0.0.1:8080` unless told otherwise), older browsers get a 403. Pass the original host: `proxy_set_header Host $host;` and `proxy_set_header X-Forwarded-Host $host;` in nginx. Caddy does this by default.

A 403 is also expected when a page on another site, including a sibling subdomain, tries to post to Simmer.

### 413 "Request Entity Too Large" or "The upload is too large"

An HTML 413 page comes from the proxy: raise its body limit as shown above. A JSON reply such as "The upload is too large" comes from Simmer and means the file is over its own cap (500 MB for a recipe zip, 20 MB per photo, 6 photos per import).

### Login says "Too many failed attempts"

After 10 failed logins for one username from one address, or 30 from one address, within 15 minutes, Simmer asks people to wait. The counts are kept in memory, so `docker compose restart simmer` clears them.

If everyone gets locked out at once, Simmer probably sees the proxy's address for every visitor. Check that the proxy sends `X-Forwarded-For` and that `FORWARDED_ALLOW_IPS` includes the proxy (see above).

### Login seems to work, then you are signed out right away

The cookie is marked secure but you are using plain http. Use HTTPS, or set `SIMMER_COOKIE_SECURE=false` while testing.

### Lost admin password

Another admin can set a new password under **Users**. If there is no other admin, note that `SIMMER_ADMIN_USERNAME` and `SIMMER_ADMIN_PASSWORD` won't help: they only create an account while there are no users at all.

Instead, reset the password inside the container with Simmer's own password hashing (Argon2). Replace `admin` with the username:

```sh
docker compose exec simmer python -c "
import getpass, sys
from sqlalchemy import delete, func, select
from app.db import get_db
from app.models import User, UserSession
from app.security import hash_password
db = next(get_db())
user = db.scalar(select(User).where(func.lower(User.username) == sys.argv[1].lower()))
if user is None: sys.exit('No such user')
password = getpass.getpass('New password: ')
if len(password) < 8: sys.exit('Use at least 8 characters')
user.password_hash = hash_password(password)
db.execute(delete(UserSession).where(UserSession.user_id == user.id))
db.commit()
print('Password changed for', user.username)
" admin
```

It asks for the new password without showing it, and signs the user out on every device. Simmer can keep running while you do this.

### Permission denied on /data

The container runs as uid 1000. Run `sudo chown -R 1000:1000 data` in the `simmer` folder.

### "The stored API key can't be decrypted"

The secret that encrypts the AI keys changed: `SIMMER_SECRET_KEY` was changed or removed, or `data/secret.key` was lost. Put the old value back, or enter the API keys again under **AI providers**.
