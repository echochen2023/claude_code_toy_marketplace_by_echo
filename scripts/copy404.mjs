// GitHub Pages has no SPA fallback: unknown paths (e.g. a refresh on /categories)
// are answered with dist/404.html. Serving the app shell there lets React Router
// resolve the URL client-side.
import { copyFileSync } from "node:fs";

copyFileSync("dist/index.html", "dist/404.html");
console.log("Copied dist/index.html -> dist/404.html");
