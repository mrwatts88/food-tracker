CREATE TABLE IF NOT EXISTS sugar_entries (
  id serial PRIMARY KEY NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS caffeine_entries (
  id serial PRIMARY KEY NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
