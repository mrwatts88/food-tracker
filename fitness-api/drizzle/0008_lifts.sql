CREATE TABLE IF NOT EXISTS lifts (
  slug text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  set_1_weight integer NOT NULL,
  set_2_weight integer NOT NULL,
  set_3_weight integer NOT NULL,
  sort_order integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO lifts (
  slug,
  name,
  description,
  set_1_weight,
  set_2_weight,
  set_3_weight,
  sort_order
)
VALUES
  ('triceps-extension', 'Triceps extension', '3 sets / 12 reps / 1 minute rest / move up if complete', 30, 30, 30, 1),
  ('bicep-curl', 'Bicep curl', '3 sets / 12 reps / 1 minute rest / move up if complete', 25, 25, 25, 2),
  ('delt-raise', 'Delt raise', '3 sets / 12 reps / 1 minute rest / move up if complete', 25, 25, 25, 3),
  ('shoulder-press', 'Shoulder press', '3 sets / 12 reps / 1 minute rest / move up if complete', 45, 45, 45, 4),
  ('chest-press', 'Chest press', '3 sets / 12 reps / 1 minute rest / move up if complete', 60, 60, 60, 5),
  ('lat-pull-down', 'Lat pull down', '3 sets / 12 reps / 1 minute rest / move up if complete', 60, 60, 60, 6),
  ('seated-leg-curl', 'Seated leg curl', '3 sets / 12 reps / 1 minute rest / move up if complete', 65, 65, 65, 7),
  ('leg-extension', 'Leg extension', '3 sets / 12 reps / 1 minute rest / move up if complete', 55, 55, 55, 8),
  ('seated-leg-press', 'Seated leg press', '3 sets / 12 reps / 1 minute rest / move up if complete', 100, 100, 100, 9)
ON CONFLICT (slug) DO NOTHING;
