from .conftest import SAMPLE_RECIPE, login


def _setup(admin):
    slug = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]
    admin.post(
        "/api/users", json={"username": "sam", "display_name": "Sam", "password": "sam-password"}
    )
    return slug


def test_rating_is_private_but_average_is_public(admin):
    slug = _setup(admin)
    assert admin.put(f"/api/recipes/{slug}/rating", json={"stars": 5}).json()["rating"] == 5
    assert admin.put(f"/api/recipes/{slug}/rating", json={"stars": 6}).status_code == 422
    login(admin, "sam", "sam-password")
    admin.put(f"/api/recipes/{slug}/rating", json={"stars": 2})
    recipe = admin.get(f"/api/recipes/{slug}").json()
    assert recipe["avg_rating"] == 3.5
    assert recipe["rating_count"] == 2
    assert recipe["my_rating"] == 2

    admin.cookies.clear()
    public = admin.get(f"/api/recipes/{slug}").json()
    assert public["avg_rating"] == 3.5
    assert public["my_rating"] is None
    assert admin.get(f"/api/recipes/{slug}/journal").status_code == 401
    assert admin.put(f"/api/recipes/{slug}/rating", json={"stars": 4}).status_code == 401


def test_remove_rating(admin):
    slug = _setup(admin)
    admin.put(f"/api/recipes/{slug}/rating", json={"stars": 4})
    assert admin.delete(f"/api/recipes/{slug}/rating").json()["rating"] is None
    assert admin.get(f"/api/recipes/{slug}").json()["avg_rating"] is None


def test_cooked_with_note_and_undo(admin):
    slug = _setup(admin)
    journal = admin.post(f"/api/recipes/{slug}/cooked", json={"note": "Needs more salt"}).json()
    assert len(journal["cooks"]) == 1
    note = journal["comments"][0]
    assert note["text"] == "Needs more salt"
    assert note["cook_log_id"] == journal["cooks"][0]["id"]
    assert note["cooked_at"] is not None

    journal = admin.post(f"/api/recipes/{slug}/cooked", json={}).json()
    assert len(journal["cooks"]) == 2
    assert len(journal["comments"]) == 1
    recipe = admin.get(f"/api/recipes/{slug}").json()
    assert recipe["cooked_count"] == 2
    assert recipe["my_cooked_count"] == 2
    assert recipe["my_last_cooked_at"] is not None

    latest = journal["cooks"][0]["id"]
    assert admin.delete(f"/api/cooked/{latest}").status_code == 204
    assert admin.get(f"/api/recipes/{slug}").json()["cooked_count"] == 1

    login(admin, "sam", "sam-password")
    other = journal["cooks"][1]["id"]
    assert admin.delete(f"/api/cooked/{other}").status_code == 404


def test_comments_are_private_and_can_be_marked_done(admin):
    slug = _setup(admin)
    created = admin.post(f"/api/recipes/{slug}/comments", json={"text": "Try with tofu"})
    assert created.status_code == 201
    comment_id = created.json()["id"]
    done = admin.patch(f"/api/comments/{comment_id}", json={"done": True}).json()
    assert done["done"] is True
    assert done["cooked_at"] is None

    login(admin, "sam", "sam-password")
    assert admin.get(f"/api/recipes/{slug}/journal").json()["comments"] == []
    assert admin.patch(f"/api/comments/{comment_id}", json={"done": False}).status_code == 404
    assert admin.delete(f"/api/comments/{comment_id}").status_code == 404

    login(admin, "alex", "secret-pass")
    assert admin.delete(f"/api/comments/{comment_id}").status_code == 204
    assert admin.get(f"/api/recipes/{slug}/journal").json()["comments"] == []


def test_sort_by_rating_and_cooked(admin):
    first = admin.post("/api/recipes", json={**SAMPLE_RECIPE, "title": "Alpha"}).json()["slug"]
    second = admin.post("/api/recipes", json={**SAMPLE_RECIPE, "title": "Beta"}).json()["slug"]
    admin.put(f"/api/recipes/{second}/rating", json={"stars": 5})
    admin.put(f"/api/recipes/{first}/rating", json={"stars": 3})
    admin.post(f"/api/recipes/{first}/cooked", json={})

    def titles(sort):
        return [r["title"] for r in admin.get(f"/api/recipes?sort={sort}").json()]

    assert titles("rating") == ["Beta", "Alpha"]
    assert titles("cooked") == ["Alpha", "Beta"]
    assert titles("last_cooked") == ["Alpha", "Beta"]


def test_deleting_a_recipe_removes_its_journal(admin):
    slug = _setup(admin)
    admin.put(f"/api/recipes/{slug}/rating", json={"stars": 5})
    admin.post(f"/api/recipes/{slug}/cooked", json={"note": "Good"})
    assert admin.delete(f"/api/recipes/{slug}").status_code == 204
    assert admin.get(f"/api/recipes/{slug}/journal").status_code == 404
