CREATE TABLE IF NOT EXISTS protein_entries (
  id serial PRIMARY KEY NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
