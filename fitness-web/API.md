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
- `GET /api/carbs`
- `POST /api/carbs`
- `DELETE /api/carbs/:id`
- `GET /api/sodium`
- `POST /api/sodium`
- `DELETE /api/sodium/:id`
- `GET /api/fiber`
- `POST /api/fiber`
- `DELETE /api/fiber/:id`
- `GET /api/nutrition/goals`
- `GET /api/nutrition/insights`
- `GET /api/daily-goals/status`
- `GET /api/config`
- `PUT /api/config/:metric`
- `GET /api/weight`
- `POST /api/weight`
- `DELETE /api/weight/:date`
- `GET /api/tdee`

## Nutrition Insights

`GET /api/nutrition/insights` compares each macro's average over the prior 7 days with its goal and says what today needs. Only days with a calorie entry count, the same rule the daily goal streak uses. Today's live totals are left to the client.

Response fields:

- `windowDays`: always 7
- `daysLogged`: logged days in the window
- `metrics[]`, in label order (sodium, carbs, fiber, sugar, protein, caffeine):
  - `metric`
  - `kind`: `floor` (protein, fiber: reach at least the goal) or `ceiling` (stay under it)
  - `goal`: `null` when the goal is 0
  - `average`: rounded daily average, `null` with no logged days
  - `todayTarget`: today's amount that puts tomorrow's 7-day average on the goal; the goal itself when already on track. Clamped to 0 for ceilings and to twice the goal for floors.
  - `capped`: the target was clamped and cannot fully close the gap today
  - `status`: `more`, `less`, `on-track`, `no-goal` or `no-data`

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
- `calorieTarget` (`null` when the target is weight-derived)

## Manual Calorie Target

Set `calorie_target` through `PUT /api/config/calorie_target` with an integer `amount`. A positive
value overrides the weight-derived daily calorie target. Set it to `0` to return to automatic
weight-based calculation.
