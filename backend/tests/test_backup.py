import io
import json
import sqlite3
import zipfile

from PIL import Image

from .conftest import SAMPLE_RECIPE, login


def _jpeg() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (40, 30), "orange").save(buffer, "JPEG")
    return buffer.getvalue()


def _with_photo(client, title):
    slug = client.post("/api/recipes", json={**SAMPLE_RECIPE, "title": title}).json()["slug"]
    files = {"file": ("a.jpg", _jpeg(), "image/jpeg")}
    assert client.put(f"/api/recipes/{slug}/photo", files=files).status_code == 200
    return slug


def test_export_and_import_round_trip(admin):
    slug = _with_photo(admin, "Gochujang Chicken Meal Prep")
    admin.post("/api/recipes", json={**SAMPLE_RECIPE, "title": "Kimchi fried rice"})

    response = admin.get("/api/export")
    assert response.status_code == 200
    assert "simmer-recipes-" in response.headers["content-disposition"]
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    document = json.loads(archive.read("recipes.json"))
    assert document["format"] == "simmer-recipes" and document["version"] == 1
    first = document["recipes"][0]
    assert first["title"] == "Gochujang Chicken Meal Prep"
    assert first["groups"][1]["name"] == "Marinade"
    assert first["photo"] == f"photos/{slug}.webp"
    assert first["photo"] in archive.namelist()

    # Importing into the same Simmer skips titles that exist.
    files = {"file": ("export.zip", response.content, "application/zip")}
    assert admin.post("/api/import/file", files=files).json() == {
        "imported": [],
        "skipped": ["Gochujang Chicken Meal Prep", "Kimchi fried rice"],
        "failed": [],
    }

    # A renamed copy comes in as a new recipe with its photo and groups.
    first["title"] = "Gochujang Chicken (copy)"
    document["recipes"].append({"title": ""})
    patched = io.BytesIO()
    with zipfile.ZipFile(patched, "w") as out:
        out.writestr("recipes.json", json.dumps(document))
        out.writestr(first["photo"], archive.read(first["photo"]))
    files = {"file": ("export.zip", patched.getvalue(), "application/zip")}
    result = admin.post("/api/import/file", files=files).json()
    assert result["imported"] == [
        {"slug": "gochujang-chicken-copy", "title": "Gochujang Chicken (copy)"}
    ]
    assert result["failed"] == ["Recipe 3: title string should have at least 1 character"]
    copy = admin.get("/api/recipes/gochujang-chicken-copy").json()
    assert copy["photo_url"] and copy["groups"][1]["name"] == "Marinade"
    assert copy["author"]["display_name"] == "Alex"
    assert admin.get("/api/recipes?q=gochujang").json()[0]["slug"]


def test_import_accepts_bare_json_and_rejects_other_files(admin):
    document = {"format": "simmer-recipes", "version": 1, "recipes": [SAMPLE_RECIPE]}
    files = {"file": ("recipes.json", json.dumps(document), "application/json")}
    assert len(admin.post("/api/import/file", files=files).json()["imported"]) == 1

    for body in (b"hello", json.dumps({"format": "mealie"}).encode(), b"PK\x03\x04broken"):
        files = {"file": ("x", body, "application/octet-stream")}
        assert admin.post("/api/import/file", files=files).status_code == 422
    newer = {"format": "simmer-recipes", "version": 99, "recipes": []}
    files = {"file": ("x.json", json.dumps(newer), "application/json")}
    assert "newer Simmer" in admin.post("/api/import/file", files=files).json()["detail"]
    admin.cookies.clear()
    assert admin.get("/api/export").status_code == 401


def test_full_backup_is_admin_only(admin, tmp_path):
    _with_photo(admin, "Gochujang Chicken Meal Prep")
    response = admin.get("/api/admin/backup")
    assert response.status_code == 200
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = archive.namelist()
    assert "simmer.db" in names and sum(n.startswith("photos/") for n in names) == 2
    restored = tmp_path / "restored.db"
    restored.write_bytes(archive.read("simmer.db"))
    with sqlite3.connect(restored) as conn:
        assert conn.execute("select title from recipes").fetchall() == [
            ("Gochujang Chicken Meal Prep",)
        ]

    admin.post(
        "/api/users",
        json={"username": "sam", "display_name": "Sam", "password": "member-pass"},
    )
    login(admin, "sam", "member-pass")
    assert admin.get("/api/admin/backup").status_code == 403
    assert admin.get("/api/export").status_code == 200
