import { date, doublePrecision, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

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
  weightEntries
}
