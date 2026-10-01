---
name: run-claude-code-toy-marketplace
description: Run, start, screenshot and drive the toy marketplace web app (Vite + local Supabase) in a headless browser, logged in as any existing local test account. Use when asked to run the app, take a screenshot of a page, check a UI change in the real app, or click through profile / product / chat pages.
---

Start the local Supabase stack and the Vite dev server, then drive the app headlessly with
`.claude/skills/run-claude-code-toy-marketplace/driver.mjs`: a Playwright script that reads one
command per line from stdin and can log in as any **existing** local account without a password.
All paths are relative to the repo root. Verified on macOS (Apple Silicon) with Node 22.

## Prerequisites

- Docker Desktop running (the local Supabase stack runs in containers).
- Node 22 from `.nvmrc`: run `nvm use` in the shell before starting Claude Code.
- `playwright` is already a dependency. Its Chromium build lives in `~/Library/Caches/ms-playwright`; if it's missing:

```bash
npx playwright install chromium
```

## Launch

Use the project command **`/run_project`**. It starts `npx supabase start` if needed, then `npm run dev`
in the background on port 8080. Check that both are up:

```bash
docker ps --format '{{.Names}}' | grep -c "_aonhrhzuntjkskglqdwv"    # > 0: Supabase containers running
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/claude_code_toy_marketplace_by_echo/   # 200
```

Stop everything with **`/stop_project`** (keeps local data).

## Run (agent path)

Pipe a script into the driver. It stops at the first failing command, saves `failure.png`, and exits 1.

```bash
node .claude/skills/run-claude-code-toy-marketplace/driver.mjs <<'EOF'
login sentry.local.test@example.com /profile
wait-for Profile information
click role:button:Edit
fill "role:textbox:Sentry Test" Not saved
click role:button:Cancel
ss profile
nav /product/42a9fb43-10e5-489f-be46-9760de0c4366
wait-for Seller information
idle
ss product
login summer.du24650@example.com /messages
wait-for Seller:
idle
ss messages
console
EOF
```

Screenshots go to `/tmp/toy-marketplace-shots/<name>.png` (full page). **Read them after the run.** Override the
output folder with `SHOTS_DIR`, and the app/API URLs with `APP_URL` / `SUPABASE_URL`.

| command | what it does |
|---|---|
| `login <email> [path]` | Log in as an existing local account and open `path` (default `/`). Refuses unknown emails. |
| `nav <path>` | Go to an in-app path (`/profile`, `/product/<id>`, `/messages`, `/conversation/<id>`) or a full URL |
| `wait-for <text>` | Wait up to 15 s for visible text. Use it after every `login`/`nav`. |
| `idle` | Wait for network idle and for every `<img>` to finish. Use it before `ss` on pages with photos. |
| `click <sel>` / `fill <sel> <text>` / `press <key>` | Interact with the page |
| `text <sel>` | Print an element's text to stdout |
| `ss [name]` | Take a full-page screenshot |
| `console` | Print browser console errors collected so far |

Selectors: `role:<role>:<accessible name>` (exact name), `text:<exact text>`, or any CSS/Playwright selector.
**Quote a selector that contains spaces**: `"role:textbox:Sentry Test"`. Lines starting with `#` are comments.

To find accounts and ids to use:

```bash
docker exec -i supabase_db_aonhrhzuntjkskglqdwv psql -U postgres -d postgres -Atc "select email, coalesce(nickname,'') from profiles order by created_at"
docker exec -i supabase_db_aonhrhzuntjkskglqdwv psql -U postgres -d postgres -Atc "select c.id, ps.email seller, pb.email buyer from conversations c join products p on p.id=c.product_id join profiles ps on ps.user_id=p.user_id join participants pa on pa.conversation_id=c.id and pa.user_id<>p.user_id join profiles pb on pb.user_id=pa.user_id"
```

## Run (human path)

Open http://localhost:8080/claude_code_toy_marketplace_by_echo/ in a browser and sign in normally.

## Test / lint

There is no test suite. `npm run lint` has pre-existing errors on master (see CLAUDE.md), so lint only what you changed:

```bash
npx eslint .claude/skills/run-claude-code-toy-marketplace/driver.mjs
```

## Gotchas

- **The driver acts on real local data. Undo what you change.** Saving a nickname writes to `profiles`.
  **Opening a `/conversation/<id>` page marks its messages as read** for the logged-in user, and that can't be undone.
  To check chat names without side effects, stay on the `/messages` list.
- **`generate_link` with `type: magiclink` creates an account for an unknown email.** That's why `login` checks
  `profiles` first. Never generate links by hand for emails that don't exist.
- **The magic-link redirect goes to `http://127.0.0.1:3000`** (Supabase's default `site_url`; `supabase/config.toml`
  has no `[auth]` section). Nothing listens there, so the driver moves the `#access_token=…` fragment onto the app URL.
  supabase-js picks the session up from the hash on any route.
- **Pages show `Loading...` first.** `/profile` and `/messages` fetch after auth resolves, so always `wait-for` real
  content before acting.
- **Text appears before images.** Product photos load from Supabase Storage after the text renders. Without `idle`,
  screenshots show a blank photo area.
- **A logged-out visit to `/profile` redirects to `/auth`.** A `wait-for Profile information` then times out. Use `login`.
- **The nickname input's accessible name is its placeholder** (the user's full name), e.g. `"role:textbox:Sentry Test"`.

## Troubleshooting

- **`FAILED: no existing account for x@example.com; refusing to create one`**: the email isn't in `profiles`.
  Pick one from the account query above.
- **`FAILED: locator.waitFor: Timeout 15000ms exceeded.`**: wrong page or not logged in. Read `/tmp/toy-marketplace-shots/failure.png`.
- **`FAILED: locator.innerText: Timeout …` on a selector with a space**: the selector wasn't quoted, so only its first
  word was used as the selector.
