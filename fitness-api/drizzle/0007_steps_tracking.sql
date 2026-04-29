CREATE TABLE IF NOT EXISTS steps_entries (
  id serial PRIMARY KEY NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nutrition_goals (
  metric text PRIMARY KEY NOT NULL,
  amount integer NOT NULL
);

ALTER TABLE daily_goal_days
  ADD COLUMN IF NOT EXISTS steps_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS steps_goal integer NOT NULL DEFAULT 7000;

INSERT INTO nutrition_goals (metric, amount)
VALUES ('steps', 7000)
ON CONFLICT (metric) DO NOTHING;
