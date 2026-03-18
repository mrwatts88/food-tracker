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

export const weightEntries = pgTable('weight_entries', {
  createdAt: date('created_at').primaryKey(),
  amount: doublePrecision('amount').notNull()
})

export const quickAddFoods = pgTable('quick_add_foods', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  amount: doublePrecision('amount').notNull(),
  calories: integer('calories').notNull(),
  fatGrams: doublePrecision('fat_grams').notNull(),
  carbsGrams: doublePrecision('carbs_grams').notNull(),
  proteinGrams: doublePrecision('protein_grams').notNull(),
  sugarGrams: doublePrecision('sugar_grams').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const schema = {
  calorieEntries,
  proteinEntries,
  weightEntries,
  quickAddFoods
}
