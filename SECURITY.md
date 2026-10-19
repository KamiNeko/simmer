# Security

## Supported versions

Simmer is a small project with one release line. Security fixes go into the latest `main` branch and the `ghcr.io/kamineko/simmer:latest` image built from it. Please update to the latest `main` before reporting, and keep your install up to date.

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

1. Open the repository on GitHub and go to **Security** > **Advisories**.
2. Press **Report a vulnerability** and describe the problem, how to reproduce it and what an attacker could do with it.

You will get an answer as soon as the maintainer can look at it. Once a fix is out, the advisory is published with credit to you, unless you prefer otherwise.

## How Simmer protects itself

This is a summary of what the code does today. The details live in `backend/app/hardening.py`, `backend/app/routers/auth.py`, `backend/app/security.py`, `backend/app/importer.py` and `backend/app/photos.py`.

### Accounts and sessions

- Passwords are hashed with Argon2 (`argon2-cffi`) and must be at least 8 characters.
- There is no public sign-up. The first admin is created on the setup screen, or from environment variables, and only while no users exist. Admins create every other account.
- A login sets a random session token in an `HttpOnly`, `SameSite=Lax` cookie, marked `Secure` whenever the base URL is HTTPS. The database stores only a SHA-256 hash of the token. Sessions expire after `SIMMER_SESSION_DAYS` (30 by default).
- Failed logins are throttled: after 10 failures for one username from one address, or 30 from one address, within 15 minutes, further attempts get a 429 with `Retry-After` until the window passes.
- Unknown usernames still go through a password check, so response times don't reveal which accounts exist.
- Changing your password signs out every other device. An admin resetting a password under **Users** signs that user out everywhere, except the admin's own current session.
- The last admin can't be demoted, and admins can't delete themselves.

### HTTP

- Every response carries a strict Content-Security-Policy (`default-src 'self'`, no framing, no plugins), plus `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`. The interactive API docs at `/api/docs` are the one page without the CSP, because they load scripts from a CDN.
- Requests that change data (POST, PUT, PATCH, DELETE) must come from Simmer's own pages. Simmer checks `Sec-Fetch-Site`, or `Origin` against the host in older browsers, and answers 403 otherwise.
- Request bodies are capped at 2 MB before the app reads them. Only signed-in users may send more, and only to the upload endpoints: 500 MB for a recipe export zip, 121 MB for photo imports and 21 MB for a recipe photo. The session is checked before the body is read, and large uploads must declare their size.
- Photos are served only by names that match the pattern Simmer generates, so the media route can't read other files.

### Fetching links

Recipe imports and photo downloads fetch URLs from the server, so they are guarded against server-side request forgery:

- Only `http` and `https` links are allowed.
- The host name must resolve to public addresses only. Private, loopback, link-local and other non-global addresses are refused.
- After connecting, Simmer checks the address it actually connected to, so a DNS answer that changes between the check and the connection (DNS rebinding) is caught. Every redirect (at most 5) is checked the same way.
- Downloads stop at 5 MB for a page (20 MB for a photo), after 20 seconds without data, or after 60 seconds in total.
- When the server uses an HTTP proxy for outbound traffic, the proxy decides what is reachable.

### Images

- Uploaded photos are limited to 20 MB, and images over 40 megapixels are refused before any pixels are decoded, which stops decompression bombs.
- Every photo is decoded with Pillow and saved again as WebP (stored photos) or JPEG (photos sent to an AI provider). Nothing from the original file is served as is.

### Imports and AI

- A recipe zip is read with limits: `recipes.json` may be at most 50 MB, and a damaged photo is skipped without stopping the import.
- Text sent to an AI provider is wrapped and marked as recipe content, and the answer must match a strict JSON schema before Simmer uses it. The result is only ever a draft that a person reviews before saving.
- AI provider keys are encrypted at rest and never sent to the browser. See [docs/ai-import.md](docs/ai-import.md#where-the-api-keys-are-stored).

### What you should do as an operator

- Run Simmer behind HTTPS and keep `SIMMER_BASE_URL` on `https://`.
- Bind port 8080 to localhost, or set `FORWARDED_ALLOW_IPS` to your proxy's address. See [docs/self-hosting.md](docs/self-hosting.md).
- Keep backups private. A full backup contains `secret.key`, which decrypts the AI keys stored in the same backup.
