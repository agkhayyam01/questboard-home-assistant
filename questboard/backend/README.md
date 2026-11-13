# Questboard backend

Python 3.10+ and SQLite are required. From the add-on directory (`questboard/`):

```sh
python -m pip install -r backend/requirements.txt
DATA_DIR=backend/data python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

`DATA_DIR` defaults to `backend/data`. The database is created and seeded on startup; keep this directory to retain state. The API is same-origin. A frontend build at `frontend/dist` is served if present (override with `FRONTEND_DIST`); build frontend assets with relative URLs for ingress prefixes.

Run tests with:

```sh
python -m pip install -r backend/requirements-test.txt
python -m pytest backend/tests --basetemp=backend/.test-tmp
```

Profile and item updates return the updated profile and `{profile, items}` respectively. Simulated rewards return the profile. Each simulation without an `Idempotency-Key` is a new event; repeat a key to safely retry the same event. Keys are global to the simulated source and cannot be reused for a different profile.

Opening a chest with no chests or with a complete collection returns HTTP 409 with a `detail` message and does not consume a chest. Unknown profiles/items return 404, unowned or incompatible items return 400, and invalid input returns 422. Items are unique per profile; outfits and accessories are equipped one per category, while toys, furniture, and decorations can be placed and arranged. Nursery item positions, sizes, and layers are stored per profile in SQLite.

`RewardSource` defines a read-only boundary for a possible future Home Assistant adapter. None is configured, and no credentials, synchronization, or HA write operations exist. `Store.record_reward` deduplicates source event IDs and rejects medication-related task metadata before granting a chest.

Treat inventory is stored separately from collectible items. Each profile can claim three species-favorite treats per local calendar day; configure the Home Assistant app option `household_timezone` (an IANA timezone, default `UTC`) for daily resets. Feeding requires a unique `request_id`, which makes retries safe and consumes at most one treat for that request. The simulated milestone endpoint can grant one moonberry per unique idempotency key; it is not connected to Home Assistant chores.
