// Local only: delete the embedded database. The next `pnpm dev` re-creates and re-seeds it.
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL ?? "";
if (url.startsWith("postgres")) {
  console.error("Refusing to reset a Postgres database. This script only deletes the local PGlite folder.");
  process.exit(1);
}
const dir = url || path.join(process.cwd(), ".data", "pglite");
fs.rmSync(dir, { recursive: true, force: true });
console.log(`Deleted ${dir}. Restart the dev server to re-seed.`);
