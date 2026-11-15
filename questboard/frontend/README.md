# Questboard frontend

The mobile-first Questboard interface is built with React, TypeScript, and Vite.

```sh
npm install
npm run dev
npm test
npm run build
```

The automated tests use a simulated API and do not require a backend.

The production files are written to `dist/`. The backend serves them at the add-on ingress root. API requests use relative `api/` paths and the Vite base is `./`, so both work under an ingress prefix. The Vite development server does not include an API; serve the build through the backend for full functionality.

## Friday Bunny prototype route

An isolated Friday Bunny prototype is available only when explicitly routed to:

- `http://localhost:5173/prototype/friday-bunny`
- `http://localhost:5173/?prototype=friday-bunny`

This view does not call profile APIs and persists prototype checkpoints only in browser `localStorage` under `questboard.friday_bunny_prototype.v1`.

The prototype expects approved artwork handoff at:

- `assets/prototype/friday/IMG_1359.jpeg`
- `assets/prototype/friday/01_original_three_animal_reference.jpg`
- `assets/prototype/friday/Questboard_G2_Bunny_Hopping_Preview.gif`

If these files are missing, the prototype displays an in-app blocker message instead of introducing replacement art.

For a genuine browser preview (desktop + device-reachable on your local network), run:

```sh
npm run dev -- --host 0.0.0.0 --port 4173
```

Then open either:

- `http://localhost:4173/prototype/friday-bunny`
- `http://<your-machine-lan-ip>:4173/prototype/friday-bunny`
