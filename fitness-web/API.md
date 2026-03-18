# API Setup

The app now targets the real Node API by default.

## Local Development

From the workspace root:

```bash
npm install
npm run dev:api
```

The API listens on `http://localhost:3000`.

In another terminal:

```bash
npm run dev:web
```

The Vue app runs on `http://localhost:5173` and proxies `/api` requests to the local API server.

You can also run both together with:

```bash
npm run dev
```

## API Base URL

The frontend defaults to same-origin `/api`.

For a custom backend URL, set:

```env
VITE_API_BASE_URL=https://your-api.example.com/api
```

If your local API is not on port `3000`, set:

```env
VITE_API_PROXY_TARGET=http://localhost:4000
```

## Endpoints

- `GET /api/health`
- `GET /api/calories`
- `POST /api/calories`
- `DELETE /api/calories/:id`
- `GET /api/weight`
- `POST /api/weight`
- `DELETE /api/weight/:date`
- `GET /api/tdee`
- `GET /api/quickadd`
- `POST /api/quickadd`
- `PUT /api/quickadd/:id`
- `DELETE /api/quickadd/:id`
- `POST /api/quickadd/:id/consume`

## Database Scripts

From the workspace root:

```bash
npm run db:migrate
npm run db:seed
```

These use the `DATABASE_URL` configured for `fitness-api`.
