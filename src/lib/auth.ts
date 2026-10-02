import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "./db/client";
import * as s from "./db/schema";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto";
import { now } from "./clock";
import { env } from "./env";

const COOKIE = "ile_session";
const TTL_DAYS = 30;

export interface Session {
  userId: string;
  name: string;
  email: string;
  orgId: string;
  role: "owner" | "agent";
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ userId: s.users.id, name: s.users.name, email: s.users.email, orgId: s.sessions.org_id })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.user_id))
    .where(and(eq(s.sessions.token_hash, sha256(token)), gt(s.sessions.expires_at, new Date())));
  if (!row) return null;
  const memberships = await db.select().from(s.memberships).where(eq(s.memberships.user_id, row.userId));
  const m = memberships.find((x) => x.org_id === row.orgId) ?? memberships[0];
  if (!m) return null;
  return { userId: row.userId, name: row.name, email: row.email, orgId: m.org_id, role: m.role };
}

export async function requireSession(): Promise<Session> {
  const sess = await getSession();
  if (!sess) redirect("/login");
  return sess;
}

export async function requireOwner(): Promise<Session> {
  const sess = await requireSession();
  if (sess.role !== "owner") throw new Error("Only the owner can do this");
  return sess;
}

async function startSession(userId: string, orgId: string) {
  const db = await getDb();
  const token = randomToken();
  await db.insert(s.sessions).values({ user_id: userId, org_id: orgId, token_hash: sha256(token), expires_at: new Date(Date.now() + TTL_DAYS * 86400_000) });
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env().isProd, path: "/", maxAge: TTL_DAYS * 86400 });
}

export async function login(email: string, password: string): Promise<string | null> {
  const db = await getDb();
  const [u] = await db.select().from(s.users).where(eq(s.users.email, email.trim().toLowerCase()));
  if (!u || !verifyPassword(password, u.password_hash)) return "Email or password is not correct.";
  const [m] = await db.select().from(s.memberships).where(eq(s.memberships.user_id, u.id));
  if (!m) return "This account has no organisation.";
  await startSession(u.id, m.org_id);
  return null;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(s.sessions).where(eq(s.sessions.token_hash, sha256(token)));
  }
  jar.delete(COOKIE);
}

/** Signup creates the user, a new organisation, the owner membership and default viewing hours. */
export async function signup(input: { name: string; email: string; password: string; orgName: string }): Promise<string | null> {
  const db = await getDb();
  const email = input.email.trim().toLowerCase();
  const [exists] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email));
  if (exists) return "An account with this email already exists.";
  if (input.password.length < 8) return "Use at least 8 characters for the password.";
  const [u] = await db.insert(s.users).values({ email, name: input.name.trim(), password_hash: hashPassword(input.password) }).returning();
  const [org] = await db
    .insert(s.organisations)
    .values({
      name: input.orgName.trim(),
      public_key: `pk_${randomToken(12)}`,
      consent_message: `You're chatting with ${input.orgName.trim()}' assistant. We use your details only to help you find a home. Reply STOP at any time.`,
      created_at: now(),
    })
    .returning();
  await db.insert(s.memberships).values({ user_id: u.id, org_id: org.id, role: "owner" });
  await db.insert(s.availability).values([1, 2, 3, 4, 5, 6].map((wd) => ({ org_id: org.id, agent_id: u.id, weekday: wd, start_time: "09:00", end_time: "17:00" })));
  if (env().MOCK_WHATSAPP) {
    await db.insert(s.whatsappAccounts).values({ org_id: org.id, phone_number_id: `MOCK_PNID_${randomToken(6)}`, display_number: "+234 800 000 0000", display_name: org.name });
  }
  await db.insert(s.auditLog).values({ org_id: org.id, actor: `user:${u.id}`, action: "org.created", entity: "organisation", entity_id: org.id });
  await startSession(u.id, org.id);
  return null;
}
