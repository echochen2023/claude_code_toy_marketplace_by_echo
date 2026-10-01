### Supabase Credential in the project 
- clients.ts: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
- .mcp.json: PROJECT_REF, SUPABASE_ACCESS_TOKEN
- config.toml; PROJECT_ID

### Supabase Setup
- Google Auth Provider enable.
 - Go to Authentication > Sign in / Providers > 

### Local development
> The Supabase CLI is a devDependency, so run it via `npx`.

#### Start the local stack and apply pending migrations
npx supabase start
npx supabase migration up --local
> http://localhost:54323
> This is the local supabase server for your to invoke API against
> `migration up` only applies migrations that haven't run yet, so registered accounts and test data are kept.

#### Add new migrations
npx supabase migration new xxxxx_table
> update the sql in the xxxxx_table
npx supabase migration up --local
> Don't edit a migration that has already been applied; add a new one instead.

#### ⚠️ Don't use `supabase db reset` locally
> It drops the local database and re-runs every migration from scratch, deleting all registered accounts,
> listings and chats. They can't be restored (`seed.sql` can't create `auth.users` rows).
> Only run it if you really want to start over with an empty database.

#### Deploy to remote project 
supabase logout
supabase login
SUPABASE_PROJECT_REF=XXXXX
supabase link --debug --project-ref $SUPABASE_PROJECT_REF
supabase db push
