# Deploying On Push

This repo is ready for a single Vercel project plus one Neon Postgres database.

## 1. Create the new git repo

From `/Users/mattwatts/code/fitness`:

```bash
git init
git add .
git commit -m "Initial Node + Vercel rewrite"
git branch -M main
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

## 2. Create the Neon database

In Neon:

1. Create a project.
2. Copy the connection string for the `main` branch.
3. Make sure the connection string includes SSL.

## 3. Run the first migration

Set `DATABASE_URL` locally, then run:

```bash
npm install
npm run db:migrate
```

Optional sample data:

```bash
npm run db:seed
```

## 4. Create the Vercel project

In Vercel:

1. Import the new GitHub repo.
2. Set the project root to the repo root.
3. Vercel should read `vercel.json` automatically.

Expected settings:

- Install Command: `npm install`
- Build Command: `npm run build:web`
- Output Directory: `fitness-web/dist`

## 5. Add Vercel environment variables

Add these to Production and Preview:

- `DATABASE_URL`
  - Use the Neon connection string.
- `APP_TIMEZONE`
  - Set to `America/Chicago`

Optional:

- `CORS_ORIGIN`
  - Leave unset for same-origin Vercel usage.
  - Set this only if you later split frontend and API across origins.

You do not need `VITE_API_BASE_URL` in Vercel unless you want to override the default `/api`.

## 6. Trigger the first deploy

Push to `main`:

```bash
git push
```

Vercel will build the frontend and expose the API from `/api/*`.

## 7. Verify production

Check these URLs:

- `https://<your-domain>/`
- `https://<your-domain>/api/health`

Then verify inside the app:

1. Add a calorie entry.
2. Add a weight entry.
3. Create a quick-add food.
4. Consume the quick-add food.
5. Open stats and confirm TDEE loads.

## Local development

From the repo root:

```bash
npm install
npm run dev
```

That starts:

- API on `http://localhost:3000`
- Vite on `http://localhost:5173`

The frontend proxies `/api` to the local API server.
