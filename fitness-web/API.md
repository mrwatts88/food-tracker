# Frontend API Notes

The main developer workflow now lives in the root [README.md](../README.md).

This file only covers frontend-specific API behavior.

## Base URL

The frontend defaults to same-origin `/api`.

For local development, Vite proxies `/api` to the backend server.

In production, the frontend always uses same-origin `/api`. `VITE_API_BASE_URL` is only for local or special non-production overrides.

If you need to override this:

```env
VITE_API_BASE_URL=https://your-api.example.com/api
```

If your local backend is not on port `3000`:

```env
VITE_API_PROXY_TARGET=http://localhost:4000
```

## Frontend API Entry Point

API calls live in:

- `src/services/api.ts`

Shared response/request types live in:

- `src/types.ts`

## Current Endpoints Used By The Frontend

- `GET /api/health`
- `GET /api/calories`
- `GET /api/calories/unlock-status`
- `POST /api/calories`
- `DELETE /api/calories/:id`
- `GET /api/protein`
- `POST /api/protein`
- `DELETE /api/protein/:id`
- `GET /api/sugar`
- `POST /api/sugar`
- `DELETE /api/sugar/:id`
- `GET /api/caffeine`
- `POST /api/caffeine`
- `DELETE /api/caffeine/:id`
- `GET /api/nutrition/goals`
- `GET /api/weight`
- `POST /api/weight`
- `DELETE /api/weight/:date`
- `GET /api/tdee`

## Calorie Unlock Status

`GET /api/calories/unlock-status` returns the current unlock pacing snapshot for the calorie screen.

Response fields:

- `dailyTargetCalories`
- `consumedCalories`
- `unlockedCalories`
- `availableCalories`
- `overdrawCalories`
- `nextUnlockAt`
- `nextScheduledUnlockCalories`
- `nextEffectiveUnlockCalories`
- `allCaloriesUnlockedToday`
- `noBorrowUnlockStreak`
- `timezone`
- `serverNow`

`GET /api/tdee` also returns:

- `goalWeight`
- `calorieDeficit`
