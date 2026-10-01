// Drizzle table definitions used to build queries.
//
// The SQL migrations in ./migrations are the source of truth for the physical schema
// (STRICT tables, CHECK constraints, partial unique indexes — see DATABASE_SCHEMA.md §5).
// This file mirrors table and column names (db.test.js fails if they drift) plus
// column defaults, which Drizzle needs or it inserts explicit NULLs.

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  emailVerifiedAt: text('email_verified_at'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const loginMethods = sqliteTable('login_methods', {
  id: integer('id').primaryKey(),
  userId: integer('user_id').notNull(),
  type: text('type').notNull(),
  passwordHash: text('password_hash'),
  providerSubject: text('provider_subject'),
  createdAt: text('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  expiresAt: text('expires_at').notNull(),
});

export const groups = sqliteTable('groups', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdByUserId: integer('created_by_user_id').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const memberships = sqliteTable('memberships', {
  id: integer('id').primaryKey(),
  groupId: integer('group_id').notNull(),
  userId: integer('user_id').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('active'),
  joinedAt: text('joined_at').notNull(),
  endedAt: text('ended_at'),
  endedByMembershipId: integer('ended_by_membership_id'),
});

export const expenses = sqliteTable('expenses', {
  id: integer('id').primaryKey(),
  groupId: integer('group_id').notNull(),
  payerMembershipId: integer('payer_membership_id').notNull(),
  createdByMembershipId: integer('created_by_membership_id').notNull(),
  description: text('description').notNull(),
  notes: text('notes'),
  amountPaise: integer('amount_paise').notNull(),
  expenseDate: text('expense_date').notNull(),
  splitMethod: text('split_method').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedByMembershipId: integer('updated_by_membership_id'),
  deletedAt: text('deleted_at'),
  deletedByMembershipId: integer('deleted_by_membership_id'),
});

export const expenseShares = sqliteTable('expense_shares', {
  id: integer('id').primaryKey(),
  expenseId: integer('expense_id').notNull(),
  membershipId: integer('membership_id').notNull(),
  sharePaise: integer('share_paise').notNull(),
  inputPaise: integer('input_paise'),
  inputBp: integer('input_bp'),
  position: integer('position').notNull(),
});

export const settlements = sqliteTable('settlements', {
  id: integer('id').primaryKey(),
  groupId: integer('group_id').notNull(),
  fromMembershipId: integer('from_membership_id').notNull(),
  toMembershipId: integer('to_membership_id').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  settlementDate: text('settlement_date').notNull(),
  note: text('note'),
  recordedByMembershipId: integer('recorded_by_membership_id').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedByMembershipId: integer('updated_by_membership_id'),
  deletedAt: text('deleted_at'),
  deletedByMembershipId: integer('deleted_by_membership_id'),
});

export const changeRecords = sqliteTable('change_records', {
  id: integer('id').primaryKey(),
  groupId: integer('group_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  action: text('action').notNull(),
  actorMembershipId: integer('actor_membership_id').notNull(),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  createdAt: text('created_at').notNull(),
});

export const activityEvents = sqliteTable('activity_events', {
  id: integer('id').primaryKey(),
  groupId: integer('group_id').notNull(),
  actorMembershipId: integer('actor_membership_id'),
  type: text('type').notNull(),
  subjectType: text('subject_type'),
  subjectId: integer('subject_id'),
  summary: text('summary').notNull(),
  createdAt: text('created_at').notNull(),
});

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey(),
  recipientUserId: integer('recipient_user_id').notNull(),
  actorUserId: integer('actor_user_id'),
  groupId: integer('group_id'),
  groupName: text('group_name').notNull(),
  type: text('type').notNull(),
  entityType: text('entity_type'),
  entityId: integer('entity_id'),
  message: text('message').notNull(),
  readAt: text('read_at'),
  createdAt: text('created_at').notNull(),
});
