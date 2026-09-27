import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDatabase } from "./db/client.js";
import { account, session, user, verification } from "./db/schema.js";
import { getConfig } from "./config.js";

const config = getConfig();

export const auth = betterAuth({
  appName: "Nex",
  baseURL: config.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: config.BETTER_AUTH_SECRET,
  trustedOrigins: config.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean),
  database: drizzleAdapter(getDatabase(), {
    provider: "sqlite",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    requireEmailVerification: false,
  },
  user: {
    deleteUser: { enabled: true },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    database: { generateId: () => crypto.randomUUID() },
    useSecureCookies: config.NODE_ENV === "production",
  },
  plugins: [bearer({ requireSignature: true })],
});

export type AuthSession = typeof auth.$Infer.Session;
