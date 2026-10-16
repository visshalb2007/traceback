import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: index('users_email_idx').on(table.email),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
