import "../src/env.js";
import { sql } from "drizzle-orm";
import { getDatabase,closeDatabase } from "../src/db/client.js";
const db=getDatabase();
try {
  const countries=await db.all(sql`SELECT c.country, count(distinct c.id) AS channels, count(p.id) AS programs, min(p.start_at) AS first_start, max(p.end_at) AS last_end FROM channels c JOIN epg_programs p ON p.channel_id=c.id GROUP BY c.country`);
  const retention=await db.all(sql`SELECT count(*) AS outside_window FROM epg_programs WHERE end_at < (unixepoch()*1000-7*86400000) OR start_at > (unixepoch()*1000+14*86400000)`);
  const foreignKeys=await db.all(sql`PRAGMA foreign_key_check`);
  const testUsers=await db.all(sql`SELECT count(*) AS remaining_test_accounts FROM user WHERE email LIKE 'nex-verify-%@example.test'`);
  const stats=await db.all(sql`SELECT count(*) AS migrations FROM __drizzle_migrations`);
  console.log(JSON.stringify({countries,retention,foreignKeyViolations:foreignKeys.length,testUsers,stats}));
} catch { console.error("AUDIT_FAILED: database details suppressed"); process.exitCode=1; }
finally { await closeDatabase(); }
