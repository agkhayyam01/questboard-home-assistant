from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.rewards import RewardEvent
from backend.store import Store


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("FRONTEND_DIST", str(tmp_path / "dist"))
    with TestClient(app) as client:
        yield client


def reward(client, profile="remy", key=None):
    headers = {"Idempotency-Key": key} if key else {}
    return client.post(f"/api/profiles/{profile}/simulate-reward", headers=headers)


def test_profiles_and_updates_persist(client):
    profiles = client.get("/api/profiles").json()
    assert [(p["id"], p["species"]) for p in profiles] == [
        ("remy", "elephant"), ("gigi", "bunny"), ("lill", "hippo")
    ]
    assert all(p["chests"] == 0 for p in profiles)
    assert client.patch("/api/profiles/remy", json={"name": "Peanut", "color": "#abcdef"}).json()["name"] == "Peanut"
    assert client.get("/api/profiles/remy").json()["profile"]["color"] == "#abcdef"
    assert client.patch("/api/profiles/remy", json={"name": None}).status_code == 422
    assert client.get("/api/profiles/missing").status_code == 404
    app.state.store = Store(app.state.store.path.parent)
    app.state.store.initialize()
    assert client.get("/api/profiles/remy").json()["profile"]["name"] == "Peanut"


def test_rewards_are_idempotent_and_medication_is_excluded(client):
    assert reward(client, key="same").json()["chests"] == 1
    assert reward(client, key="same").json()["chests"] == 1
    assert reward(client, "gigi", "same").status_code == 409
    assert reward(client).json()["chests"] == 2
    store = app.state.store
    events = [
        RewardEvent("ha", "1", "remy", "medication"),
        RewardEvent("ha", "2", "remy", "chore", "Take morning medicine"),
        RewardEvent("ha", "3", "remy", "chore", tags=("daily-meds",)),
        RewardEvent("ha", "4", "remy", "chore", "Tidy room"),
    ]
    assert [store.record_reward(e) for e in events] == [False, False, False, True]
    assert store.record_reward(events[-1]) is False
    assert client.get("/api/profiles/remy").json()["profile"]["chests"] == 3


def test_open_all_unique_and_exhaustion_preserves_chest(client):
    assert client.post("/api/profiles/remy/open-chest").status_code == 409
    item_ids = set()
    total = len(client.get("/api/profiles/remy").json()["items"])
    assert total == 29
    for _ in range(total):
        assert reward(client).status_code == 200
        response = client.post("/api/profiles/remy/open-chest")
        assert response.status_code == 200
        result = response.json()
        assert result["item"]["owned"] and result["item"]["id"] not in item_ids
        assert result["profile"]["chests"] == 0
        item_ids.add(result["item"]["id"])
    reward(client)
    result = client.post("/api/profiles/remy/open-chest")
    assert result.status_code == 409
    assert "complete" in result.json()["detail"].lower()
    assert client.get("/api/profiles/remy").json()["profile"]["chests"] == 1


def test_concurrent_open_and_duplicate_event(client):
    with ThreadPoolExecutor(max_workers=12) as executor:
        results = list(executor.map(lambda _: reward(client, key="concurrent"), range(12)))
    assert all(r.status_code == 200 for r in results)
    assert client.get("/api/profiles/remy").json()["profile"]["chests"] == 1
    with ThreadPoolExecutor(max_workers=12) as executor:
        results = list(executor.map(lambda _: client.post("/api/profiles/remy/open-chest"), range(12)))
    assert [r.status_code for r in results].count(200) == 1
    assert [r.status_code for r in results].count(409) == 11
    state = client.get("/api/profiles/remy").json()
    assert state["profile"]["chests"] == 0
    assert sum(i["owned"] for i in state["items"]) == 1
    for _ in range(10):
        reward(client)
    with ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(lambda _: client.post("/api/profiles/remy/open-chest"), range(10)))
    assert all(r.status_code == 200 for r in results)
    assert len({r.json()["item"]["id"] for r in results}) == 10
    assert client.get("/api/profiles/remy").json()["profile"]["chests"] == 0


def test_inventory_equipment_and_placements(client):
    initial = client.get("/api/profiles/remy").json()["items"]
    assert client.post("/api/profiles/remy/items/raincoat", json={"equipped": True}).status_code == 400
    # Open until every item is owned so categories and replacement can be tested.
    for _ in initial:
        reward(client)
        client.post("/api/profiles/remy/open-chest").raise_for_status()
    for item in ("raincoat", "striped-shirt", "bow"):
        assert client.post(f"/api/profiles/remy/items/{item}", json={"equipped": True}).status_code == 200
    assert client.post("/api/profiles/remy/items/ball", json={"equipped": True}).status_code == 400
    assert client.post("/api/profiles/remy/items/raincoat", json={"placed": True}).status_code == 400
    assert client.post("/api/profiles/remy/items/ball", json={"placed": True}).status_code == 200
    assert client.post("/api/profiles/remy/items/plant", json={"placed": True}).status_code == 200
    assert client.post("/api/profiles/remy/items/ball", json={"placed": "true"}).status_code == 422
    assert client.post("/api/profiles/remy/items/nonexistent", json={}).status_code == 404
    app.state.store.initialize()
    items = {item["id"]: item for item in client.get("/api/profiles/remy").json()["items"]}
    assert not items["raincoat"]["equipped"]
    assert items["striped-shirt"]["equipped"] and items["bow"]["equipped"]
    assert items["ball"]["placed"] and items["plant"]["placed"]
    client.post("/api/profiles/remy/items/ball", json={"placed": False})
    assert not next(i for i in client.get("/api/profiles/remy").json()["items"] if i["id"] == "ball")["placed"]


def test_nursery_layout_is_validated_profile_scoped_and_persistent(client):
    store = app.state.store
    with store.connect(write=True) as db:
        db.executemany(
            "INSERT INTO inventory (profile_id, item_id, placed) VALUES (?, ?, 1)",
            [("remy", "ball"), ("gigi", "ball"), ("remy", "cozy-bed")],
        )

    layout_url = "/api/profiles/remy/items/ball/layout"
    assert client.post("/api/profiles/remy/items/cozy-bed", json={"placed": True}).status_code == 200
    assert client.put(
        "/api/profiles/remy/items/cozy-bed/layout",
        json={"x": 42, "y": 61, "size": 80, "layer": 30},
    ).status_code == 200
    assert client.get("/api/profiles/remy").json()["items"][16]["layout"] is None
    assert client.put(layout_url, json={"x": 12, "y": 75, "size": 64, "layer": 20}).status_code == 200
    assert client.put(
        "/api/profiles/gigi/items/ball/layout",
        json={"x": 83.5, "y": 68, "size": 92, "layer": 40},
    ).status_code == 200
    layouts = {
        profile: next(item for item in client.get(f"/api/profiles/{profile}").json()["items"] if item["id"] == "ball")["layout"]
        for profile in ("remy", "gigi", "lill")
    }
    assert layouts == {
        "remy": {"x": 12.0, "y": 75.0, "size": 64, "layer": 20},
        "gigi": {"x": 83.5, "y": 68.0, "size": 92, "layer": 40},
        "lill": None,
    }

    app.state.store = Store(store.path.parent)
    app.state.store.initialize()
    assert next(item for item in client.get("/api/profiles/remy").json()["items"] if item["id"] == "ball")["layout"] == layouts["remy"]
    assert next(item for item in client.get("/api/profiles/remy").json()["items"] if item["id"] == "cozy-bed")["layout"] == {
        "x": 42.0, "y": 61.0, "size": 80, "layer": 30,
    }
    assert client.delete(layout_url).status_code == 200
    assert next(item for item in client.get("/api/profiles/remy").json()["items"] if item["id"] == "ball")["layout"] is None
    assert next(item for item in client.get("/api/profiles/gigi").json()["items"] if item["id"] == "ball")["layout"] == layouts["gigi"]


def test_nursery_layout_rejects_invalid_or_unplaced_items(client):
    store = app.state.store
    with store.connect(write=True) as db:
        db.execute("INSERT INTO inventory (profile_id, item_id, placed) VALUES ('remy', 'ball', 1)")
        db.execute("INSERT INTO inventory (profile_id, item_id) VALUES ('remy', 'glasses')")
    url = "/api/profiles/remy/items/ball/layout"
    valid = {"x": 50, "y": 50, "size": 64, "layer": 10}
    for changed in (
        {"x": -1}, {"y": 101}, {"size": 31}, {"size": 129}, {"layer": 0}, {"layer": 1001}, {"x": True},
    ):
        assert client.put(url, json={**valid, **changed}).status_code == 422
    assert client.put("/api/profiles/remy/items/plant/layout", json=valid).status_code == 400
    assert client.put("/api/profiles/remy/items/glasses/layout", json=valid).status_code == 400
    assert client.put("/api/profiles/remy/items/missing/layout", json=valid).status_code == 404
    assert client.delete("/api/profiles/remy/items/plant/layout").status_code == 400


def test_frontend_and_api_fallback(client, tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>Questboard</html>")
    (dist / "app.js").write_text("app")
    assert "Questboard" in client.get("/").text
    assert client.get("/app.js").text == "app"
    assert client.get("/room").status_code == 200
    assert client.get("/missing.js").status_code == 404
    assert client.get("/api/no-such-route").status_code == 404
    with TestClient(app, root_path="/ingress") as ingress:
        assert ingress.get("/").status_code == 200
        assert ingress.get("/api/profiles").status_code == 200


def test_frontend_rejects_traversal_and_escaping_symlinks(client, tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("safe index")
    (dist / "app.js").write_text("safe asset")
    secret = tmp_path / "private.txt"
    secret.write_text("private content")
    (dist / "outside.txt").symlink_to(secret)
    (dist / "outside-dir").symlink_to(tmp_path, target_is_directory=True)
    (dist / "inside.js").symlink_to(dist / "app.js")

    assert client.get("/inside.js").text == "safe asset"
    for path in (
        "/%2e%2e/private.txt",
        "/..%2fprivate.txt",
        "/outside.txt",
        "/outside-dir/private.txt",
        "/outside-dir/room",
    ):
        response = client.get(path)
        assert response.status_code == 404, path
        assert "private content" not in response.text


def test_frontend_rejects_escaping_index_symlink(client, tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    secret = tmp_path / "private.txt"
    secret.write_text("private content")
    (dist / "index.html").symlink_to(secret)
    for path in ("/", "/index.html", "/room"):
        response = client.get(path)
        assert response.status_code == 404
        assert "private content" not in response.text
