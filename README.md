# Questboard: Creature Companions

A cozy, mobile-first creature companion game for Remy, Gigi, and Lill. Collect
treasures, dress your creature, and decorate its nursery. Each profile has its
own saved creature, chests, and collection.

![Questboard on a phone](screenshots/mobile.png)

## Play

Choose a profile, name and customize its creature, then use the simulated reward
button to earn a chest. Open it for a collectible and use your collection to
equip clothes and accessories or place toys and decorations. Rewards are
selected from items the player does not already own; when the collection is
complete, no chest is consumed attempting to open it.

This first version uses **simulated rewards only**. It does not read or modify
Home Assistant entities, chores, automations, or reminders. Medication tasks
must never be used for rewards. The backend has a boundary for a future,
read-only reward source; live synchronization is not enabled.

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

For an add-on image build, run `docker build -t questboard ./questboard` from
the repository root. No Home Assistant credentials or tokens are needed.
