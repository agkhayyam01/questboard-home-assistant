import random
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .catalog import ITEMS
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
                """CREATE TABLE IF NOT EXISTS reward_events (
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
                      COALESCE(inv.equipped, 0) AS equipped, COALESCE(inv.placed, 0) AS placed
               FROM items i LEFT JOIN inventory inv ON inv.item_id = i.id AND inv.profile_id = ?
               ORDER BY i.rowid""",
            (profile_id,),
        ).fetchall()
        return [Store.item(row) for row in rows]

    @staticmethod
    def item(row):
        result = dict(row)
        for field in ("owned", "equipped", "placed"):
            result[field] = bool(result[field])
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
            if changes.get("placed") and row["category"] not in ("toy", "decoration"):
                raise StoreError(400, "Only toys and decorations can be placed")
            if changes.get("equipped"):
                db.execute(
                    """UPDATE inventory SET equipped = 0 WHERE profile_id = ? AND item_id IN
                       (SELECT id FROM items WHERE category = ?)""",
                    (profile_id, row["category"]),
                )
            for key, value in changes.items():
                db.execute(f"UPDATE inventory SET {key} = ? WHERE profile_id = ? AND item_id = ?", (int(value), profile_id, item_id))
            return {"profile": self.profile(db, profile_id), "items": self.items(db, profile_id)}
