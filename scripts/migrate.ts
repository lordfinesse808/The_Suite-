// Apply src/lib/db/migrations/*.sql to DATABASE_URL (Supabase in production, PGlite locally).
import { migrate, closeDb } from "../src/lib/db/client";

(process.env as Record<string, string>).AUTO_SEED = "false";
migrate()
  .then(() => console.log("Migrations applied."))
  .finally(() => closeDb());
