import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "./env";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * MOCK_STORAGE=true: saves to public/uploads (local dev).
 * Production: upload to Supabase Storage bucket "listing-photos" (see docs/going-live.md).
 */
export async function saveUpload(file: File, orgId: string): Promise<string> {
  if (!ALLOWED.has(file.type)) throw new Error("Photos must be JPEG, PNG or WebP");
  if (file.size > 5 * 1024 * 1024) throw new Error("Photos must be under 5 MB");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const name = `${orgId.slice(0, 8)}-${crypto.randomUUID()}.${ext}`;
  if (env().MOCK_STORAGE || !env().NEXT_PUBLIC_SUPABASE_URL) {
    const dir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
    return `/uploads/${name}`;
  }
  const url = `${env().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/listing-photos/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${env().SUPABASE_SERVICE_ROLE_KEY}`, "content-type": file.type },
    body: Buffer.from(await file.arrayBuffer()),
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return `${env().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-photos/${name}`;
}
