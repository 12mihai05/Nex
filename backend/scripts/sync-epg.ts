import "dotenv/config";
import { EpgService } from "../src/services/epg/service.js";
import { closeDatabase } from "../src/db/client.js";
import { getConfig } from "../src/config.js";
import { createEpgProvider } from "../src/services/epg/provider.js";
import { getDatabase } from "../src/db/client.js";

try {
  for (const country of getConfig().EPG_COUNTRIES.split(",").map((c) => c.trim().toUpperCase())) {
    try {
      const result = await new EpgService(getDatabase(), createEpgProvider(country)).sync();
      console.log(JSON.stringify({ country, ...result }));
    } catch (error) {
      console.log(JSON.stringify({ country, status: "failed", code: error instanceof Error && /^EPG_[A-Z_]+$/.test(error.message) ? error.message : "SYNC_FAILED" }));
      process.exitCode = 1;
    }
    if (getConfig().EPG_SOURCE_TYPE === "fixture") break;
  }
} finally { await closeDatabase(); }
