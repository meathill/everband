import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// 全局身份表（无 organizationId）。

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  // 规范化小写邮箱，全局唯一
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    // 存 session token 的 SHA-256 哈希，不存明文
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
  },
  (table) => [index("idx_sessions_user").on(table.userId)],
);

export const authTokens = sqliteTable(
  "auth_tokens",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    // magic link token 哈希；一次性使用靠 consumedAt 原子 UPDATE
    tokenHash: text("token_hash").notNull(),
    // 6 位 OTP 哈希，与 magic link 同记录同生命周期
    otpHash: text("otp_hash").notNull(),
    purpose: text("purpose", { enum: ["login", "invite"] }).notNull(),
    // 邀请 token 关联的 membership（purpose=invite 时非空）
    membershipId: text("membership_id"),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: integer("consumed_at"),
    attemptCount: integer("attempt_count").notNull().default(0),
    requestIp: text("request_ip"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_auth_tokens_token_hash").on(table.tokenHash),
    index("idx_auth_tokens_email_created").on(table.email, table.createdAt),
  ],
);
