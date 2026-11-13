import json
import os
import random
import sqlite3
from datetime import datetime, time, timedelta
from contextlib import contextmanager
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .catalog import FAVORITE_TREATS, ITEMS, TREATS
from .rewards import RewardEvent, is_rewardable


class StoreError(Exception):
    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail


class Store:
    def __init__(self, data_dir: Path):
        data_dir.mkdir(parents=True, exist_ok=True)
        self.path = data_dir / "questboard.sqlite3"

    @contextmanager
    def connect(self, write=False):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        try:
            if write:
                db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def initialize(self):
        with self.connect(write=True) as db:
            for statement in (
                """CREATE TABLE IF NOT EXISTS profiles (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL, species TEXT NOT NULL,
                    name TEXT NOT NULL, color TEXT NOT NULL,
                    chests INTEGER NOT NULL DEFAULT 0 CHECK (chests >= 0))""",
                """CREATE TABLE IF NOT EXISTS items (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
                    rarity TEXT NOT NULL, emoji TEXT NOT NULL)""",
                """CREATE TABLE IF NOT EXISTS inventory (
                    profile_id TEXT NOT NULL REFERENCES profiles(id),
                    item_id TEXT NOT NULL REFERENCES items(id),
                    equipped INTEGER NOT NULL DEFAULT 0,
                    placed INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (profile_id, item_id))""",
                """CREATE TABLE IF NOT EXISTS nursery_layout (
                    profile_id TEXT NOT NULL REFERENCES profiles(id),
                    item_id TEXT NOT NULL REFERENCES items(id),
                    x REAL NOT NULL CHECK (x >= 0 AND x <= 100),
                    y REAL NOT NULL CHECK (y >= 0 AND y <= 100),
                    size INTEGER NOT NULL CHECK (size >= 32 AND size <= 128),
                    layer INTEGER NOT NULL CHECK (layer >= 1 AND layer <= 1000),
                    PRIMARY KEY (profile_id, item_id))""",
                """CREATE TABLE IF NOT EXISTS reward_events (
                    source TEXT NOT NULL, event_id TEXT NOT NULL,
                    profile_id TEXT NOT NULL REFERENCES profiles(id),
                    PRIMARY KEY (source, event_id))""",
                """CREATE TABLE IF NOT EXISTS treat_inventory (
                    profile_id TEXT NOT NULL REFERENCES profiles(id),
                    treat_id TEXT NOT NULL REFERENCES treats(id),
                    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
                    PRIMARY KEY (profile_id, treat_id))""",
                """CREATE TABLE IF NOT EXISTS treats (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL,
                    rarity TEXT NOT NULL, emoji TEXT NOT NULL)""",
                """CREATE TABLE IF NOT EXISTS daily_treat_claims (
                    profile_id TEXT NOT NULL REFERENCES profiles(id),
                    claim_date TEXT NOT NULL,
                    quantity INTEGER NOT NULL CHECK (quantity > 0),
                    PRIMARY KEY (profile_id, claim_date))""",
                """CREATE TABLE IF NOT EXISTS companion_state (
                    profile_id TEXT PRIMARY KEY REFERENCES profiles(id),
                    affection INTEGER NOT NULL DEFAULT 0
                        CHECK (affection >= 0 AND affection <= 100))""",
                """CREATE TABLE IF NOT EXISTS treat_feeds (
                    profile_id TEXT NOT NULL REFERENCES profiles(id),
                    request_id TEXT NOT NULL,
                    treat_id TEXT NOT NULL REFERENCES treats(id),
                    response_json TEXT NOT NULL,
                    PRIMARY KEY (profile_id, request_id))""",
                """CREATE TABLE IF NOT EXISTS treat_reward_events (
                    source TEXT NOT NULL, event_id TEXT NOT NULL,
                    profile_id TEXT NOT NULL REFERENCES profiles(id),
                    PRIMARY KEY (source, event_id))""",
            ):
                db.execute(statement)
            db.executemany(
                "INSERT OR IGNORE INTO profiles (id, owner, species, name, color) VALUES (?, ?, ?, ?, ?)",
                [
                    ("remy", "Remy", "elephant", "Remy", "#a3b8d5"),
                    ("gigi", "Gigi", "bunny", "Gigi", "#f4b6c8"),
                    ("lill", "Lill", "hippo", "Lill", "#b9a3d5"),
                ],
            )
            db.executemany(
                "INSERT OR IGNORE INTO items (id, name, category, rarity, emoji) VALUES (?, ?, ?, ?, ?)",
                ITEMS,
            )
            db.executemany(
                "INSERT OR IGNORE INTO treats (id, name, rarity, emoji) VALUES (?, ?, ?, ?)",
                TREATS,
            )
            db.execute(
                """INSERT OR IGNORE INTO companion_state (profile_id)
                   SELECT id FROM profiles"""
            )

    @staticmethod
    def household_timezone():
        zone_name = os.environ.get("HOUSEHOLD_TIMEZONE")
        if not zone_name:
            try:
                options = json.loads(Path("/data/options.json").read_text())
                zone_name = options.get("household_timezone")
            except (OSError, ValueError, AttributeError):
                zone_name = None
        try:
            return ZoneInfo(zone_name or "UTC")
        except (ZoneInfoNotFoundError, TypeError, ValueError):
            return ZoneInfo("UTC")

    @classmethod
    def household_now(cls):
        return datetime.now(cls.household_timezone())

    @staticmethod
    def treat_list(db, profile_id):
        rows = db.execute(
            """SELECT t.id, t.name, t.rarity, t.emoji,
                      COALESCE(ti.quantity, 0) AS quantity
               FROM treats t LEFT JOIN treat_inventory ti
                 ON ti.treat_id = t.id AND ti.profile_id = ?
               ORDER BY t.rowid""",
            (profile_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def treat_details(self, profile_id):
        now = self.household_now()
        today = now.date().isoformat()
        with self.connect() as db:
            profile = self.profile(db, profile_id)
            claim = db.execute(
                "SELECT quantity FROM daily_treat_claims WHERE profile_id = ? AND claim_date = ?",
                (profile_id, today),
            ).fetchone()
            state = db.execute(
                "SELECT affection FROM companion_state WHERE profile_id = ?",
                (profile_id,),
            ).fetchone()
            special_reward = db.execute(
                """SELECT 1 FROM treat_reward_events
                   WHERE profile_id = ? AND source = 'simulated' AND event_id = 'demo-moonberry'""",
                (profile_id,),
            ).fetchone()
            return {
                "treats": self.treat_list(db, profile_id),
                "affection": state["affection"],
                "favorite_treat": FAVORITE_TREATS.get(profile["species"].lower()),
                "special_milestone_claimed": special_reward is not None,
                "daily": {
                    "claimed": claim is not None,
                    "quantity": claim["quantity"] if claim else 3,
                    "next_available_at": datetime.combine(
                        now.date() + timedelta(days=1), time.min, tzinfo=now.tzinfo
                    ).isoformat(),
                    "timezone": str(now.tzinfo),
                },
            }

    def claim_daily_treats(self, profile_id):
        now = self.household_now()
        today = now.date().isoformat()
        with self.connect(write=True) as db:
            profile = self.profile(db, profile_id)
            claimed = db.execute(
                """INSERT OR IGNORE INTO daily_treat_claims (profile_id, claim_date, quantity)
                   VALUES (?, ?, 3)""",
                (profile_id, today),
            ).rowcount == 1
            if claimed:
                treat_id = FAVORITE_TREATS.get(profile["species"].lower(), "strawberry")
                db.execute(
                    """INSERT INTO treat_inventory (profile_id, treat_id, quantity)
                       VALUES (?, ?, 3)
                       ON CONFLICT(profile_id, treat_id)
                       DO UPDATE SET quantity = quantity + 3""",
                    (profile_id, treat_id),
                )
        return {"claimed": claimed, **self.treat_details(profile_id)}

    def grant_special_treat(self, profile_id, event_id):
        with self.connect(write=True) as db:
            self.profile(db, profile_id)
            inserted = db.execute(
                """INSERT OR IGNORE INTO treat_reward_events (source, event_id, profile_id)
                   VALUES ('simulated', ?, ?)""",
                (event_id, profile_id),
            ).rowcount == 1
            if inserted:
                db.execute(
                    """INSERT INTO treat_inventory (profile_id, treat_id, quantity)
                       VALUES (?, 'moonberry', 1)
                       ON CONFLICT(profile_id, treat_id)
                       DO UPDATE SET quantity = quantity + 1""",
                    (profile_id,),
                )
            elif db.execute(
                "SELECT profile_id FROM treat_reward_events WHERE source = 'simulated' AND event_id = ?",
                (event_id,),
            ).fetchone()["profile_id"] != profile_id:
                raise StoreError(409, "Reward event belongs to another profile")
        return {"granted": inserted, **self.treat_details(profile_id)}

    def feed_treat(self, profile_id, treat_id, request_id):
        with self.connect(write=True) as db:
            profile = self.profile(db, profile_id)
            treat = db.execute("SELECT id, name, emoji FROM treats WHERE id = ?", (treat_id,)).fetchone()
            if treat is None:
                raise StoreError(404, "Treat not found")
            previous = db.execute(
                "SELECT treat_id, response_json FROM treat_feeds WHERE profile_id = ? AND request_id = ?",
                (profile_id, request_id),
            ).fetchone()
            if previous:
                if previous["treat_id"] != treat_id:
                    raise StoreError(409, "Feeding request was already used")
                return json.loads(previous["response_json"])
            inventory = db.execute(
                "SELECT quantity FROM treat_inventory WHERE profile_id = ? AND treat_id = ?",
                (profile_id, treat_id),
            ).fetchone()
            if inventory is None or inventory["quantity"] < 1:
                raise StoreError(409, "No treats of this kind are available")
            favorite = FAVORITE_TREATS.get(profile["species"].lower()) == treat_id
            db.execute(
                "UPDATE treat_inventory SET quantity = quantity - 1 WHERE profile_id = ? AND treat_id = ?",
                (profile_id, treat_id),
            )
            db.execute(
                """UPDATE companion_state SET affection = MIN(100, affection + ?)
                   WHERE profile_id = ?""",
                (8 if favorite else 5, profile_id),
            )
            state = db.execute(
                "SELECT affection FROM companion_state WHERE profile_id = ?", (profile_id,)
            ).fetchone()
            result = {
                "fed": True,
                "treat": dict(treat),
                "favorite": favorite,
                "quantity": inventory["quantity"] - 1,
                "affection": state["affection"],
                "profile": profile,
            }
            db.execute(
                "INSERT INTO treat_feeds (profile_id, request_id, treat_id, response_json) VALUES (?, ?, ?, ?)",
                (profile_id, request_id, treat_id, json.dumps(result)),
            )
            return result

    @staticmethod
    def profile(db, profile_id):
        row = db.execute("SELECT id, owner, species, name, color, chests FROM profiles WHERE id = ?", (profile_id,)).fetchone()
        if row is None:
            raise StoreError(404, "Profile not found")
        return dict(row)

    @staticmethod
    def items(db, profile_id):
        rows = db.execute(
            """SELECT i.*, inv.item_id IS NOT NULL AS owned,
                      COALESCE(inv.equipped, 0) AS equipped, COALESCE(inv.placed, 0) AS placed,
                      nl.x AS layout_x, nl.y AS layout_y, nl.size AS layout_size, nl.layer AS layout_layer
               FROM items i LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.profile_id = ?
               LEFT JOIN nursery_layout nl ON nl.item_id = i.id AND nl.profile_id = ?
               ORDER BY i.rowid""",
            (profile_id, profile_id),
        ).fetchall()
        return [Store.item(row) for row in rows]

    @staticmethod
    def item(row):
        result = dict(row)
        for field in ("owned", "equipped", "placed"):
            result[field] = bool(result[field])
        result["layout"] = (
            {"x": result.pop("layout_x"), "y": result.pop("layout_y"),
             "size": result.pop("layout_size"), "layer": result.pop("layout_layer")}
            if result["layout_x"] is not None else None
        )
        if result["layout"] is None:
            for field in ("layout_x", "layout_y", "layout_size", "layout_layer"):
                result.pop(field)
        return result

    def profiles(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute("SELECT id, owner, species, name, color, chests FROM profiles ORDER BY rowid")]

    def details(self, profile_id):
        with self.connect() as db:
            return {"profile": self.profile(db, profile_id), "items": self.items(db, profile_id)}

    def update_profile(self, profile_id, changes):
        with self.connect(write=True) as db:
            self.profile(db, profile_id)
            for key, value in changes.items():
                db.execute(f"UPDATE profiles SET {key} = ? WHERE id = ?", (value, profile_id))
            return self.profile(db, profile_id)

    def record_reward(self, event: RewardEvent):
        """Record one source event once; excluded tasks never grant chests."""
        with self.connect(write=True) as db:
            self.profile(db, event.profile_id)
            if not is_rewardable(event):
                return False
            previous = db.execute(
                "SELECT profile_id FROM reward_events WHERE source = ? AND event_id = ?",
                (event.source, event.event_id),
            ).fetchone()
            if previous:
                if previous["profile_id"] != event.profile_id:
                    raise StoreError(409, "Reward event belongs to another profile")
                return False
            db.execute("INSERT INTO reward_events VALUES (?, ?, ?)", (event.source, event.event_id, event.profile_id))
            db.execute("UPDATE profiles SET chests = chests + 1 WHERE id = ?", (event.profile_id,))
            return True

    def open_chest(self, profile_id):
        with self.connect(write=True) as db:
            profile = self.profile(db, profile_id)
            if profile["chests"] < 1:
                raise StoreError(409, "No chests available")
            available = [item for item in self.items(db, profile_id) if not item["owned"]]
            if not available:
                raise StoreError(409, "Collection complete; no new items available")
            weights = {"common": 6, "uncommon": 3, "rare": 1}
            item = random.choices(available, weights=[weights[i["rarity"]] for i in available], k=1)[0]
            db.execute("INSERT INTO inventory (profile_id, item_id) VALUES (?, ?)", (profile_id, item["id"]))
            db.execute("UPDATE profiles SET chests = chests - 1 WHERE id = ?", (profile_id,))
            item["owned"] = True
            return {"item": item, "profile": self.profile(db, profile_id)}

    def update_item(self, profile_id, item_id, changes):
        with self.connect(write=True) as db:
            self.profile(db, profile_id)
            row = db.execute(
                """SELECT i.category, inv.item_id FROM items i LEFT JOIN inventory inv
                   ON i.id = inv.item_id AND inv.profile_id = ? WHERE i.id = ?""",
                (profile_id, item_id),
            ).fetchone()
            if row is None:
                raise StoreError(404, "Item not found")
            if row["item_id"] is None:
                raise StoreError(400, "Item is not owned")
            if changes.get("equipped") and row["category"] not in ("outfit", "accessory"):
                raise StoreError(400, "Only outfits and accessories can be equipped")
            if changes.get("placed") and row["category"] not in ("toy", "furniture", "decoration"):
                raise StoreError(400, "Only toys, furniture, and decorations can be placed")
            if changes.get("equipped"):
                db.execute(
                    """UPDATE inventory SET equipped = 0 WHERE profile_id = ? AND item_id IN
                       (SELECT id FROM items WHERE category = ?)""",
                    (profile_id, row["category"]),
                )
            for key, value in changes.items():
                db.execute(f"UPDATE inventory SET {key} = ? WHERE profile_id = ? AND item_id = ?", (int(value), profile_id, item_id))
            return {"profile": self.profile(db, profile_id), "items": self.items(db, profile_id)}

    def update_layout(self, profile_id, item_id, layout):
        with self.connect(write=True) as db:
            self.profile(db, profile_id)
            row = db.execute(
                """SELECT i.category, inv.placed FROM items i
                   LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.profile_id = ?
                   WHERE i.id = ?""",
                (profile_id, item_id),
            ).fetchone()
            if row is None:
                raise StoreError(404, "Item not found")
            if row["placed"] is None:
                raise StoreError(400, "Item is not owned")
            if not row["placed"] or row["category"] not in ("toy", "furniture", "decoration"):
                raise StoreError(400, "Only placed toys, furniture, and decorations can be arranged")
            db.execute(
                """INSERT INTO nursery_layout (profile_id, item_id, x, y, size, layer)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(profile_id, item_id) DO UPDATE SET
                       x = excluded.x, y = excluded.y,
                       size = excluded.size, layer = excluded.layer""",
                (profile_id, item_id, layout["x"], layout["y"], layout["size"], layout["layer"]),
            )
            return {"profile": self.profile(db, profile_id), "items": self.items(db, profile_id)}

    def reset_layout(self, profile_id, item_id):
        with self.connect(write=True) as db:
            self.profile(db, profile_id)
            row = db.execute(
                """SELECT i.category, inv.placed FROM items i
                   LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.profile_id = ?
                   WHERE i.id = ?""",
                (profile_id, item_id),
            ).fetchone()
            if row is None:
                raise StoreError(404, "Item not found")
            if row["placed"] is None:
                raise StoreError(400, "Item is not owned")
            if not row["placed"] or row["category"] not in ("toy", "furniture", "decoration"):
                raise StoreError(400, "Only placed toys, furniture, and decorations can be arranged")
            db.execute("DELETE FROM nursery_layout WHERE profile_id = ? AND item_id = ?", (profile_id, item_id))
            return {"profile": self.profile(db, profile_id), "items": self.items(db, profile_id)}
