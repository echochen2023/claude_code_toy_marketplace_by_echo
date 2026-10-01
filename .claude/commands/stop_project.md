---
description: Close all of this project's local servers (Vite dev/preview server, Playwright browser) and stop the local Supabase stack (npx supabase stop).
disable-model-invocation: true
---

Shut down the whole local environment for this project. Run every command from the repo root, and prefix each `npx` command with `source ~/.nvm/nvm.sh >/dev/null 2>&1; nvm use >/dev/null 2>&1;` so it runs on the Node version pinned in `.nvmrc`.

1. **Background tasks.** If this session started `npm run dev` / `npm run preview` as background tasks, stop them with `TaskStop`.
2. **Leftover web servers.** For ports 8080 (dev) and 4173 (preview):
   - Find listeners with `lsof -ti :<port> -sTCP:LISTEN`.
   - For each PID, check `ps -o command= -p <PID>`.
   - Kill it only if the command is this repo's `vite` (the path contains this project's directory). If it's something else, leave it running and tell the user.
3. **Playwright browser.** If the Playwright MCP browser is open, close it with `mcp__playwright__browser_close`. If it isn't open, skip this step.
4. **Supabase.** Run `npx supabase stop` (timeout 180000 ms).
   - Don't pass `--no-backup`; local data must be kept.
   - Don't use the Docker Desktop group-stop button, which can fail silently.
5. **Verify.**
   - `lsof -i :8080 -sTCP:LISTEN` and `lsof -i :4173 -sTCP:LISTEN` should return nothing.
   - `docker ps --format '{{.Names}}' | grep supabase` should return nothing.
6. **Report.** Tell the user what was stopped and what was already stopped, and note that the local data was kept.

Reply to the user in the language they are using.
