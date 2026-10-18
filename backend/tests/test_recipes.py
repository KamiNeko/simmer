import copy

from .conftest import SAMPLE_RECIPE, login


def test_create_and_view_publicly(admin):
    created = admin.post("/api/recipes", json=SAMPLE_RECIPE)
    assert created.status_code == 201, created.text
    recipe = created.json()
    assert recipe["slug"] == "gochujang-chicken-meal-prep"
    assert [g["name"] for g in recipe["groups"]] == ["", "Marinade", "Sauce"]
    assert recipe["groups"][2]["ingredients"][1]["quantity"] is None
    assert recipe["tags"] == ["Korean", "Meal prep"]
    assert recipe["can_edit"] is True

    admin.cookies.clear()
    public = admin.get(f"/api/recipes/{recipe['slug']}")
    assert public.status_code == 200
    assert public.json()["can_edit"] is False
    assert public.json()["steps"][1]["section"] == "Make the sauce"
    listing = admin.get("/api/recipes").json()
    assert listing[0]["ingredient_preview"].startswith("chicken thigh, rice")


def test_visitors_cannot_write(client):
    assert client.post("/api/recipes", json=SAMPLE_RECIPE).status_code == 401


def test_update_replaces_groups_and_renames_slug(admin):
    slug = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]
    changed = copy.deepcopy(SAMPLE_RECIPE)
    changed["title"] = "Gochujang Chicken Bowls"
    changed["groups"] = [changed["groups"][2], changed["groups"][0]]
    changed["tags"] = ["Korean"]
    updated = admin.put(f"/api/recipes/{slug}", json=changed)
    assert updated.status_code == 200
    body = updated.json()
    assert body["slug"] == "gochujang-chicken-bowls"
    assert [g["name"] for g in body["groups"]] == ["Sauce", ""]
    assert admin.get("/api/tags").json() == [{"name": "Korean", "count": 1}]


def test_unique_slugs(admin):
    first = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]
    second = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]
    assert second == f"{first}-2"


def test_members_edit_only_their_own(admin):
    slug = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]
    admin.post(
        "/api/users", json={"username": "sam", "display_name": "Sam", "password": "sam-password"}
    )
    login(admin, "sam", "sam-password")
    assert admin.get(f"/api/recipes/{slug}").json()["can_edit"] is False
    assert admin.put(f"/api/recipes/{slug}", json=SAMPLE_RECIPE).status_code == 403
    assert admin.delete(f"/api/recipes/{slug}").status_code == 403
    own = admin.post("/api/recipes", json={**SAMPLE_RECIPE, "title": "Sam's soup"}).json()
    assert admin.delete(f"/api/recipes/{own['slug']}").status_code == 204

    login(admin, "alex", "secret-pass")
    assert admin.delete(f"/api/recipes/{slug}").status_code == 204
    assert admin.get(f"/api/recipes/{slug}").status_code == 404
    assert admin.get("/api/tags").json() == []


def test_search_and_filter(admin):
    admin.post("/api/recipes", json=SAMPLE_RECIPE)
    admin.post(
        "/api/recipes",
        json={
            **SAMPLE_RECIPE,
            "title": "Pancakes",
            "tags": ["Breakfast"],
            "description": "",
            "groups": [{"name": "", "ingredients": [{"name": "flour"}]}],
        },
    )
    assert [r["title"] for r in admin.get("/api/recipes?q=gochujang").json()] == [
        "Gochujang Chicken Meal Prep"
    ]
    assert [r["title"] for r in admin.get("/api/recipes?q=flour").json()] == ["Pancakes"]
    assert [r["title"] for r in admin.get("/api/recipes?tag=breakfast").json()] == ["Pancakes"]
    assert [r["title"] for r in admin.get("/api/recipes?sort=title").json()] == [
        "Gochujang Chicken Meal Prep",
        "Pancakes",
    ]
