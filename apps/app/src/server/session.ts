import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { generateSecret, SESSION_TTL_MS, sha256Hex } from "@everband/domain";
import { deleteCookie, getCookie, getRequestUrl, setCookie } from "@tanstack/react-start/server";
import { eq, sql } from "drizzle-orm";

const SESSION_COOKIE = "eb_session";

function isSecureRequest(): boolean {
  return getRequestUrl().protocol === "https:";
}

export async function createSession(db: Database, userId: string): Promise<void> {
  const raw = generateSecret(32);
  const now = Date.now();
  await db.insert(schema.sessions).values({
    id: await sha256Hex(raw),
    userId,
    expiresAt: now + SESSION_TTL_MS,
    createdAt: now,
    lastSeenAt: now,
  });
  setCookie(SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: isSecureRequest(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export async function getSessionUser(db: Database): Promise<SessionUser | null> {
  const raw = getCookie(SESSION_COOKIE);
  if (!raw) {
    return null;
  }
  const hash = await sha256Hex(raw);
  const now = Date.now();
  const rows = await db
    .select({
      sessionId: schema.sessions.id,
      expiresAt: schema.sessions.expiresAt,
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.id, hash))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt <= now) {
    return null;
  }
  // 滚动续期：低频更新 lastSeenAt（每小时最多一次的粗粒度即可）
  await db
    .update(schema.sessions)
    .set({ lastSeenAt: now, expiresAt: now + SESSION_TTL_MS })
    .where(
      sql`${schema.sessions.id} = ${hash} AND ${schema.sessions.lastSeenAt} < ${now - 3_600_000}`,
    );
  return { id: row.userId, email: row.email, name: row.name };
}

export async function destroySession(db: Database): Promise<void> {
  const raw = getCookie(SESSION_COOKIE);
  if (raw) {
    const hash = await sha256Hex(raw);
    await db.delete(schema.sessions).where(eq(schema.sessions.id, hash));
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
}
