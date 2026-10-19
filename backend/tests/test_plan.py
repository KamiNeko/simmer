from .conftest import SAMPLE_RECIPE, login

WEEK = "start=2026-10-19&end=2026-10-25"


def _recipe(client, title="Gochujang Chicken Meal Prep"):
    return client.post("/api/recipes", json={**SAMPLE_RECIPE, "title": title}).json()["slug"]


def test_plan_flow(admin):
    slug = _recipe(admin)
    other = _recipe(admin, "Kimchi fried rice")
    assert admin.get(f"/api/plan?{WEEK}").json() == []

    first = admin.post("/api/plan", json={"day": "2026-10-20", "recipe": slug}).json()
    assert first["recipe"]["slug"] == slug and first["servings"] is None
    assert first["added_by"]["display_name"] == "Alex"
    admin.post("/api/plan", json={"day": "2026-10-19", "recipe": other, "servings": 3})
    admin.post("/api/plan", json={"day": "2026-10-19", "note": " Leftovers "})
    admin.post("/api/plan", json={"day": "2026-10-26", "recipe": other})  # next week

    entries = admin.get(f"/api/plan?{WEEK}").json()
    assert [(e["day"], e["recipe"] and e["recipe"]["slug"], e["note"]) for e in entries] == [
        ("2026-10-19", other, ""),
        ("2026-10-19", None, "Leftovers"),
        ("2026-10-20", slug, ""),
    ]

    moved = admin.patch(f"/api/plan/{first['id']}", json={"day": "2026-10-22", "servings": 2})
    assert moved.json()["day"] == "2026-10-22" and moved.json()["servings"] == 2
    note_id = entries[1]["id"]
    assert admin.patch(f"/api/plan/{note_id}", json={"note": " "}).status_code == 422
    assert admin.delete(f"/api/plan/{note_id}").status_code == 204
    assert admin.delete(f"/api/plan/{note_id}").status_code == 404
    assert len(admin.get(f"/api/plan?{WEEK}").json()) == 2


def test_plan_validation(admin):
    assert admin.post("/api/plan", json={"day": "2026-10-20"}).status_code == 422
    assert admin.post("/api/plan", json={"day": "2026-10-20", "recipe": "nope"}).status_code == 404
    assert admin.get("/api/plan?start=2026-10-20&end=2026-10-19").status_code == 422
    assert admin.get("/api/plan?start=2026-01-01&end=2026-12-31").status_code == 422
    admin.cookies.clear()
    assert admin.get(f"/api/plan?{WEEK}").status_code == 401


def test_plan_is_shared_and_fills_the_shopping_list(admin):
    slug = _recipe(admin)
    other = _recipe(admin, "Kimchi fried rice")
    admin.post("/api/plan", json={"day": "2026-10-20", "recipe": slug, "servings": 2})
    admin.post("/api/plan", json={"day": "2026-10-23", "recipe": slug, "servings": 3})
    admin.post("/api/plan", json={"day": "2026-10-21", "recipe": other})
    admin.post("/api/plan", json={"day": "2026-10-22", "note": "Eating out"})
    admin.post(
        "/api/users",
        json={"username": "sam", "display_name": "Sam", "password": "member-pass"},
    )
    login(admin, "sam", "member-pass")
    assert len(admin.get(f"/api/plan?{WEEK}").json()) == 4

    admin.put(f"/api/shopping/recipes/{other}", json={"servings": 10})
    body = {"start": "2026-10-19", "end": "2026-10-25"}
    data = admin.post("/api/plan/to-shopping", json=body).json()
    servings = {r["recipe"]["slug"]: r["servings"] for r in data["recipes"]}
    # Both days of the first recipe add up; the larger amount already listed stays.
    assert servings == {slug: 5, other: 10}
    again = admin.post("/api/plan/to-shopping", json=body).json()
    assert {r["recipe"]["slug"]: r["servings"] for r in again["recipes"]} == servings
