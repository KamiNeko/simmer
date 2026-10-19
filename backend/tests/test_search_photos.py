import io

from PIL import Image

from .conftest import SAMPLE_RECIPE


def _titles(client, query):
    return [r["title"] for r in client.get("/api/recipes", params={"q": query}).json()]


def test_full_text_search(admin):
    admin.post("/api/recipes", json=SAMPLE_RECIPE)
    admin.post(
        "/api/recipes",
        json={
            "title": "Crème brûlée",
            "tags": ["Dessert"],
            "groups": [{"name": "", "ingredients": [{"name": "cream"}, {"name": "sugar"}]}],
        },
    )
    assert _titles(admin, "gochu") == ["Gochujang Chicken Meal Prep"]
    assert _titles(admin, "creme") == ["Crème brûlée"]
    assert _titles(admin, "dessert") == ["Crème brûlée"]
    assert _titles(admin, "chicken boneless") == ["Gochujang Chicken Meal Prep"]
    assert _titles(admin, "chicken sugar") == []
    assert _titles(admin, '"') == ["Crème brûlée", "Gochujang Chicken Meal Prep"]


def test_search_index_follows_edits_and_deletes(admin):
    slug = admin.post("/api/recipes", json={**SAMPLE_RECIPE, "title": "Zucchini bake"}).json()[
        "slug"
    ]
    slug = admin.put(f"/api/recipes/{slug}", json={**SAMPLE_RECIPE, "title": "Spicy bowls"}).json()[
        "slug"
    ]
    assert _titles(admin, "spicy") == ["Spicy bowls"]
    assert _titles(admin, "zucchini") == []
    admin.delete(f"/api/recipes/{slug}")
    assert _titles(admin, "spicy") == []


def _jpeg(width=2400, height=1600):
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (200, 80, 40)).save(buffer, "JPEG")
    return buffer.getvalue()


def test_photo_upload_resizes_and_serves(admin):
    slug = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]
    response = admin.put(
        f"/api/recipes/{slug}/photo", files={"file": ("dish.jpg", _jpeg(), "image/jpeg")}
    )
    assert response.status_code == 200, response.text
    recipe = response.json()
    full = admin.get(recipe["photo_url"])
    assert full.status_code == 200
    assert Image.open(io.BytesIO(full.content)).size == (1600, 1067)
    thumb = Image.open(io.BytesIO(admin.get(recipe["thumb_url"]).content))
    assert max(thumb.size) == 480
    assert admin.get("/api/recipes").json()[0]["thumb_url"] == recipe["thumb_url"]

    replaced = admin.put(
        f"/api/recipes/{slug}/photo", files={"file": ("dish.jpg", _jpeg(800, 600), "image/jpeg")}
    ).json()
    assert admin.get(recipe["photo_url"]).status_code == 404
    removed = admin.delete(f"/api/recipes/{slug}/photo").json()
    assert removed["photo_url"] is None
    assert admin.get(replaced["photo_url"]).status_code == 404


def test_photo_rejects_non_images_and_visitors(admin):
    slug = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]
    bad = admin.put(f"/api/recipes/{slug}/photo", files={"file": ("x.jpg", b"nope", "image/jpeg")})
    assert bad.status_code == 400
    admin.cookies.clear()
    denied = admin.put(
        f"/api/recipes/{slug}/photo", files={"file": ("x.jpg", _jpeg(), "image/jpeg")}
    )
    assert denied.status_code == 401
    assert admin.get("/media/photos/../simmer.db").status_code == 404
