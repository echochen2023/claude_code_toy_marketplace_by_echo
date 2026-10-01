---
description: Start the local Supabase stack (npx supabase start) and the Vite dev server (npm run dev) for this project.
disable-model-invocation: true
---

Start the whole local environment for this project. Run every command from the repo root, and prefix each shell command with `source ~/.nvm/nvm.sh >/dev/null 2>&1; nvm use >/dev/null 2>&1;` so it runs on the Node version pinned in `.nvmrc` (the shell default may be too old).

1. **Docker.** Run `docker info >/dev/null 2>&1`. If it fails, tell the user to open Docker Desktop and stop here.
2. **Dependencies.** If `node_modules` is missing, run `npm install` first.
3. **Supabase.** Check `docker ps --format '{{.Names}}'` for `supabase_db_<project_id>` (`project_id` comes from `supabase/config.toml`).
   - If it's already running, skip this step.
   - Otherwise run `npx supabase start` (timeout 600000 ms; the first start can pull images).
   - If it fails, show the error. Don't try workarounds such as a bare Postgres.
4. **Dev server.** Check `lsof -i :8080 -sTCP:LISTEN`.
   - If something is already listening, report that and don't start a second one.
   - Otherwise run `npm run dev` with the Bash tool's `run_in_background: true` and `timeout: 7200000` (the 2-hour maximum; without it the background task is killed after the 30-minute default).
   - Poll `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/claude_code_toy_marketplace/` (up to ~15 tries, 1 s apart) until it returns 200.
5. **Report.** Show a short summary:
   - the app URL: `http://localhost:8080/claude_code_toy_marketplace/`
   - Supabase Studio: `http://127.0.0.1:54323`
   - the background task ID of the dev server, so `/stop_project` can stop it.

Reply to the user in the language they are using.
