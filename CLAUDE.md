# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A toy second-hand marketplace: Vite + React 18 + TypeScript SPA (shadcn/ui + Tailwind) backed entirely by Supabase (Postgres, Auth, Storage, Realtime). There is no custom backend server and no test suite.

## Skills Usage Priority

**CRITICAL**: Before starting ANY task, check if a skill is relevant and invoke it IMMEDIATELY as the first action.

### Workflow
```
User request → Identify skills needed → Invoke skill(s) FIRST → Follow skill instructions
```

NOT:
```
User request → Start planning/exploring → Mention skill later ❌
```

If unsure whether a skill applies, invoke it anyway - the skill will provide specialized guidance.

## Commands

Requires Node >= 18.18 for the app itself, but `.nvmrc` pins 22 because the Claude Code hooks below need Node >= 22.18. Run `nvm use` **before launching Claude Code** — the shell default may be older (`npm install` crashes on it, and the hooks inherit Claude's Node).

```bash
npm run dev         # Vite dev server on port 8080
npm run build       # production build
npm run build:dev   # development-mode build
npm run lint        # eslint .
npm run preview     # serve the built bundle
npm run deploy      # build (predeploy) then publish dist/ to the gh-pages branch via the `gh-pages` package
```

Local Supabase (the CLI is a devDependency in `package.json`, not a global install — always invoke it via `npx`; see `README_Supabase.md`):

```bash
npx supabase start                    # local API on http://127.0.0.1:54321, Studio on :54323
npx supabase status                   # print URLs/keys for the already-running local stack
npx supabase migration new <name>     # create a new migration, edit the SQL, then apply it with the next line
npx supabase migration up --local     # apply only pending migrations; existing local data is kept
npx supabase migration list --local   # check which migrations the local DB has recorded as applied
npx supabase link --project-ref $SUPABASE_PROJECT_REF && npx supabase db push   # deploy migrations to the remote project
```

**Don't run `npx supabase db reset` on the local stack** unless the user explicitly asks for it: it drops the database and re-runs every migration from scratch, wiping the registered test accounts, listings and chats, which can't be recreated (`seed.sql` is empty because `auth.users` rows can't be pre-seeded). Since migrations are applied on top of existing data, write them to work against it (e.g. a new `NOT NULL` column needs a `DEFAULT` or backfill), and don't edit a migration file that has already been applied — `migration up` won't re-run it, so add a new migration instead.

`npx supabase start` (backed by Docker) is what created the running `supabase_*_<project_id>` containers in the first place — it's the only reliable way to recreate that whole stack (Postgres + Auth + REST + Storage + Realtime + Kong) if the containers are ever deleted; a plain Postgres client/server (e.g. Postgres.app, pgAdmin) can't substitute since this project relies on Supabase's own Postgres image (`auth`/`storage`/`realtime` schemas baked in) and its other services, not just a bare database.

If `node_modules` isn't installed yet (so `npx supabase` isn't available) but the local stack is already running as plain Docker containers (check with `docker ps`, look for `supabase_db_<project_id>` etc., where `<project_id>` is `supabase/config.toml`'s `project_id`), you can still apply a migration directly against Postgres without the CLI:

```bash
docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/<file>.sql
```

This bypasses the CLI's migration history table, so afterwards record the file as applied — otherwise a later `migration up` tries to re-run it and fails:

```bash
docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -c "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('<timestamp>', '<name>');"
```

Port `54322` is the direct Postgres port (`54321` is the Kong API gateway that `client.ts` talks to, `54323` is Studio) — these are the Supabase CLI's standard local-dev port assignments and aren't configured anywhere in this repo.

The project slash commands `/run_project` and `/stop_project` (`.claude/commands/`) wrap the above: start Docker-backed Supabase + the dev server in the background, and tear both down again (`npx supabase stop` keeps local data; never pass `--no-backup`).

## Claude Code hooks

`.claude/settings.json` wires up five project hooks. Apart from the `UserPromptSubmit` one-liner, they are TypeScript files in `.claude/hooks/` executed as `node <file>.ts`:

- **UserPromptSubmit → `echo`**: injects "MUST check whether there are relevant skills to use first." into Claude's context on every prompt (stdout of a `UserPromptSubmit` hook becomes extra context; it isn't shown in the terminal).
- **PreToolUse (Bash) → `lint_hook.ts`**: if the command is a `git commit` (also matched through global options like `git -C <dir> commit`), it runs `npx eslint` on the *staged* JS/TS files only and denies the commit if they fail. Pre-existing lint errors in files you didn't stage don't block. Every other Bash command passes through.
- **PostToolUse (Edit/Write) → `test_runner_hook.ts`**: after an edit to a `src/**/*.{ts,tsx,js,jsx}` file it looks for a test script or test files. There's no test suite, so in practice it just reports "no tests found".
- **PostToolUse (Skill) → `skill_usage_hook.ts`**: whenever Claude actually invokes a skill, appends the skill name, session id and the triggering user prompt (read from the transcript) to `.claude/hooks/skill_usage.log`. Prompts that use no skill log nothing.
- **Notification → `notification_hook.ts`**: plays an mp3 with macOS `afplay` when Claude is waiting for input.

Running `.ts` directly needs Node ≥ 22.18 (or ≥ 23.6), which have type-stripping on by default — hence `.nvmrc` = 22. If Claude Code was started under an older Node, the hooks crash with `ERR_UNKNOWN_FILE_EXTENSION`; Claude Code treats that as a non-blocking error, so **the commit lint gate silently does nothing**. Check with `node --version` and restart Claude after `nvm use` if needed. The hooks write debug logs to `.claude/hooks/*_debug.log`, plus `skill_usage.log` (all git-ignored via `*.log`). `eslint .` also lints the hook files, so they count toward the `npm run lint` baseline below.

## Architecture

**Environment switching is by hostname.** `src/integrations/supabase/client.ts` picks the local Supabase URL/anon key when `window.location.hostname` is `localhost`/`127.0.0.1`, and the hosted project otherwise. The Supabase side has no `.env` files — the URL/key are hardcoded per-branch in `client.ts`. The Supabase project ref also appears in `supabase/config.toml` (`project_id`) and in a local, git-ignored `.mcp.json` (copy from `.mcp.json.example[.mac|.windows]`). A git-ignored `.env` at the repo root is used only for `VITE_SENTRY_DSN` (see Error monitoring below); it must exist on every machine that builds/deploys if Sentry should be active there, since Vite inlines `VITE_*` vars at build time and there is no CI pipeline to inject them.

**Deployed as a subpath.** `vite.config.ts` sets `base: '/claude_code_toy_marketplace_by_echo/'` (GitHub Pages, `gh-pages` is a dev dependency). `App.tsx` passes `basename={import.meta.env.BASE_URL}` to `BrowserRouter`, so in-app routes stay `/...`, but anything that bypasses the router (`window.location`, `<a href>`, Supabase `redirectTo`) must prefix `import.meta.env.BASE_URL` itself (it already ends with `/`). GitHub Pages has no SPA fallback, so the `postbuild` / `postbuild:dev` scripts run `scripts/copy404.mjs`, which copies `dist/index.html` to `dist/404.html` so deep links and refreshes still load the app (Pages serves it with a 404 status, which is harmless for browsers).

**Data access goes through Postgres RPC functions, not table queries.** RLS on the tables makes cross-table joins from the client return nothing, so reads are implemented as `SECURITY DEFINER`-style functions in `supabase/migrations/` (defined in the consolidated baseline, but later migrations redefine some — e.g. `get_user_saved_products`, `toggle_saved_product`, `get_public_product_detail` — so the live definition is in the newest file that mentions it; grep the whole directory) and called with `supabase.rpc(...)` from hooks (`src/hooks/use*.tsx`) and pages. Examples: `get_public_products`, `get_public_product_detail`, `get_user_conversations`, `get_conversation_details`, `get_conversation_messages_with_read_status`, `create_conversation`, `toggle_saved_product`. Before adding a query, check the migrations for an existing RPC to reuse; if you need new data, add an RPC in a new migration rather than joining tables client-side. (Direct table access is used only for simple own-row writes, e.g. products and product image rows in `CreateListingForm.tsx`.)

**Generated types lag behind the DB.** `src/integrations/supabase/types.ts` (and `client.ts`) are auto-generated ("do not edit directly"). RPCs added or changed later are not always reflected, which is why `ConversationDetail.tsx` casts the whole client with `(supabase as any).rpc(...)`. Prefer a narrower fix when only a return column is missing: keep `supabase.rpc(...)` typed as-is and cast just the row, e.g. `productData[0] as typeof productData[0] & { new_field: T }` (see `ProductDetail.tsx`) — `@typescript-eslint/no-explicit-any` is *not* disabled in this repo (only `no-unused-vars` is, see below), so a blanket `any` cast is a real `npm run lint` error, not just noise. Regenerate types after schema changes rather than hand-editing.

**Migrations.** `00000000_consolidated_migration.sql` is the squashed baseline (tables: `profiles`, `products`, `product_images`, `conversations`, `participants`, `messages`, `message_status`, `saved_products`; storage bucket `product-images`; triggers such as `handle_new_user` creating a profile on signup and `bump_conversation_on_message`). Later changes are separate timestamped files. `seed.sql` is effectively empty because `auth.users` rows can't be pre-seeded. Postgres won't let `CREATE OR REPLACE FUNCTION` change a table-returning function's output columns — adding/removing a column (e.g. the `seller_joined_year` addition to `get_public_product_detail`) requires `DROP FUNCTION` followed by `CREATE FUNCTION` (plus re-issuing its `GRANT EXECUTE`) in the new migration file.

**Realtime.** Two independent uses: `PresenceProvider` (wraps the whole app in `App.tsx`) tracks online users on a single `global-presence` channel and exposes `isUserOnline`; `ConversationDetail.tsx` subscribes to `postgres_changes` on `messages` (the table is added to the `supabase_realtime` publication in the migration).

**Auth.** `useAuth` (in `src/hooks/useAuth.tsx`) is a plain hook, not a context — each caller sets up its own `onAuthStateChange` listener and returns `{ user, session, loading }`. Google OAuth must be enabled in the Supabase dashboard (Authentication → Sign in / Providers).

**Error monitoring & Session Replay (Sentry).** `src/lib/sentry.ts` calls `Sentry.init()` from `main.tsx` before the app renders. It no-ops if `import.meta.env.VITE_SENTRY_DSN` is unset (see the `.env` note above), and otherwise tags `environment` as `development`/`production` using the same hostname check as `client.ts`. `replayIntegration()` is currently configured with `maskAllText`/`maskAllInputs`/`blockAllMedia` all set to `false` — full-fidelity, unmasked recordings — which is fine for this toy project's local testing but would leak real user input if ever pointed at a project with genuine users; revisit before that happens. Content moderation in `CreateListingForm.tsx`'s `handleSubmit` is a working example of the pattern to follow for similar checks: it scans the product fields for banned words, adds one `Sentry.addBreadcrumb({ category: "content-moderation", ... })` per flagged field, then `await Sentry.getReplay()?.flush()` **before** calling `Sentry.captureMessage(...)`. The flush is required because Sentry's buffered-replay auto-upload only triggers for events with an `exception` (i.e. `captureException`/thrown errors) — `captureMessage` events never carry `event.exception`, so without the manual flush they'd never get a Replay attached.

**Routing / UI.** Routes are declared in `src/App.tsx` (add new ones above the `*` catch-all). `/` and `/categories` both render `Categories`; `CreateListingForm` serves both `/create-listing/new` and `/create-listing/edit/:id`. `src/components/ui/` is shadcn/ui output (`components.json`, `@/` alias → `src/`) — add components via the shadcn CLI rather than writing them by hand. Images are resized client-side before upload via `src/lib/imageUtils.ts`. `App.tsx` mounts a TanStack `QueryClientProvider`, but no code uses `useQuery` — hooks fetch with `supabase.rpc` inside `useEffect`/`useState`, so follow that pattern (or migrate deliberately) rather than mixing the two.

TypeScript is intentionally loose (`strict: false`, `strictNullChecks: false`, `noImplicitAny: false`) and ESLint disables `no-unused-vars`. `npm run lint` is not currently clean on `master`: it reports pre-existing errors (mostly `@typescript-eslint/no-explicit-any` at RPC call sites like `ConversationDetail.tsx`/`ConversationList.tsx`/`PresenceProvider.tsx`, plus one `no-require-imports` in `tailwind.config.ts`) and `react-hooks/exhaustive-deps` warnings — don't mistake these for something you broke; only worry about the delta your own change introduces.

## Project conventions (from README_Lovable.md)

- Always look up the existing Supabase RPC functions and reuse them when fetching data.
- When a task touches Supabase tables, consider writing a new RPC function so RLS doesn't silently return empty results on joins.
- Do not commit PII (e.g. email addresses).
- Name files in camel case, e.g. `CreateListingForm.tsx`.

`README_TODO.md` tracks the next planned work (image upload in conversations).
