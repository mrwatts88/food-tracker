CREATE TABLE IF NOT EXISTS calorie_entries (
  id serial PRIMARY KEY NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weight_entries (
  created_at date PRIMARY KEY NOT NULL,
  amount double precision NOT NULL
);

CREATE TABLE IF NOT EXISTS quick_add_foods (
  id serial PRIMARY KEY NOT NULL,
  name text NOT NULL,
  unit text NOT NULL,
  amount double precision NOT NULL,
  calories integer NOT NULL,
  fat_grams double precision NOT NULL,
  carbs_grams double precision NOT NULL,
  protein_grams double precision NOT NULL,
  sugar_grams double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
