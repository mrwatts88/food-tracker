import { boolean, date, doublePrecision, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const calorieEntries = pgTable('calorie_entries', {
  id: serial('id').primaryKey(),
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const proteinEntries = pgTable('protein_entries', {
  id: serial('id').primaryKey(),
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const sugarEntries = pgTable('sugar_entries', {
  id: serial('id').primaryKey(),
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const caffeineEntries = pgTable('caffeine_entries', {
  id: serial('id').primaryKey(),
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const entryDividers = pgTable('entry_dividers', {
  id: serial('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const nutritionGoals = pgTable('nutrition_goals', {
  metric: text('metric').primaryKey(),
  amount: integer('amount').notNull()
})

export const dailyGoalDays = pgTable('daily_goal_days', {
  localDate: date('local_date').primaryKey(),
  calorieTotal: integer('calorie_total').notNull().default(0),
  proteinTotal: integer('protein_total').notNull().default(0),
  sugarTotal: integer('sugar_total').notNull().default(0),
  caffeineTotal: integer('caffeine_total').notNull().default(0),
  calorieGoal: integer('calorie_goal').notNull(),
  proteinGoal: integer('protein_goal').notNull(),
  sugarGoal: integer('sugar_goal').notNull(),
  caffeineGoal: integer('caffeine_goal').notNull(),
  successful: boolean('successful'),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true })
})

export const dailyGoalStreakState = pgTable('daily_goal_streak_state', {
  id: integer('id').primaryKey().default(1),
  currentStreak: integer('current_streak').notNull().default(0),
  lastEvaluatedDate: date('last_evaluated_date'),
  lastBreakDate: date('last_break_date')
})

export const weightEntries = pgTable('weight_entries', {
  createdAt: date('created_at').primaryKey(),
  amount: doublePrecision('amount').notNull()
})

export const schema = {
  calorieEntries,
  proteinEntries,
  sugarEntries,
  caffeineEntries,
  entryDividers,
  nutritionGoals,
  dailyGoalDays,
  dailyGoalStreakState,
  weightEntries
}
