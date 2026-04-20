# fitness

Calorie tracking app with:

- Vue 3 + Vite frontend in `fitness-web/`
- Node + Hono API in `fitness-api/`
- Vercel function adapter in `api/`
- Postgres via Neon

This repo is set up for one Vercel project. The frontend is deployed as static assets and the backend is exposed from `/api/*`.

## Repo Layout

```text
.
├── api/                  # Vercel function entrypoint
├── fitness-api/          # Real backend code
│   ├── drizzle/          # SQL migrations
│   └── src/
│       ├── app.ts        # API routes
│       ├── db/           # DB client, schema, migration runner
│       ├── lib/          # Shared backend helpers
│       ├── seed.ts       # Dev/sample data seeding
│       └── server.ts     # Local API server
├── fitness-web/          # Vue frontend
├── vercel.json           # Vercel project config
└── package.json          # Workspace scripts
```

## First-Time Setup

1. Install dependencies:

```bash
npm install
```

2. Create the backend env file:

```bash
cp fitness-api/.env.example fitness-api/.env
```

3. Fill in `fitness-api/.env`:

```env
DATABASE_URL=postgresql://...
APP_TIMEZONE=America/Chicago
CALORIE_UNLOCK_SCHEDULE=09:00=0.25,12:00=0.25,17:00=0.25,21:00=0.25
CALORIE_UNLOCK_FALLBACK_GOAL=2000
GOAL_WEIGHT=189.0
GMAIL_ALERT_ADDRESS=
GMAIL_ALERT_APP_PASSWORD=
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

4. The frontend already defaults to same-origin `/api`. For local dev it proxies to the backend through Vite.

## Daily Commands

From the repo root:

```bash
npm run dev        # frontend + backend together
npm run dev:web    # frontend only
npm run dev:api    # backend only
npm run test       # API tests
npm run build      # full verification build
npm run build:web  # frontend build only
npm run build:api  # backend typecheck/build only
```

Local URLs:

- Frontend: `http://localhost:5173`
- API: `http://localhost:3000`
- Frontend calls API at `/api`, proxied by Vite during local dev

## Database Workflow

### Run migrations

```bash
npm run db:migrate
```

This applies SQL files in `fitness-api/drizzle/` to the database in `DATABASE_URL`.

### Seed sample data

```bash
npm run db:seed
```

### Reset a recent baseline window

If you want to normalize the recent trend data used by TDEE and unlock calculations, run:

```bash
npm run db:set-baseline --workspace fitness-api -- --days 30 --weight 205 --calories 2500
```

Notes:

- This uses `DATABASE_URL` from `fitness-api/.env`
- The window ends on today in `APP_TIMEZONE` unless you pass `--end-date YYYY-MM-DD`
- Weight entries in the window are upserted to the fixed weight
- Calorie entries in the window are replaced with one fixed calorie entry per day at local noon

Example for a future reset once your scale is back:

```bash
npm run db:set-baseline --workspace fitness-api -- --days 30 --weight 198.4 --calories 2400
```

### Change the schema

When changing the database shape:

1. Update `fitness-api/src/db/schema.ts`
2. Generate a migration:

```bash
npm run db:generate
```

3. Review the generated SQL in `fitness-api/drizzle/`
4. Run it locally:

```bash
npm run db:migrate
```

5. Update any affected route logic in `fitness-api/src/app.ts`
6. Update tests in `fitness-api/src/app.test.ts`
7. Update frontend types/API usage if the API contract changed

Important:

- Do not change the schema without adding a migration
- Treat the checked-in SQL as the source of truth for deployed databases

## API Workflow

Primary backend files:

- `fitness-api/src/app.ts`
- `fitness-api/src/db/schema.ts`
- `fitness-api/src/lib/time.ts`
- `api/route.ts`

When changing API behavior:

1. Update route logic in `fitness-api/src/app.ts`
2. Update or add tests in `fitness-api/src/app.test.ts`
3. If request/response shapes changed, update frontend files:
   - `fitness-web/src/services/api.ts`
   - `fitness-web/src/types.ts`
   - any affected store/component code
4. Run:

```bash
npm run test
npm run build
```

Notes:

- `/api/route.ts` is a thin Vercel adapter only
- `vercel.json` rewrites `/api/:path*` into that concrete Vercel function so nested API paths work in production
- Real API logic belongs in `fitness-api/`, not in `api/`
- Keep the Vercel adapter simple so the backend stays portable

## Frontend Workflow

Primary frontend files:

- `fitness-web/src/services/api.ts`
- `fitness-web/src/types.ts`
- `fitness-web/src/stores/*`
- `fitness-web/src/components/*`

When changing frontend behavior:

1. Update the relevant component/store/type
2. If the API contract changes, update backend and frontend together
3. Run:

```bash
npm run build:web
```

## Deploy Workflow

Production uses:

- Vercel for app hosting
- Neon for Postgres

### Required Vercel env vars

- `DATABASE_URL`
- `APP_TIMEZONE=America/Chicago`

Usually you do not need:

- `CALORIE_UNLOCK_SCHEDULE`
- `CALORIE_UNLOCK_FALLBACK_GOAL`
- `GOAL_WEIGHT`
- `GMAIL_ALERT_ADDRESS`
- `GMAIL_ALERT_APP_PASSWORD`
- `VITE_API_BASE_URL`
- `CORS_ORIGIN`

Production uses same-origin `/api` and ignores `VITE_API_BASE_URL` on purpose. Keep that env var for local-only overrides.

### Deploy on push

1. Commit changes
2. Push to `main`
3. Vercel builds from the repo root
4. Vercel serves the frontend from `fitness-web/dist`
5. Vercel serves the API from `api/`

Vercel project settings:

- Root Directory: `/`
- Framework Preset: `Other`
- Install Command: `npm install`
- Build Command: `npm run build:web`
- Output Directory: `fitness-web/dist`

### After schema changes in production

Pushing code is not enough if the DB changed. You also need to run:

```bash
DATABASE_URL=postgresql://... npm run db:migrate
```

against the deployed Neon database.

## Common Change Recipes

### Add a new API field

1. Update DB schema if needed
2. Add migration
3. Update backend route serialization
4. Update frontend types
5. Update frontend rendering
6. Run tests/build

### Add a new endpoint

1. Add the route in `fitness-api/src/app.ts`
2. Add request validation with Zod
3. Add tests in `fitness-api/src/app.test.ts`
4. Add frontend client calls in `fitness-web/src/services/api.ts`
5. Update consuming store/component

### Debug deployed 500s

1. Check `/api/health`
2. Check Vercel function logs
3. Confirm `DATABASE_URL` exists in Vercel
4. Confirm the correct Neon DB has been migrated
5. Verify local and Vercel are using the same schema

## Agent Notes

Use this section as the fast-start brief for future agents:

- This is a workspace repo rooted here, not inside `fitness-web/`
- Do not recreate `fitness-server/`; the Rust backend is gone
- Keep Vercel-specific code in `api/` and business logic in `fitness-api/`
- Prefer preserving the current API contract unless the task explicitly changes it
- If the DB schema changes, always add a migration and update tests
- Before declaring deploy issues fixed, run `npm run build`
- Local backend config lives in `fitness-api/.env`
- Production backend config lives in Vercel env vars

## References

- Deployment checklist: `DEPLOY.md`
- Frontend API notes: `fitness-web/API.md`
