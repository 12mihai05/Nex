import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z, ZodError } from "zod";
import { auth, type AuthSession } from "./auth.js";
import { getConfig } from "./config.js";
import { createTmdbRepository } from "./repositories/tmdb-repository.js";
import { UserRepository } from "./repositories/user-repository.js";
import { AiService } from "./services/ai.js";
import { ChatService } from "./services/chat.js";
import { EpgService } from "./services/epg/service.js";
import { detectSearchIntent } from "./services/intent.js";
import { rankCandidates } from "./services/recommendation.js";
import { generateCandidates } from "./services/candidates.js";
import { discoverHome } from "./services/discovery.js";
import { createEpgProvider } from "./services/epg/provider.js";
import { getDatabase } from "./db/client.js";
import {
  chatBodySchema, feedbackBodySchema, onboardingBodySchema, recommendBodySchema, reminderBodySchema, searchQuerySchema,
  settingsBodySchema, surpriseBodySchema, tasteBodySchema, titleActionSchema, titleParamsSchema,
} from "./http/schemas.js";

type Env = { Variables: { authSession: AuthSession } };
const app = new Hono<Env>();
const config = getConfig();
const users = new UserRepository();
const catalog = createTmdbRepository();
const ai = new AiService();
const epg = new EpgService();
const chat = new ChatService(users, catalog, ai);
app.use("/api/*",bodyLimit({maxSize:128*1024,onError:(c)=>c.json({error:{code:"REQUEST_TOO_LARGE",message:"Request is too large."}},413)}));

app.use("/api/*", cors({ origin: (origin) => config.ALLOWED_ORIGINS.split(",").includes(origin) ? origin : config.ALLOWED_ORIGINS.split(",")[0]!, allowHeaders: ["Content-Type", "Authorization", "X-Nex-Invite"], exposeHeaders: ["Set-Auth-Token"], credentials: true }));

app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: { code: error.status === 401 ? "UNAUTHORIZED" : "REQUEST_FAILED", message: error.message } }, error.status);
  if (error instanceof ZodError) return c.json({ error: { code: "VALIDATION_ERROR", message: "The request was invalid.", details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) } }, 400);
  const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "INTERNAL_ERROR";
  return c.json({ error: { code, message: code === "INTERNAL_ERROR" ? "Nex could not complete the request." : code.replaceAll("_", " ").toLowerCase() } }, code.endsWith("NOT_FOUND") ? 404 : ["REMINDERS_DISABLED","REMINDER_TIME_PASSED"].includes(code) ? 409 : 500);
});

app.get("/api/health", (c) => c.json({ status: "ok", service: "nex-api", version: "0.1.0", integrations: { database: config.TURSO_DATABASE_URL.startsWith("file:") ? "local" : "turso", catalog: catalog.mode, ai: ai.mode, epg: config.EPG_SOURCE_TYPE } }));

app.all("/api/auth/*", async (c) => {
  let request = c.req.raw;
  if (request.method === "POST" && new URL(request.url).pathname.endsWith("/sign-up/email")) {
    const body = await request.clone().json().catch(() => ({})) as Record<string, unknown>;
    const headerInvite = request.headers.get("x-nex-invite");
    const invite = typeof body.inviteCode === "string" ? body.inviteCode : headerInvite;
    if (!invite || !safeSecretEqual(invite, config.NEX_INVITE_CODE)) return c.json({ error: { code: "INVALID_INVITE", message: "A valid private invite is required." } }, 403);
    const { inviteCode: _, ...authBody } = body;
    void _;
    const headers = new Headers(request.headers); headers.delete("content-length");
    request = new Request(request.url, { method: request.method, headers, body: JSON.stringify(authBody) });
  }
  return auth.handler(request);
});

const requireAuth = createMiddleware<Env>(async (c, next) => {
  c.header("Cache-Control","private, no-store");
  const authSession = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!authSession) throw new HTTPException(401, { message: "Authentication required." });
  c.set("authSession", authSession);
  await next();
});

app.use("/api/search", requireAuth);
app.use("/api/title/*", requireAuth);
app.use("/api/providers", requireAuth);
app.use("/api/tv/*", requireAuth);
app.use("/api/recommend", requireAuth);
app.use("/api/discovery", requireAuth);
app.use("/api/surprise", requireAuth);
app.use("/api/onboarding/*", requireAuth);
app.use("/api/chat", requireAuth);
app.use("/api/me/*", requireAuth);

app.get("/api/providers", async (c) => {
  const {profile} = await users.getSettings(c.get("authSession").user.id);
  const region=z.enum(["RO","BG","GB","ES","FR","CH","IT","DE","MD"]).optional().parse(c.req.query("country"));
  return c.json({ data: await catalog.getProviders(region??profile.country), source: catalog.mode });
});

app.get("/api/search", async (c) => {
  const { q, page } = searchQuerySchema.parse(c.req.query());
  const userId = c.get("authSession").user.id;
  const state = await users.getRecommendationState(userId);
  const intent = detectSearchIntent(q);
  if(c.req.query("mode")==="title") { intent.intent="TITLE_LOOKUP";intent.availabilityScope="all_providers";intent.query=q; }
  const results = intent.intent === "DISCOVERY"
    ? rankCandidates(await generateCandidates(catalog,state,intent),intent,{...state,viewerIds:[userId],temporaryMoods:intent.moods}).map(r=>r.item)
    : await catalog.search({ query: intent.query, region: state.country, page });
  const ownedResults = results.map(item=>({...item,availability:item.availability.map(a=>({...a,owned:state.ownedProviderIds.includes(a.providerId)}))}));
  return c.json({ data: ownedResults, meta: { intent: intent.intent, availabilityScope: intent.availabilityScope, page, source: catalog.mode } });
});

app.get("/api/title/:mediaType/:tmdbId", async (c) => {
  const params = titleParamsSchema.parse(c.req.param());
  const state = await users.getRecommendationState(c.get("authSession").user.id);
  const item = await catalog.getTitle(params.mediaType, params.tmdbId, state.country, state.ownedProviderIds);
  if (!item) throw new HTTPException(404, { message: "Title not found." });
  return c.json({ data: item });
});

app.get("/api/discovery", async c => {
  const userId=c.get("authSession").user.id;
  const rows=await discoverHome(catalog,await users.getRecommendationState(userId),userId);
  // Record only the lead shelf, not hundreds of titles below the fold.
  await users.recordRecommendations(userId,rows[0]?.items??[],"discovery-lead");
  c.header("Cache-Control","private, no-store");
  return c.json({data:rows});
});

app.post("/api/recommend", async (c) => {
  const body = recommendBodySchema.parse(await c.req.json());
  const userId = c.get("authSession").user.id;
  if (body.viewerIds?.some((id) => id !== userId)) throw new HTTPException(403, { message: "V1 recommendations can only include the current viewer." });
  const state = await users.getRecommendationState(userId);
  const filter = detectSearchIntent("");
  Object.assign(filter, body.filter, { intent: "DISCOVERY" });
  const candidates = await generateCandidates(catalog,state,filter);
  const ranked = rankCandidates(candidates, filter, { ...state, viewerIds: [userId], temporaryMoods: filter.moods });
  await users.recordRecommendations(userId,ranked,"browse");
  return c.json({ data: ranked });
});

app.post("/api/surprise", async (c) => {
  const body = surpriseBodySchema.parse(await c.req.json());
  const userId = c.get("authSession").user.id;
  const state = await users.getRecommendationState(userId);
  const filter = detectSearchIntent(body.mood ? `something ${body.mood}` : "what should I watch?");
  filter.maxRuntimeMinutes = body.maxRuntimeMinutes;
  filter.intent = "DISCOVERY";
  const candidates = (await generateCandidates(catalog,state,filter)).filter((item) => !body.excludedIds.includes(item.id));
  const result = rankCandidates(candidates, filter, { ...state, viewerIds: [userId], temporaryMoods: body.mood ? [body.mood] : [] }, 1)[0];
  if (!result) throw new HTTPException(404, { message: "No new grounded pick matched those constraints." });
  await users.recordRecommendations(userId,[result],"surprise");
  return c.json({ data: result });
});

app.post("/api/onboarding/analyze", async (c) => {
  const body = onboardingBodySchema.parse(await c.req.json());
  const userId = c.get("authSession").user.id;
  if (!await users.incrementAiUsage(userId, config.AI_DAILY_MESSAGE_LIMIT)) return c.json({ error: { code: "AI_DAILY_LIMIT", message: "Daily AI limit reached. Browse and search still work." } }, 429);
  const analysis = await ai.extractTaste(body.description, body.favorites).catch(() => new AiService("").extractTaste(body.description,body.favorites));
  const explicit = [...body.genres.map((key) => ({ dimension: "genre", key, score: 0.85, confidence: 0.8, evidenceCount: 1, source: "onboarding_explicit" })), ...body.moods.map((key) => ({ dimension: "mood", key, score: 0.85, confidence: 0.8, evidenceCount: 1, source: "onboarding_explicit" }))];
  const signals = [...analysis.signals, ...explicit, ...body.concepts.map(key=>({dimension:"keyword",key,score:.85,confidence:.8,evidenceCount:1,source:"onboarding_explicit"}))];
  await users.upsertTaste(userId, signals);
  const state = await users.getRecommendationState(userId);
  for (const favorite of body.favorites) {
    const item = await catalog.getTitle(favorite.mediaType,favorite.id,state.country);
    if (item) { await users.setFeedback(userId,item.mediaType,item.id,"like"); await users.learnFromTitle(userId,item,"onboarding_favorite"); }
  }
  return c.json({ data: { ...analysis, signals } });
});

app.post("/api/chat", async (c) => {
  const body = chatBodySchema.parse(await c.req.json());
  const userId = c.get("authSession").user.id;
  if (!await users.incrementAiUsage(userId, config.AI_DAILY_MESSAGE_LIMIT)) return c.json({ error: { code: "AI_DAILY_LIMIT", message: "Daily AI limit reached. Browse and search still work." } }, 429);
  return c.json({ data: await chat.respond(userId, body.message, body.sessionId) });
});

app.get("/api/tv/channels",async c=>{
  const userId=c.get("authSession").user.id;const {profile}=await users.getSettings(userId);
  const q=z.string().max(100).parse(c.req.query("q")??"");const offset=z.coerce.number().int().min(0).max(10000).parse(c.req.query("offset")??0);
  return c.json({data:await epg.listChannels(userId,profile.country,q,offset,c.req.query("favorites")==="true")});
});
app.put("/api/me/channel-favorites",async c=>{
  const body=z.object({channelId:z.string().min(1).max(500),favorite:z.boolean()}).strict().parse(await c.req.json());
  const userId=c.get("authSession").user.id;const {profile}=await users.getSettings(userId);
  try{await epg.setChannelFavorite(userId,profile.country,body.channelId,body.favorite);}
  catch(error){if(error instanceof Error&&error.message.startsWith("CHANNEL_"))throw new HTTPException(error.message==="CHANNEL_NOT_FOUND"?404:409,{message:error.message});throw error;}
  return c.json({data:{saved:true}});
});
app.get("/api/tv/discover",async c=>{
  const now=new Date();const userId=c.get("authSession").user.id;const {profile}=await users.getSettings(userId);
  const [live,upcoming]=await Promise.all([epg.listWindow(now,new Date(+now+1),profile.country,userId),epg.listWindow(now,new Date(+now+12*3600000),profile.country,userId,{futureOnly:true})]);
  return c.json({data:{live,upcoming},meta:{country:profile.country}});
});
app.get("/api/tv/channel-schedule",async c=>{
  const userId=c.get("authSession").user.id;const {profile}=await users.getSettings(userId);const now=new Date();
  const id=z.string().min(1).max(500).parse(c.req.query("id"));
  const offset=z.coerce.number().int().min(0).max(10000).parse(c.req.query("offset")??0);
  return c.json({data:await epg.listWindow(now,new Date(+now+48*3600000),profile.country,userId,{channelId:id,offset})});
});
app.get("/api/tv/live", async (c) => {
  const now = new Date();
  const { country } = await users.getRecommendationState(c.get("authSession").user.id);
  return c.json({ data: await epg.listWindow(now, new Date(now.getTime() + 1_000),country,c.get("authSession").user.id) });
});
app.get("/api/tv/upcoming", async (c) => {
  const now = new Date();
  const hours = z.coerce.number().int().min(1).max(48).parse(c.req.query("hours") ?? 12);
  const { country } = await users.getRecommendationState(c.get("authSession").user.id);
  return c.json({ data: await epg.listWindow(now, new Date(now.getTime() + hours * 3_600_000),country,c.get("authSession").user.id), meta: { country, coverage:country==="MD"?"limited":"source-dependent", sync: await epg.status(country) } });
});

app.get("/api/me/settings", async (c) => c.json({ data: await users.getSettings(c.get("authSession").user.id) }));
app.put("/api/me/settings", async (c) => {
  const body = settingsBodySchema.parse(await c.req.json()); const userId = c.get("authSession").user.id;
  const { services, audioLanguages, subtitleLanguages, preferOriginal, ...profile } = body;
  if (Object.keys(profile).length) await users.updateSettings(userId, profile);
  if (services) await users.replaceServices(userId, services);
  if (audioLanguages || subtitleLanguages || preferOriginal !== undefined) {
    const current = (await users.getSettings(userId)).languages;
    await users.replaceLanguages(userId, audioLanguages ?? current.filter(l=>l.kind==="audio").map(l=>l.languageCode), subtitleLanguages ?? current.filter(l=>l.kind==="subtitle").map(l=>l.languageCode), preferOriginal ?? current.find(l=>l.kind==="audio")?.preferOriginal ?? true);
  }
  return c.json({ data: await users.getSettings(userId) });
});
app.get("/api/me/taste", async (c) => c.json({ data: await users.getTaste(c.get("authSession").user.id) }));
app.put("/api/me/taste", async (c) => { const body = tasteBodySchema.parse(await c.req.json()); await users.upsertTaste(c.get("authSession").user.id, body.signals.map((s)=>({ ...s, source: "explicit_edit" }))); return c.json({ data: body.signals }); });
app.delete("/api/me/taste", async (c) => { await users.clearTaste(c.get("authSession").user.id); return c.body(null, 204); });
app.get("/api/me/watchlist", async (c) => c.json({ data: await users.listWatchlist(c.get("authSession").user.id) }));
app.post("/api/me/watchlist", async (c) => { const body = titleActionSchema.parse(await c.req.json()); const userId=c.get("authSession").user.id; const state=await users.getRecommendationState(userId); const item=await catalog.getTitle(body.mediaType,body.tmdbId,state.country); if (!item) throw new HTTPException(404); await users.addWatchlist(userId,item); await users.learnFromTitle(userId,item,"watchlist"); return c.json({ data: { saved: true } }, 201); });
app.delete("/api/me/watchlist/:mediaType/:tmdbId", async (c) => { const params = titleParamsSchema.parse(c.req.param()); await users.removeWatchlist(c.get("authSession").user.id, params.mediaType, params.tmdbId); return c.body(null, 204); });
app.get("/api/me/history", async (c) => c.json({ data: await users.listHistory(c.get("authSession").user.id) }));
app.delete("/api/me/history/:mediaType/:tmdbId", async(c)=>{const p=titleParamsSchema.parse(c.req.param());await users.removeWatched(c.get("authSession").user.id,p.mediaType,p.tmdbId);return c.body(null,204);});
app.get("/api/me/feedback", async(c)=>c.json({data:await users.listFeedback(c.get("authSession").user.id)}));
app.delete("/api/me/feedback/:mediaType/:tmdbId", async(c)=>{const p=titleParamsSchema.parse(c.req.param());await users.clearFeedback(c.get("authSession").user.id,p.mediaType,p.tmdbId);return c.body(null,204);});
app.post("/api/me/history", async (c) => { const body=titleActionSchema.parse(await c.req.json());const userId=c.get("authSession").user.id;const state=await users.getRecommendationState(userId);const item=await catalog.getTitle(body.mediaType,body.tmdbId,state.country);if(!item)throw new HTTPException(404);await users.markWatched(userId,item);return c.json({data:{watched:true}},201); });
app.put("/api/me/feedback", async (c) => { const body = feedbackBodySchema.parse(await c.req.json()); const userId=c.get("authSession").user.id; const state=await users.getRecommendationState(userId); const item=await catalog.getTitle(body.mediaType,body.tmdbId,state.country); if (!item) throw new HTTPException(404); await users.applyFeedback(userId,item,body.reaction); return c.json({ data: body }); });
app.post("/api/me/rejections", async(c)=>{ const body=titleParamsSchema.parse(await c.req.json()); await users.rejectTitle(c.get("authSession").user.id,body.mediaType,body.tmdbId); return c.body(null,204); });
app.get("/api/me/reminders", async (c) => c.json({ data: await users.listReminders(c.get("authSession").user.id) }));
app.post("/api/me/reminders", async (c) => { const body = reminderBodySchema.parse(await c.req.json()); return c.json({ data: await users.createReminder(c.get("authSession").user.id, body.epgProgramId, body.offsetMinutes) }, 201); });
app.delete("/api/me/reminders/:id", async (c) => { const removed = await users.deleteReminder(c.get("authSession").user.id, c.req.param("id")); if (!removed) throw new HTTPException(404, { message: "Reminder not found." }); return c.body(null, 204); });

app.on(["GET", "POST"], "/api/internal/epg/sync", async (c) => {
  const supplied = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!safeSecretEqual(supplied, config.EPG_SYNC_SECRET)) return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid sync credential." } }, 401);
  const country = (c.req.query("country") ?? config.EPG_COUNTRIES.split(",")[0]!).toUpperCase();
  if (!config.EPG_COUNTRIES.split(",").includes(country)) throw new HTTPException(400, { message: "Country is not enabled for synchronization." });
  return c.json({ data: await new EpgService(getDatabase(),createEpgProvider(country)).sync() });
});

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Route not found." } }, 404));

function safeSecretEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left); const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export default app;
