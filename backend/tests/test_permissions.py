"""What a member may not do with other people's things."""

from .conftest import SAMPLE_RECIPE


def test_members_cannot_change_others_recipes(admin, member):
    slug = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]
    photo = {"file": ("x.png", b"not checked", "image/png")}
    responses = [
        member.put(f"/api/recipes/{slug}", json={**SAMPLE_RECIPE, "title": "Mine now"}),
        member.delete(f"/api/recipes/{slug}"),
        member.put(f"/api/recipes/{slug}/photo", files=photo),
        member.put(
            f"/api/recipes/{slug}/photo/from-url", json={"url": "http://site.example/a.jpg"}
        ),
        member.delete(f"/api/recipes/{slug}/photo"),
    ]
    assert [r.status_code for r in responses] == [403] * 5
    assert admin.get(f"/api/recipes/{slug}").json()["title"] == SAMPLE_RECIPE["title"]


def test_members_cannot_touch_others_shopping_extras(admin, member):
    extra_id = admin.post("/api/shopping/extras", json={"text": "Eggs"}).json()["extras"][0]["id"]
    assert (
        member.patch(f"/api/shopping/extras/{extra_id}", json={"checked": True}).status_code == 404
    )
    assert member.delete(f"/api/shopping/extras/{extra_id}").status_code == 404
    assert admin.get("/api/shopping").json()["extras"][0]["checked"] is False


def test_members_cannot_touch_others_journal(admin, member):
    slug = admin.post("/api/recipes", json=SAMPLE_RECIPE).json()["slug"]
    journal = admin.post(f"/api/recipes/{slug}/cooked", json={"note": "Too salty"}).json()
    cook_id, note_id = journal["cooks"][0]["id"], journal["comments"][0]["id"]

    assert member.patch(f"/api/comments/{note_id}", json={"text": "Perfect"}).status_code == 404
    assert member.delete(f"/api/comments/{note_id}").status_code == 404
    assert member.delete(f"/api/cooked/{cook_id}").status_code == 404
    journal = admin.get(f"/api/recipes/{slug}/journal").json()
    assert [c["text"] for c in journal["comments"]] == ["Too salty"]
    assert len(journal["cooks"]) == 1


def test_members_cannot_reach_admin_endpoints(member):
    for path in ("/api/users", "/api/admin/ai/providers", "/api/admin/backup"):
        assert member.get(path).status_code == 403, path
    new_user = {"username": "eve", "display_name": "Eve", "password": "eve-password"}
    assert member.post("/api/users", json=new_user).status_code == 403
