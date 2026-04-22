import { relations, sql, type InferInsertModel, type InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ============================================
// 1. admins
// ============================================
export const admins = pgTable(
  'admins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash'),
    token: varchar('token', { length: 64 }).unique(),
    isRoot: boolean('is_root').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_admins_username').on(table.username),
    index('idx_admins_token').on(table.token),
  ],
);

// ============================================
// trusted_github_developers
// ============================================
export const trustedGithubDevelopers = pgTable(
  'trusted_github_developers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email'),
    githubUsername: text('github_username').notNull(),
    createdBy: uuid('created_by').references(() => admins.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_trusted_github_email_unique')
      .on(table.email)
      .where(sql`email IS NOT NULL`),
    uniqueIndex('idx_trusted_github_username_unique').on(table.githubUsername),
    index('idx_trusted_github_email')
      .on(table.email)
      .where(sql`email IS NOT NULL`),
  ],
);

// ============================================
// 2. users
// ============================================
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().unique(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash'),
    avatar: text('avatar'),
    banner: text('banner'),
    balance: integer('balance').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    lastLogin: timestamp('last_login', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_users_user_id').on(table.userId),
    index('idx_users_username').on(table.username),
    index('idx_users_is_active').on(table.isActive),
  ],
);

// ============================================
// 2.1. user_devices
// ============================================
export const userDevices = pgTable(
  'user_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    deviceName: text('device_name').notNull(),
    ipAddress: text('ip_address'),
    location: text('location'),
    deviceFpHash: text('device_fp_hash'),
    lastActive: timestamp('last_active', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_user_devices_user_id').on(table.userId),
    index('idx_user_devices_token_hash').on(table.tokenHash),
    index('idx_user_devices_last_active').on(table.lastActive),
    index('idx_user_devices_user_id_device_fp_hash')
      .on(table.userId, table.deviceFpHash)
      .where(sql`device_fp_hash IS NOT NULL`),
  ],
);

// ============================================
// 3. user_roles
// ============================================
export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    grantedBy: uuid('granted_by').references(() => admins.id, { onDelete: 'set null' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_user_roles_user_id').on(table.userId),
    index('idx_user_roles_role').on(table.role),
    index('idx_user_roles_is_active').on(table.isActive),
    index('idx_user_roles_user_role_active')
      .on(table.userId, table.role, table.isActive)
      .where(sql`is_active = true AND revoked_at IS NULL`),
    uniqueIndex('idx_user_roles_user_role_unique')
      .on(table.userId, table.role)
      .where(sql`is_active = true AND revoked_at IS NULL`),
  ],
);

// ============================================
// 4. support_tickets
// ============================================
export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('open'),
    priority: text('priority').default('normal'),
    subject: text('subject').notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_support_tickets_user_id').on(table.userId),
    index('idx_support_tickets_assigned_to').on(table.assignedTo),
    index('idx_support_tickets_status').on(table.status),
    index('idx_support_tickets_last_message_at').on(table.lastMessageAt),
    index('idx_support_tickets_user_status').on(table.userId, table.status),
  ],
);

// ============================================
// 5. support_messages
// ============================================
export const supportMessages = pgTable(
  'support_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    messageText: text('message_text').notNull(),
    senderType: text('sender_type').default('user'),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_support_messages_ticket_id').on(table.ticketId),
    index('idx_support_messages_sender_id').on(table.senderId),
    index('idx_support_messages_created_at').on(table.createdAt),
    index('idx_support_messages_ticket_created').on(table.ticketId, table.createdAt),
  ],
);

// ============================================
// 5.1. support_message_attachments
// ============================================
export const supportMessageAttachments = pgTable(
  'support_message_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => supportMessages.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    fileType: text('file_type').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    storagePath: text('storage_path').notNull(),
    blurHash: text('blur_hash'),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_support_attachments_message_id').on(table.messageId),
    index('idx_support_attachments_created_at').on(table.createdAt),
  ],
);

// ============================================
// 8. notifications — UPSERT grouping by ticket
// ============================================
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    count: integer('count').notNull().default(1),
    relatedTicketId: uuid('related_ticket_id').references(() => supportTickets.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_notifications_user_id').on(table.userId),
    index('idx_notifications_user_unread')
      .on(table.userId, table.isRead)
      .where(sql`is_read = false`),
    index('idx_notifications_created_at').on(table.createdAt),
  ],
);

// ============================================
// 9. profile_comments
// ============================================
export const profileComments = pgTable(
  'profile_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    content: text('content').notNull(),
    isPinned: boolean('is_pinned').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_profile_comments_profile_id').on(table.profileId),
    index('idx_profile_comments_author_id').on(table.authorId),
    index('idx_profile_comments_parent_id').on(table.parentId),
    index('idx_profile_comments_created_at').on(table.createdAt),
  ],
);

/** Panel settings — key-value store for Remnawave panel connection config. */
export const panelSettings = pgTable('panel_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  updatedBy: uuid('updated_by').references(() => admins.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** User VPN subscriptions linked to Remnawave panel users. */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    remnawaveUuid: text('remnawave_uuid'),
    shortUuid: text('short_uuid'),
    subscriptionUrl: text('subscription_url'),
    status: text('status').notNull().default('pending'),
    plan: text('plan').notNull().default('base-monthly'),
    expireAt: timestamp('expire_at', { withTimezone: true }),
    trafficLimitBytes: bigint('traffic_limit_bytes', { mode: 'number' }).default(0),
    trafficLimitStrategy: text('traffic_limit_strategy').default('MONTH'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_subscriptions_user_id').on(table.userId),
    index('idx_subscriptions_status').on(table.status),
    index('idx_subscriptions_expire_at').on(table.expireAt),
    index('idx_subscriptions_remnawave_uuid').on(table.remnawaveUuid),
  ],
);

/** Payment records — amounts stored in kopecks (integer). */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('RUB'),
    status: text('status').notNull().default('pending'),
    provider: text('provider').notNull().default('test'),
    providerPaymentId: text('provider_payment_id'),
    promoCode: text('promo_code'),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_payments_user_id').on(table.userId),
    index('idx_payments_status').on(table.status),
    index('idx_payments_subscription_id').on(table.subscriptionId),
    index('idx_payments_created_at').on(table.createdAt),
  ],
);

/** Balance transaction log — amounts in kopecks, positive = top-up, negative = spend. */
export const balanceTransactions = pgTable(
  'balance_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    type: text('type').notNull(),
    description: text('description'),
    relatedPaymentId: uuid('related_payment_id').references(() => payments.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_balance_transactions_user_id').on(table.userId),
    index('idx_balance_transactions_type').on(table.type),
    index('idx_balance_transactions_created_at').on(table.createdAt),
  ],
);

// ============================================
// Relations
// ============================================
export const adminsRelations = relations(admins, ({ many }) => ({
  trustedDevelopers: many(trustedGithubDevelopers),
  grantedRoles: many(userRoles),
}));

export const trustedGithubDevelopersRelations = relations(trustedGithubDevelopers, ({ one }) => ({
  creator: one(admins, {
    fields: [trustedGithubDevelopers.createdBy],
    references: [admins.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  devices: many(userDevices),
  roles: many(userRoles),
  tickets: many(supportTickets, { relationName: 'ticketUser' }),
  assignedTickets: many(supportTickets, { relationName: 'assignedUser' }),
  sentMessages: many(supportMessages),
  notifications: many(notifications),
  profileComments: many(profileComments, { relationName: 'profileOwner' }),
  authoredComments: many(profileComments, { relationName: 'commentAuthor' }),
  subscriptions: many(subscriptions),
  payments: many(payments),
  balanceTransactions: many(balanceTransactions),
}));

export const userDevicesRelations = relations(userDevices, ({ one }) => ({
  user: one(users, {
    fields: [userDevices.userId],
    references: [users.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  grantedByAdmin: one(admins, {
    fields: [userRoles.grantedBy],
    references: [admins.id],
  }),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  user: one(users, {
    fields: [supportTickets.userId],
    references: [users.id],
    relationName: 'ticketUser',
  }),
  assignedUser: one(users, {
    fields: [supportTickets.assignedTo],
    references: [users.id],
    relationName: 'assignedUser',
  }),
  messages: many(supportMessages),
}));

export const supportMessagesRelations = relations(supportMessages, ({ one, many }) => ({
  ticket: one(supportTickets, {
    fields: [supportMessages.ticketId],
    references: [supportTickets.id],
  }),
  sender: one(users, {
    fields: [supportMessages.senderId],
    references: [users.id],
  }),
  attachments: many(supportMessageAttachments),
}));

export const supportMessageAttachmentsRelations = relations(
  supportMessageAttachments,
  ({ one }) => ({
    message: one(supportMessages, {
      fields: [supportMessageAttachments.messageId],
      references: [supportMessages.id],
    }),
  }),
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  ticket: one(supportTickets, {
    fields: [notifications.relatedTicketId],
    references: [supportTickets.id],
  }),
}));

export const profileCommentsRelations = relations(profileComments, ({ one, many }) => ({
  profile: one(users, {
    fields: [profileComments.profileId],
    references: [users.id],
    relationName: 'profileOwner',
  }),
  author: one(users, {
    fields: [profileComments.authorId],
    references: [users.id],
    relationName: 'commentAuthor',
  }),
  parent: one(profileComments, {
    fields: [profileComments.parentId],
    references: [profileComments.id],
    relationName: 'commentReplies',
  }),
  replies: many(profileComments, { relationName: 'commentReplies' }),
}));

export const panelSettingsRelations = relations(panelSettings, ({ one }) => ({
  updatedByAdmin: one(admins, {
    fields: [panelSettings.updatedBy],
    references: [admins.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const balanceTransactionsRelations = relations(balanceTransactions, ({ one }) => ({
  user: one(users, {
    fields: [balanceTransactions.userId],
    references: [users.id],
  }),
  payment: one(payments, {
    fields: [balanceTransactions.relatedPaymentId],
    references: [payments.id],
  }),
}));

// ============================================
// Inferred Types
// ============================================
export type Admin = InferSelectModel<typeof admins>;
export type AdminInsert = InferInsertModel<typeof admins>;

export type User = InferSelectModel<typeof users>;
export type UserInsert = InferInsertModel<typeof users>;

export type UserDevice = InferSelectModel<typeof userDevices>;
export type UserDeviceInsert = InferInsertModel<typeof userDevices>;

export type UserRole = InferSelectModel<typeof userRoles>;
export type UserRoleInsert = InferInsertModel<typeof userRoles>;

export type TrustedGithubDeveloper = InferSelectModel<typeof trustedGithubDevelopers>;
export type TrustedGithubDeveloperInsert = InferInsertModel<typeof trustedGithubDevelopers>;

export type SupportTicket = InferSelectModel<typeof supportTickets>;
export type SupportTicketInsert = InferInsertModel<typeof supportTickets>;

export type SupportMessage = InferSelectModel<typeof supportMessages>;
export type SupportMessageInsert = InferInsertModel<typeof supportMessages>;

export type SupportMessageAttachment = InferSelectModel<typeof supportMessageAttachments>;
export type SupportMessageAttachmentInsert = InferInsertModel<typeof supportMessageAttachments>;

export type Notification = InferSelectModel<typeof notifications>;
export type NotificationInsert = InferInsertModel<typeof notifications>;

export type ProfileComment = InferSelectModel<typeof profileComments>;
export type ProfileCommentInsert = InferInsertModel<typeof profileComments>;

export type PanelSetting = InferSelectModel<typeof panelSettings>;
export type PanelSettingInsert = InferInsertModel<typeof panelSettings>;

export type Subscription = InferSelectModel<typeof subscriptions>;
export type SubscriptionInsert = InferInsertModel<typeof subscriptions>;

export type Payment = InferSelectModel<typeof payments>;
export type PaymentInsert = InferInsertModel<typeof payments>;

export type BalanceTransaction = InferSelectModel<typeof balanceTransactions>;
export type BalanceTransactionInsert = InferInsertModel<typeof balanceTransactions>;
