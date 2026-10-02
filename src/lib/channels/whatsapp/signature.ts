import { hmacSha256Hex, safeEqual } from "../../crypto";

/** Meta signs the raw body with the app secret: X-Hub-Signature-256: sha256=<hex>. */
export function signBody(secret: string, rawBody: string): string {
  return "sha256=" + hmacSha256Hex(secret, rawBody);
}

export function verifySignature(secret: string, rawBody: string, header: string | null): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  return safeEqual(signBody(secret, rawBody), header);
}
