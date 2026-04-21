CREATE TABLE IF NOT EXISTS entry_dividers (
  id serial PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
