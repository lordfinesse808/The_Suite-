// Load the demo organisation (Adaeze Homes) if the database is empty.
import { getDb, closeDb } from "../src/lib/db/client";
import { seedIfEmpty } from "../src/lib/db/seed";

(process.env as Record<string, string>).AUTO_SEED = "false";
(async () => {
  const db = await getDb();
  console.log((await seedIfEmpty(db)) ? "Seeded demo data. Login: adaeze@demo.ile / demo1234" : "Database already has data; nothing to do.");
  await closeDb();
})();
