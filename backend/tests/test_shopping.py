from sqlalchemy import event

from app.db import get_engine

from .conftest import SAMPLE_RECIPE, login


def _recipe(client, title="Gochujang Chicken Meal Prep"):
    return client.post("/api/recipes", json={**SAMPLE_RECIPE, "title": title}).json()["slug"]


def test_shopping_list_flow(admin):
    assert admin.get("/api/shopping").json() == {"recipes": [], "extras": [], "checked": []}
    slug = _recipe(admin)
    other = _recipe(admin, "Kimchi fried rice")

    data = admin.put(f"/api/shopping/recipes/{slug}", json={"servings": 2}).json()
    assert data["recipes"][0]["servings"] == 2
    assert data["recipes"][0]["recipe"]["groups"][1]["name"] == "Marinade"

    # Adding again updates the servings instead of duplicating.
    admin.put(f"/api/shopping/recipes/{slug}", json={"servings": 6})
    data = admin.put(f"/api/shopping/recipes/{other}", json={"servings": 4}).json()
    assert [(r["recipe"]["slug"], r["servings"]) for r in data["recipes"]] == [
        (slug, 6),
        (other, 4),
    ]

    data = admin.post("/api/shopping/extras", json={"text": " Kitchen paper "}).json()
    extra = data["extras"][0]
    assert extra == {"id": extra["id"], "text": "Kitchen paper", "checked": False}
    data = admin.patch(f"/api/shopping/extras/{extra['id']}", json={"checked": True}).json()
    assert data["extras"][0]["checked"] is True

    admin.put("/api/shopping/checked", json={"key": "rice|g", "checked": True})
    data = admin.put("/api/shopping/checked", json={"key": "rice|g", "checked": True}).json()
    assert data["checked"] == ["rice|g"]

    data = admin.post("/api/shopping/clear?checked_only=true").json()
    assert data["extras"] == [] and len(data["recipes"]) == 2 and data["checked"] == ["rice|g"]

    data = admin.delete(f"/api/shopping/recipes/{other}").json()
    assert [r["recipe"]["slug"] for r in data["recipes"]] == [slug]
    data = admin.put("/api/shopping/checked", json={"key": "rice|g", "checked": False}).json()
    assert data["checked"] == []

    admin.post("/api/shopping/extras", json={"text": "Eggs"})
    data = admin.post("/api/shopping/clear").json()
    assert data == {"recipes": [], "extras": [], "checked": []}


def test_shopping_list_is_private(admin):
    slug = _recipe(admin)
    admin.put(f"/api/shopping/recipes/{slug}", json={"servings": 2})
    extra_id = admin.post("/api/shopping/extras", json={"text": "Eggs"}).json()["extras"][0]["id"]
    admin.post(
        "/api/users",
        json={"username": "sam", "display_name": "Sam", "password": "member-pass"},
    )
    login(admin, "sam", "member-pass")
    assert admin.get("/api/shopping").json()["recipes"] == []
    assert admin.delete(f"/api/shopping/extras/{extra_id}").status_code == 404
    assert admin.put(f"/api/shopping/recipes/{slug}", json={"servings": 0}).status_code == 422
    admin.cookies.clear()
    assert admin.get("/api/shopping").status_code == 401


def test_deleting_a_recipe_removes_it_from_lists(admin):
    slug = _recipe(admin)
    admin.put(f"/api/shopping/recipes/{slug}", json={"servings": 2})
    admin.delete(f"/api/recipes/{slug}")
    assert admin.get("/api/shopping").json()["recipes"] == []


def test_shopping_list_queries_are_batched(admin):
    """The number of queries doesn't grow with the number of recipes on the list."""

    def statements_for_list() -> list[str]:
        statements: list[str] = []

        def count(conn, cursor, statement, *args):
            statements.append(statement)

        engine = get_engine()
        event.listen(engine, "before_cursor_execute", count)
        try:
            admin.get("/api/shopping").raise_for_status()
        finally:
            event.remove(engine, "before_cursor_execute", count)
        return statements

    admin.post("/api/shopping/extras", json={"text": "Eggs"})
    admin.put(f"/api/shopping/recipes/{_recipe(admin, 'Recipe 0')}", json={"servings": 2})
    one = statements_for_list()
    for n in range(1, 8):
        admin.put(f"/api/shopping/recipes/{_recipe(admin, f'Recipe {n}')}", json={"servings": 2})
    eight = statements_for_list()
    assert len(admin.get("/api/shopping").json()["recipes"]) == 8
    assert len(eight) == len(one), "\n".join(eight)
