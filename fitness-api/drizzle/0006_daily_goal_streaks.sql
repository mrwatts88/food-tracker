CREATE TABLE IF NOT EXISTS daily_goal_days (
  local_date date PRIMARY KEY NOT NULL,
  calorie_total integer NOT NULL DEFAULT 0,
  protein_total integer NOT NULL DEFAULT 0,
  sugar_total integer NOT NULL DEFAULT 0,
  caffeine_total integer NOT NULL DEFAULT 0,
  calorie_goal integer NOT NULL,
  protein_goal integer NOT NULL,
  sugar_goal integer NOT NULL,
  caffeine_goal integer NOT NULL,
  successful boolean,
  evaluated_at timestamptz
);

CREATE TABLE IF NOT EXISTS daily_goal_streak_state (
  id integer PRIMARY KEY NOT NULL DEFAULT 1,
  current_streak integer NOT NULL DEFAULT 0,
  last_evaluated_date date,
  last_break_date date,
  CONSTRAINT daily_goal_streak_state_singleton CHECK (id = 1)
);
