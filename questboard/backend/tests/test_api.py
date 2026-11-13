from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import sqlite3
from zoneinfo import ZoneInfo

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


def test_daily_treat_claim_is_profile_scoped_timezone_aware_and_persistent(client, monkeypatch):
    monkeypatch.setenv("HOUSEHOLD_TIMEZONE", "America/Los_Angeles")
    store = app.state.store
    with store.connect(write=True) as db:
        db.execute("UPDATE profiles SET name = 'Remy saved' WHERE id = 'remy'")
        db.execute("INSERT INTO inventory (profile_id, item_id, equipped) VALUES ('remy', 'bow', 1)")

    before = client.get("/api/profiles/remy/treats").json()
    assert before["daily"]["claimed"] is False
    assert before["daily"]["quantity"] == 3
    assert before["daily"]["timezone"] == "America/Los_Angeles"
    assert {t["id"]: t["quantity"] for t in before["treats"]}["strawberry"] == 0

    responses = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        responses = list(executor.map(lambda _: client.post("/api/profiles/remy/treats/claim"), range(8)))
    assert sum(response.json()["claimed"] for response in responses) == 1
    assert client.get("/api/profiles/remy/treats").json()["treats"][1]["quantity"] == 3
    assert client.post("/api/profiles/gigi/treats/claim").json()["claimed"] is True

    app.state.store = Store(store.path.parent)
    app.state.store.initialize()
    assert client.get("/api/profiles/remy").json()["profile"]["name"] == "Remy saved"
    assert next(i for i in client.get("/api/profiles/remy").json()["items"] if i["id"] == "bow")["equipped"]
    assert client.get("/api/profiles/remy/treats").json()["treats"][1]["quantity"] == 3
    assert client.get("/api/profiles/remy/treats").json()["daily"]["claimed"] is True


def test_daily_allowance_resets_on_configured_local_calendar_date(client, monkeypatch):
    local_now = [
        datetime(2026, 1, 1, 7, 59, tzinfo=timezone.utc).astimezone(ZoneInfo("America/Los_Angeles"))
    ]
    monkeypatch.setattr(Store, "household_now", lambda self: local_now[0])
    url = "/api/profiles/remy/treats"
    first = client.post(url + "/claim").json()
    assert first["claimed"] is True
    assert first["daily"]["next_available_at"] == "2026-01-01T00:00:00-08:00"
    assert client.post(url + "/claim").json()["claimed"] is False

    local_now[0] = datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc).astimezone(ZoneInfo("America/Los_Angeles"))
    assert client.get(url).json()["daily"]["claimed"] is False
    assert client.post(url + "/claim").json()["claimed"] is True
    assert client.get(url).json()["treats"][1]["quantity"] == 6


def test_initialize_adds_treat_tables_without_changing_existing_saved_data(tmp_path):
    store = Store(tmp_path)
    with sqlite3.connect(store.path) as db:
        db.executescript(
            """CREATE TABLE profiles (
                   id TEXT PRIMARY KEY, owner TEXT NOT NULL, species TEXT NOT NULL,
                   name TEXT NOT NULL, color TEXT NOT NULL, chests INTEGER NOT NULL DEFAULT 0);
               CREATE TABLE items (
                   id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
                   rarity TEXT NOT NULL, emoji TEXT NOT NULL);
               CREATE TABLE inventory (
                   profile_id TEXT NOT NULL, item_id TEXT NOT NULL,
                   equipped INTEGER NOT NULL DEFAULT 0, placed INTEGER NOT NULL DEFAULT 0,
                   PRIMARY KEY (profile_id, item_id));
               CREATE TABLE nursery_layout (
                   profile_id TEXT NOT NULL, item_id TEXT NOT NULL, x REAL NOT NULL,
                   y REAL NOT NULL, size INTEGER NOT NULL, layer INTEGER NOT NULL,
                   PRIMARY KEY (profile_id, item_id));
               CREATE TABLE reward_events (
                   source TEXT NOT NULL, event_id TEXT NOT NULL, profile_id TEXT NOT NULL,
                   PRIMARY KEY (source, event_id));
               INSERT INTO profiles VALUES ('remy', 'Remy', 'elephant', 'Peanut', '#abcdef', 2);
               INSERT INTO items VALUES ('bow', 'Ribbon Bow', 'accessory', 'common', '🎀');
               INSERT INTO inventory VALUES ('remy', 'bow', 1, 0);
               INSERT INTO nursery_layout VALUES ('remy', 'bow', 42, 63, 72, 10);"""
        )

    store.initialize()
    details = store.details("remy")
    assert details["profile"] == {
        "id": "remy", "owner": "Remy", "species": "elephant",
        "name": "Peanut", "color": "#abcdef", "chests": 2,
    }
    assert next(item for item in details["items"] if item["id"] == "bow") == {
        "id": "bow", "name": "Ribbon Bow", "category": "accessory",
        "rarity": "common", "emoji": "🎀", "owned": True, "equipped": True,
        "placed": False, "layout": {"x": 42.0, "y": 63.0, "size": 72, "layer": 10},
    }
    assert store.treat_details("remy")["affection"] == 0


def test_feeding_is_exactly_once_and_updates_favorite_affection(client):
    store = app.state.store
    with store.connect(write=True) as db:
        db.execute(
            "INSERT INTO treat_inventory (profile_id, treat_id, quantity) VALUES ('gigi', 'carrot', 3)"
        )
    url = "/api/profiles/gigi/treats/feed"
    body = {"treat_id": "carrot", "request_id": "one-feed"}
    with ThreadPoolExecutor(max_workers=8) as executor:
        responses = list(executor.map(lambda _: client.post(url, json=body), range(8)))
    assert all(response.status_code == 200 for response in responses)
    results = [response.json() for response in responses]
    assert {result["quantity"] for result in results} == {2}
    assert {result["affection"] for result in results} == {8}
    assert all(result["favorite"] for result in results)
    assert client.get("/api/profiles/gigi/treats").json()["affection"] == 8
    assert client.post(url, json={"treat_id": "strawberry", "request_id": "one-feed"}).status_code == 409
    assert client.post(url, json={"treat_id": "carrot", "request_id": "second-feed"}).status_code == 200
    assert client.get("/api/profiles/gigi/treats").json()["treats"][0]["quantity"] == 1
    assert client.post(url, json={"treat_id": "moonberry", "request_id": "empty"}).status_code == 409


def test_special_treat_reward_is_idempotent_and_independent(client):
    url = "/api/profiles/remy/treats/simulate-reward"
    headers = {"Idempotency-Key": "demo-moonberry"}
    assert client.get("/api/profiles/remy/treats").json()["special_milestone_claimed"] is False
    first = client.post(url, headers=headers)
    assert first.status_code == 200
    assert first.json()["granted"] is True
    assert next(t for t in first.json()["treats"] if t["id"] == "moonberry")["quantity"] == 1
    repeat = client.post(url, headers=headers)
    assert repeat.status_code == 200
    assert repeat.json()["granted"] is False
    assert next(t for t in repeat.json()["treats"] if t["id"] == "moonberry")["quantity"] == 1
    assert client.get("/api/profiles/remy/treats").json()["special_milestone_claimed"] is True
    assert client.post("/api/profiles/gigi/treats/simulate-reward", headers=headers).status_code == 409


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


def test_index_is_never_cached_but_hashed_assets_are(client, tmp_path):
    (tmp_path / "dist" / "assets").mkdir(parents=True)
    (tmp_path / "dist" / "index.html").write_text("<html></html>")
    (tmp_path / "dist" / "assets" / "app-abc.js").write_text("1")
    assert "no-cache" in client.get("/").headers["cache-control"]
    assert "cache-control" not in client.get("/assets/app-abc.js").headers
