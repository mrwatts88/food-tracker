CREATE TABLE IF NOT EXISTS carbs_entries (
  id serial PRIMARY KEY NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO nutrition_goals (metric, amount)
VALUES ('carbs', 200)
ON CONFLICT (metric) DO NOTHING;
