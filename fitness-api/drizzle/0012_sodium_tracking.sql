CREATE TABLE IF NOT EXISTS sodium_entries (
  id serial PRIMARY KEY NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO nutrition_goals (metric, amount)
VALUES ('sodium', 2300)
ON CONFLICT (metric) DO NOTHING;
