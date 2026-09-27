import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Resolve from the repository, independent of npm workspace working directory.
if (!process.env.VITEST) config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });
