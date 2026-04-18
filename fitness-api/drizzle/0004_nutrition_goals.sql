CREATE TABLE IF NOT EXISTS nutrition_goals (
  metric text PRIMARY KEY NOT NULL,
  amount integer NOT NULL
);

INSERT INTO nutrition_goals (metric, amount)
VALUES
  ('protein', 100),
  ('sugar', 80),
  ('caffeine', 280),
  ('calorie_deficit', 250)
ON CONFLICT (metric) DO NOTHING;
