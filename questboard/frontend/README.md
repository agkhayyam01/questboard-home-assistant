# Questboard frontend

The mobile-first Questboard interface is built with React, TypeScript, and Vite.

```sh
npm install
npm run dev
npm run build
```

The production files are written to `dist/`. The backend serves them at the add-on ingress root. API requests use relative `api/` paths and the Vite base is `./`, so both work under an ingress prefix. The Vite development server does not include an API; serve the build through the backend for full functionality.
