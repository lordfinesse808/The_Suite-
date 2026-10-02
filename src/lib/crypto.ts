import crypto from "node:crypto";
import { env } from "./env";

// ---- passwords (scrypt) ----
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// ---- tokens ----
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function hmacSha256Hex(secret: string, body: string | Buffer) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// ---- AES-256-GCM for stored access tokens (key id prefix allows rotation) ----
function key(): Buffer {
  const k = env().ENCRYPTION_KEY;
  if (k) {
    const buf = Buffer.from(k, "base64");
    if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    return buf;
  }
  return crypto.createHash("sha256").update("ile-dev-encryption-key").digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(blob: string): string {
  if (!blob) return "";
  const [v, ivB, tagB, encB] = blob.split(":");
  if (v !== "v1" || !ivB || !tagB || !encB) throw new Error("Unknown ciphertext format");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  d.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([d.update(Buffer.from(encB, "base64")), d.final()]).toString("utf8");
}
