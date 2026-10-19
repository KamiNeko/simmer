import http.server
import io
import socket
import threading
import zipfile

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import importer
from app.config import get_settings
from app.main import app

from .conftest import SAMPLE_RECIPE, login

# Headers


def test_security_headers(client):
    response = client.get("/api/health")
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "same-origin"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    # The API docs load scripts from a CDN, so they go without a CSP.
    assert "content-security-policy" not in client.get("/api/docs").headers
    assert client.get("/redoc").status_code == 404


# Cross-site requests


def test_cross_site_requests_are_refused(admin):
    for headers in (
        {"Sec-Fetch-Site": "cross-site"},
        {"Sec-Fetch-Site": "same-site"},
        {"Origin": "https://evil.example"},
    ):
        response = admin.post("/api/shopping/clear", headers=headers)
        assert response.status_code == 403, headers
    ok = {"Sec-Fetch-Site": "same-origin"}
    assert admin.post("/api/shopping/clear", headers=ok).status_code == 200
    assert (
        admin.post("/api/shopping/clear", headers={"Origin": "http://testserver"}).status_code
        == 200
    )
    # Reading is always allowed.
    assert admin.get("/api/shopping", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 200


# Body limits


def test_body_limits(admin, client):
    big_json = b'{"text": "' + b"x" * (3 * 1024 * 1024) + b'"}'
    response = admin.post(
        "/api/shopping/extras", content=big_json, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 413
    # Without a size header the body is counted while it streams in.
    response = admin.post(
        "/api/shopping/extras",
        content=iter([big_json]),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413

    admin.cookies.clear()
    files = {"file": ("x.zip", b"0" * 1024, "application/zip")}
    assert client.post("/api/import/file", files=files).json()["detail"] == "Login required"


# Login and sessions


def test_login_is_throttled(admin):
    admin.cookies.clear()
    for _ in range(10):
        assert login_status(admin, "alex", "wrong") == 401
    response = admin.post("/api/auth/login", json={"username": "alex", "password": "secret-pass"})
    assert response.status_code == 429
    assert "Try again in" in response.json()["detail"]
    assert int(response.headers["retry-after"]) > 0
    # Unknown names fail the same way, and other accounts are unaffected.
    assert login_status(admin, "nobody", "wrong") == 401


def login_status(client, username, password):
    return client.post(
        "/api/auth/login", json={"username": username, "password": password}
    ).status_code


def test_password_change_ends_other_sessions(admin, client):
    other = TestClient(app)
    login(other, "alex", "secret-pass")
    assert other.get("/api/auth/me").json()["user"]

    response = admin.post(
        "/api/auth/password", json={"current_password": "secret-pass", "new_password": "new-pass-1"}
    )
    assert response.status_code == 204
    assert admin.get("/api/auth/me").json()["user"]["username"] == "alex"
    assert other.get("/api/auth/me").json()["user"] is None

    # An admin resetting their own password keeps only the current session too.
    login(other, "alex", "new-pass-1")
    me = admin.get("/api/auth/me").json()["user"]
    admin.patch(f"/api/users/{me['id']}", json={"password": "new-pass-2"})
    assert admin.get("/api/auth/me").json()["user"]
    assert other.get("/api/auth/me").json()["user"] is None


def test_cookie_secure_follows_base_url(client, monkeypatch):
    monkeypatch.setenv("SIMMER_BASE_URL", "https://recipes.example")
    get_settings.cache_clear()
    response = client.post(
        "/api/auth/setup",
        json={"username": "alex", "display_name": "Alex", "password": "secret-pass"},
    )
    assert "secure" in response.headers["set-cookie"].lower()


# Uploads


def test_decompression_bomb_is_refused(admin):
    slug = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]
    buffer = io.BytesIO()
    Image.new("1", (13000, 13000)).save(buffer, "PNG")
    files = {"file": ("bomb.png", buffer.getvalue(), "image/png")}
    response = admin.put(f"/api/recipes/{slug}/photo", files=files)
    assert response.status_code == 400
    assert "too many pixels" in response.json()["detail"]


def test_damaged_zip_is_refused(admin):
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as out:
        out.writestr("recipes.json", '{"format": "simmer-recipes"}' * 100)
    data = bytearray(archive.getvalue())
    data[60:80] = b"\0" * 20  # corrupt the compressed bytes
    files = {"file": ("x.zip", bytes(data), "application/zip")}
    assert admin.post("/api/import/file", files=files).status_code == 422


# Fetching


class _Page(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"<html><title>Router admin</title></html>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture
def local_server():
    server = http.server.HTTPServer(("127.0.0.1", 0), _Page)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server.server_address[1]
    server.shutdown()


def test_dns_rebinding_is_caught_at_connect(monkeypatch, local_server):
    """The name resolves to a public address for the check, then to loopback to connect."""
    real = socket.getaddrinfo
    answers = iter(["93.184.215.14"])

    def rebinding(host, *args, **kwargs):
        if host == "rebind.example":
            ip = next(answers, "127.0.0.1")
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, local_server))]
        return real(host, *args, **kwargs)

    monkeypatch.setattr(socket, "getaddrinfo", rebinding)
    with pytest.raises(importer.FetchError, match="local or private"):
        importer.fetch(f"http://rebind.example:{local_server}/")


def test_direct_private_addresses_are_refused():
    for url in ("http://127.0.0.1:1/", "http://[::ffff:127.0.0.1]:1/", "http://10.0.0.1/"):
        with pytest.raises(importer.FetchError, match="local or private"):
            importer.fetch(url)
