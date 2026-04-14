import { date, doublePrecision, integer, pgTable, serial, timestamp } from 'drizzle-orm/pg-core'

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

export const weightEntries = pgTable('weight_entries', {
  createdAt: date('created_at').primaryKey(),
  amount: doublePrecision('amount').notNull()
})

export const schema = {
  calorieEntries,
  proteinEntries,
  weightEntries
}
