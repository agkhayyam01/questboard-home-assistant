# Questboard: Creature Companions

A cozy, mobile-first creature companion game for Remy, Gigi, and Lill. Collect
treasures, dress your creature, decorate its nursery, and share treats. Each
profile has its own saved creature, affection, treat inventory, chests, and
collection.

![Questboard on a phone](screenshots/mobile.png)

Lill's mobile nursery before and after the 0.3 hippo redesign:
[before (0.2.0)](screenshots/lill-before.png) ·
[after (0.3.0)](screenshots/lill-after.png).

## Play

Choose a profile, name and customize its creature, then use the simulated reward
button to earn a chest. Open it for a collectible and use your collection to
equip clothes and accessories or place toys, furniture, and decorations. In
Play mode, creatures wander around the floor; tap the floor to guide them, or
tap a toy or furniture item to play or rest. Decorate mode pauses wandering and
lets children select, drag, pinch, and arrange objects.

Open **Treats / Feed** to claim three free treats per profile each local day and
feed the creature. Daily treats match each species' favorite. Treat quantities
and affection are saved independently for each profile; unused treats remain
available, and missed days do not cause penalties. A rare moonberry can be
added through the pretend milestone control. Set `household_timezone` in the
Questboard app configuration to an IANA timezone such as `America/Los_Angeles`
to choose the daily reset boundary. The default is `UTC`.

Rewards are selected from items the player does not already own; when the
collection is complete, no chest is consumed attempting to open it.

Questboard uses **simulated rewards only**. It does not read or modify
Home Assistant entities, chores, automations, or reminders. Medication tasks
must never be used for rewards. The backend has a boundary for a future,
read-only reward source; live synchronization is not enabled.

GitHub Actions runs tests and builds on pull requests. Repository administrators
can enable **Settings → General → Pull Requests → Allow auto-merge** and configure
required checks in branch protection to allow successful pull requests to merge
automatically. The repository's current CI workflow only has read permissions;
no workflow bypasses review rules or failed checks.

## Install on Home Assistant Green

Do not install or deploy until you are ready to try the game:

1. In Home Assistant, open **Settings → Apps → App Store** (on older versions,
   **Settings → Add-ons → Add-on Store**).
2. Open the menu, choose **Repositories**, and add
   `https://github.com/agkhayyam01/questboard-home-assistant`.
3. Find **Questboard Creature Companions**, install it, and start it. The first
   installation builds the image and may take a while.
4. Open Questboard from the sidebar or the app's **Open Web UI** button.

The app supports ARM64 (`aarch64`, including Home Assistant Green) and AMD64.
Home Assistant ingress provides authentication; the game does not expose a
separate network port. Profiles are not separate security accounts: anyone
allowed to open the app can use all profiles. The SQLite database is stored in
the app's persistent `/data` directory and is included in Home Assistant app
backups. Back up the app before removing it or migrating installations.

## Local development and testing

Prerequisites: Python 3.12, Node.js 22, and npm.

```sh
cd questboard
python -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
pip install -r backend/requirements-test.txt
cd frontend
npm ci
npm run build
cd ..
DATA_DIR="$(pwd)/.local-data" uvicorn backend.main:app --reload
```

Open `http://127.0.0.1:8000/`. The backend serves the built frontend. Rebuild
the frontend after changes. To run the backend tests:

```sh
cd questboard
python -m pytest backend
```

Run frontend tests and the production build with:

```sh
cd questboard/frontend
npm ci
npm test
npm run build
```

Pull requests run the backend and frontend tests and production build in GitHub
Actions. CI also validates the Home Assistant app configuration, then builds
and checks the image on a native ARM64 runner. The container test simulates
ingress and verifies that a Docker volume retains SQLite data after recreation;
it does not install or deploy the app to Home Assistant.

To run the container integration test locally:

```sh
docker build -t questboard-ci ./questboard
cd questboard
QUESTBOARD_TEST_IMAGE=questboard-ci python -m pytest backend/tests/test_addon_container.py
```

No Home Assistant credentials or tokens are needed.
