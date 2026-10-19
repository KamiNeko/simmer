"""HTTP-level protections: security headers, a same-origin check for state-changing requests,
and request body limits that are enforced before the app reads a body."""

import json
import re
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import Headers, MutableHeaders

from .db import get_engine
from .deps import SESSION_COOKIE, session_is_valid

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]

MB = 1024 * 1024
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
DEFAULT_MAX_BODY = 2 * MB
# Uploads may be larger, but only for a signed-in user, checked before the body is read.
UPLOAD_LIMITS: list[tuple[re.Pattern[str], int]] = [
    (re.compile(r"/api/import/file"), 500 * MB),
    (re.compile(r"/api/import/photos"), 6 * 20 * MB + MB),
    (re.compile(r"/api/recipes/[^/]+/photo"), 20 * MB + MB),
]

CSP_DIRECTIVES = (
    "default-src 'self'",
    # Recipe photos from other sites appear in the import review before they are saved.
    "img-src 'self' https: data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
)
CSP = "; ".join(CSP_DIRECTIVES)
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
}
# The interactive API docs load their scripts from a CDN, so they get no CSP.
NO_CSP_PATHS = ("/api/docs",)


def is_same_origin(headers: Headers) -> bool:
    """True unless a browser says the request came from another site.

    Browsers send Sec-Fetch-Site; older ones only Origin. Requests with neither come from
    scripts or curl, which can't carry a victim's cookies by accident.
    """
    site = headers.get("sec-fetch-site")
    if site:
        return site in ("same-origin", "none")
    origin = headers.get("origin")
    if not origin:
        return True
    host = headers.get("x-forwarded-host") or headers.get("host")
    return urlsplit(origin).netloc == host


def body_limit(path: str) -> int:
    """The largest request body allowed for this path."""
    for pattern, limit in UPLOAD_LIMITS:
        if pattern.fullmatch(path):
            return limit
    return DEFAULT_MAX_BODY


def _has_valid_session(token: str | None) -> bool:
    if not token:
        return False
    with Session(get_engine()) as db:
        return session_is_valid(db, token)


async def _reply(send: Send, status: int, detail: str) -> None:
    body = json.dumps({"detail": detail}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class HardeningMiddleware:
    def __init__(self, app: Callable[[Scope, Receive, Send], Awaitable[None]]) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path: str = scope["path"]
        headers = Headers(scope=scope)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    response_headers.setdefault(name, value)
                if not path.startswith(NO_CSP_PATHS):
                    response_headers.setdefault("Content-Security-Policy", CSP)
            await send(message)

        if scope["method"] in UNSAFE_METHODS:
            if not is_same_origin(headers):
                await _reply(send_with_headers, 403, "Requests from other sites are not allowed")
                return
            limit = body_limit(path) if scope["method"] in ("POST", "PUT") else DEFAULT_MAX_BODY
            length = headers.get("content-length", "")
            if length.isdigit() and int(length) > limit:
                await _reply(send_with_headers, 413, "The upload is too large")
                return
            if limit > DEFAULT_MAX_BODY:
                cookie = _cookie(headers, SESSION_COOKIE)
                if not await run_in_threadpool(_has_valid_session, cookie):
                    await _reply(send_with_headers, 401, "Login required")
                    return
            if not length.isdigit():
                # Browsers always send a length; only small bodies may stream without one.
                if limit > DEFAULT_MAX_BODY:
                    await _reply(send_with_headers, 411, "The upload needs a Content-Length")
                    return
                body = await _read_limited(receive, limit)
                if body is None:
                    await _reply(send_with_headers, 413, "The request is too large")
                    return
                receive = _replay(body)

        await self.app(scope, receive, send_with_headers)


def _cookie(headers: Headers, name: str) -> str | None:
    for part in headers.get("cookie", "").split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value
    return None


async def _read_limited(receive: Receive, limit: int) -> bytes | None:
    """Read a streamed body, or None once it passes the limit."""
    chunks: list[bytes] = []
    size = 0
    while True:
        message = await receive()
        if message["type"] != "http.request":
            break
        chunk = message.get("body", b"")
        size += len(chunk)
        if size > limit:
            return None
        chunks.append(chunk)
        if not message.get("more_body"):
            break
    return b"".join(chunks)


def _replay(body: bytes) -> Receive:
    sent = False

    async def receive() -> Message:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return receive
