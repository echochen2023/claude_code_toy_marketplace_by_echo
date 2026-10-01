---
name: supabase
description: REQUIRED for all database work - migrations, RPC functions, schema changes, table queries, RLS policies. Always invoke before any Supabase-related task.
---

## WHEN TO USE THIS SKILL

**CRITICAL: Reference this skill whenever you:**
- Create or modify database migrations
- Create, update, or query RPC functions
- Make any schema changes (tables, columns, indexes, constraints)
- Query Supabase database (direct queries or via client)
- Work with Row-Level Security (RLS) policies
- Deploy to local or remote Supabase
- Troubleshoot Supabase connection or permission issues

**If the task involves ANY database work, reference this skill FIRST.**

## Development Environment Setup
- Always verify whether to work on remote or local Supabase server for each new session
- For local development: ensure Docker daemon is running, then `supabase start`
- Keep Supabase CLI updated: `brew upgrade supabase` on macOS
- Local server runs at http://localhost:54323

## Migration Best Practices
- NEVER execute direct SQL commands to modify tables
- ALWAYS create migration files first under `supabase/migrations/` for version control
- Use `npx supabase migration new descriptive_name` to create new migrations
- Apply new migrations incrementally with `npx supabase migration up --local` — it runs only the
  pending files and records them in `supabase_migrations.schema_migrations`, keeping existing data
- Do NOT run `supabase db reset` (or `supabase stop --no-backup`) on the local stack: the local DB holds
  registered test accounts, listings and chats that cannot be recreated (`auth.users` rows can't be
  seeded, so `seed.sql` is empty). Only reset if the user explicitly asks for it in that session
- Because migrations are applied on top of existing data, write them to be safe for that: e.g. a new
  NOT NULL column needs a DEFAULT or a backfill, and new constraints must hold for existing rows
- Treat migration files as immutable once applied: to change something, add a new migration rather than
  editing an applied file (`migration up` won't re-run an edited file)
- Avoid applying migration SQL directly with `psql`/`docker exec`; it bypasses the history table, so a later
  `migration up` would try to re-apply it. If you had to, record it afterwards:
  `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('<timestamp>', '<name>');`
- Migration naming: Use descriptive snake_case names (e.g., `add_nickname_to_profiles`, `update_rpcs_use_nickname`)
- Test migrations locally before pushing to remote

## Database Access Patterns
- ALWAYS look up existing RPC functions in `supabase/migrations/` before creating new functionality
- If no suitable RPC exists, create a new RPC function instead of direct table queries
- Direct table queries often result in RLS permission issues - use RPC functions to bypass
- RPC functions should use SECURITY DEFINER for cross-table queries
- Grant appropriate permissions: `GRANT EXECUTE ON FUNCTION function_name TO anon, authenticated;`

## RPC Function Development
- Check existing patterns in `supabase/migrations/00000000_consolidated_migration.sql`
- Use `DROP FUNCTION IF EXISTS` before `CREATE FUNCTION` in migrations
- Always specify LANGUAGE, SECURITY level, and search_path
- Return TABLE for query results, not individual types
- Test RPC functions after migration: `SELECT * FROM function_name(params);`

## TypeScript Type Generation
- After schema changes, ALWAYS regenerate types:
  ```bash
  # Local
  npx supabase gen types typescript --local > src/integrations/supabase/types.ts

  # Remote
  npx supabase gen types typescript --project-id $PROJECT_REF > src/integrations/supabase/types.ts
  ```

## Credential Management
- Store credentials appropriately:
  - `clients.ts`: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
  - `.mcp.json`: PROJECT_REF, SUPABASE_ACCESS_TOKEN
  - `config.toml`: PROJECT_ID
- Get anon key via: `supabase status --output json`

## Local Development Workflow
```bash
supabase logout
supabase login
supabase start
npx supabase migration up --local   # Applies only pending migrations; existing data is kept
```

## Remote Deployment Workflow
```bash
supabase logout
supabase login
SUPABASE_PROJECT_REF=aonhrhzuntjkskglqdwv
supabase link --debug --project-ref $SUPABASE_PROJECT_REF
supabase db push        # Push migrations to production
```

## Verification Steps After Changes
```bash
# Check migration status
supabase migration list

# Connect to local database
psql postgresql://postgres:postgres@localhost:54322/postgres

# Verify schema changes
\d table_name

# Test RPC functions
SELECT * FROM rpc_function_name();
```

## Common Pitfalls to Avoid
- ❌ Don't modify tables directly via SQL console
- ❌ Don't forget to regenerate TypeScript types after schema changes
- ❌ Don't use direct table queries when RLS is involved
- ❌ Don't skip testing migrations locally before remote push
- ❌ Don't run `supabase db reset` locally — it wipes registered accounts and test data
- ✅ Always use migrations for version control
- ✅ Always use RPC functions for complex queries
- ✅ Always test locally first

## Authentication Setup
- Google Auth Provider should be enabled via Authentication > Sign in / Providers

## Local Testing with Gmail Auth
- Run web server with: `npm run dev -- --host 0.0.0.0`

## Cleanup Operations
- Clean local Docker volumes: `docker volume ls --filter label=com.supabase.cli.project=orangebox-insider-marketplace`