import type { ChatBlock } from "../domain/types.js";
import { FixtureTmdbRepository, type TmdbRepository } from "../repositories/tmdb-repository.js";
import { UserRepository } from "../repositories/user-repository.js";
import { rankCandidates } from "./recommendation.js";
import {titleKey} from "./recommendation.js";
import { resolveDisplayedReference } from "./reference-resolution.js";
import { isPersistentPreference, fallbackIntent } from "./intent.js";
import { AiService } from "./ai.js";
import { EpgService } from "./epg/service.js";
import { generateCandidates } from "./candidates.js";
import { tvWindow } from "./tv-window.js";
import { explicitCountry,countryTimezones } from "./country-context.js";
import {titleOpinionAction} from "./title-opinion.js";
import {addSuitabilityCaution} from "./composition-intro.js";

export class ChatService {
  constructor(
    private readonly users = new UserRepository(),
    private readonly catalog: TmdbRepository = new FixtureTmdbRepository(),
    private readonly ai = new AiService(),
    private readonly epg = new EpgService(),
  ) {}

  async respond(userId: string, message: string, requestedSessionId?: string): Promise<{ sessionId: string; blocks: ChatBlock[] }> {
    const sessionId = requestedSessionId ?? await this.users.createConversation(userId);
    await this.users.addConversationMessage(userId, sessionId, "user", message);
    const action = await this.tryAction(userId, sessionId, message);
    if (action) {
      const blocks: ChatBlock[] = [action];
      await this.users.addConversationMessage(userId, sessionId, "assistant", action.content, blocks);
      return { sessionId, blocks };
    }

    const storedState = await this.users.getRecommendationState(userId);
    const requestedCountry=explicitCountry(message);
    const state={...storedState,country:requestedCountry??storedState.country,timezone:requestedCountry?countryTimezones[requestedCountry]??storedState.timezone:storedState.timezone};
    const savedContext = await this.users.getSessionContext(userId,sessionId);
    const previous = savedContext.country && savedContext.country!==state.country ? undefined : savedContext.filter as import("../domain/types.js").FilterQuery | undefined;
    const query = await this.ai.parseIntent(message,previous).catch(() => undefined);
    const safeQuery = query ?? fallbackIntent(message,previous);
    // 'Tonight' alone is temporal context, not a request to switch from streaming to EPG.
    const broadcastMessage=message.replace(/\blive[- ]action\b/gi,"");
    if (!/\b(tv|television|broadcast|channel|live)\b/i.test(broadcastMessage) && !previous?.tvWindow) safeQuery.tvWindow=null;
    if (/\b(tv|television|broadcast|channel)\b/i.test(message)) {
      if (/\btomorrow\b/i.test(message)) safeQuery.tvWindow="tomorrow";
      else if (/\blive|right now\b/i.test(message)) safeQuery.tvWindow="live";
      else if (/\btonight\b/i.test(message)) safeQuery.tvWindow="tonight";
    }
    await this.users.setSessionContext(userId,sessionId,{filter:safeQuery,country:state.country});
    if (safeQuery.tvWindow || /\b(tv|television|live)\b/i.test(broadcastMessage)) {
      const window=tvWindow(safeQuery.tvWindow,state.timezone);
      const programs = (await this.epg.listWindow(window.start,window.end,state.country,userId)).filter(p=>safeQuery.tvWindow!=="tomorrow"||p.startAt>=window.start).slice(0,12);
      const intro = programs.length ? `Here’s the ${safeQuery.tvWindow ?? "upcoming"} TV schedule for ${state.country}.` : "I couldn’t find TV entries in the requested EPG window.";
      const blocks: ChatBlock[] = programs.length
        ? [{ type: "text", content: intro }, { type: "tv_carousel", items: programs }, { type: "quick_actions", actions: ["Only movies", "Starting in the next hour", "Something on streaming"] }]
        : [{ type: "empty_state", title: "No TV schedule available", message: "Streaming discovery is still available." }];
      const assistantId = await this.users.addConversationMessage(userId, sessionId, "assistant", intro, blocks);
      await this.users.saveDisplayedReferences(userId, sessionId, assistantId, programs.map((program) => ({ contentType: "liveEvent" as const, externalId: program.id, metadata: { title: program.title, startsAt: program.startAt.toISOString() } })));
      return { sessionId, blocks };
    }
    const candidates = safeQuery.intent === "TITLE_LOOKUP" || safeQuery.intent === "AVAILABILITY_LOOKUP"
      ? await this.catalog.search({ query: safeQuery.query, region: state.country })
      : await generateCandidates(this.catalog,state,safeQuery);
    const reviewConcepts=safeQuery.intent==="DISCOVERY"&&(safeQuery.keywords.length>0||safeQuery.moods.length>0||safeQuery.excludedMoods.length>0);
    const ranked = rankCandidates(candidates, safeQuery, { ...state, viewerIds: [userId], temporaryMoods: safeQuery.moods }, reviewConcepts?12:8);
    const composed = await this.ai.compose(message, ranked,reviewConcepts,safeQuery).catch(() => ({ intro: ranked.length ? "These are catalog-based candidates; I couldn't verify the more nuanced story fit just now." : "I couldn't find a strong match for that yet.", quickActions: ["Try something lighter", "Under 90 minutes"],selectedKeys:undefined }));
    const delivered=(composed.selectedKeys?ranked.filter(r=>composed.selectedKeys!.includes(titleKey(r.item))):ranked).slice(0,8);
    await this.users.recordRecommendations(userId,delivered,sessionId);
    const selected = delivered.map((entry) => entry.item);
    composed.intro=addSuitabilityCaution(composed.intro,message,selected.length>0);
    const blocks: ChatBlock[] = [
      { type: "text", content: composed.intro },
      ...(selected.length ? [{ type: "movie_carousel" as const, items: selected }] : [{ type: "empty_state" as const, title: "No grounded matches", message: "Try loosening a provider or runtime constraint." }]),
      { type: "quick_actions", actions: composed.quickActions },
    ];
    const assistantId = await this.users.addConversationMessage(userId, sessionId, "assistant", composed.intro, blocks);
    await this.users.saveDisplayedItems(userId, sessionId, assistantId, selected);
    return { sessionId, blocks };
  }

  private async tryAction(userId: string, sessionId: string, message: string): Promise<Extract<ChatBlock, { type: "confirmation" }> | null> {
    const lower = message.toLowerCase();
    const wantAction=/\bwant to (?:see|watch) (?:the (?:first|second|third|fourth|fifth)|this|that)\b|\bwant to see list\b/.test(lower);
    // Mentioning viewing history in a discovery request is not a mutation command.
    if (/^(?:please\s+)?(?:recommend|suggest|find|give me|show me|what should)\b/.test(lower)) return null;
    if (isPersistentPreference(message)&&!/\b(first|second|third|fourth|fifth|this one|that one)\b/.test(lower)) {
      const extracted = await this.ai.extractTaste(message, []).catch(() => ({ summary: "Preference saved.", signals: [] }));
      if (!extracted.signals.length) return { type: "confirmation", content: "I couldn’t extract a clear lasting preference. You can edit it in Your Taste." };
      await this.users.upsertTaste(userId, extracted.signals.map((s)=>({ ...s, source: "chat_explicit" })));
      return { type: "confirmation", content: "I’ve saved that as a long-term taste preference. It will shape Browse as well as Chat." };
    }
    if (!wantAction&&!/\b(watchlist|watched|seen|meh|rating|opinion|remind|reminder)\b/.test(lower) && !/^(?:please\s+)?(?:i\s+)?(?:add|remove|cancel|like|liked|dislike|disliked|hated|super.?like)\b/.test(lower)) return null;
    const recent = await this.users.recentDisplayedItems(userId, sessionId);
    const references = lower.includes("first and third")
      ? [recent.find((item) => item.position === 1), recent.find((item) => item.position === 3)].filter(Boolean)
      : [resolveDisplayedReference(message, recent) ?? (recent.length === 1 ? recent[0] : null)].filter(Boolean);
    if (!references.length) return { type: "confirmation", content: "I couldn’t tell which displayed title you meant. Try “the second one”." };
    const completed: string[] = [];
    for (const reference of references) {
      if (!reference) continue;
      if (/cancel|remove/.test(lower) && /remind/.test(lower) && reference.contentType === "liveEvent") {
        const saved=(await this.users.listReminders(userId)).find(r=>r.epgProgramId===reference.externalId);
        if (!saved) return {type:"confirmation",content:"There is no saved reminder for that programme."};
        await this.users.deleteReminder(userId,saved.id);
        return {type:"confirmation",content:"That reminder has been cancelled.",action:{type:"cancelReminder",id:saved.id,epgProgramId:reference.externalId}};
      }
      if (/remind/.test(lower) && reference.contentType === "liveEvent") {
        const offsetMatch = lower.match(/(\d+)\s*minutes? before/);
        const offsetMinutes = offsetMatch ? Number(offsetMatch[1]) : 10;
        const reminder = await this.users.createReminder(userId, reference.externalId, offsetMinutes);
        return { type: "confirmation", content: `Reminder saved for ${reminder.title}; your device will confirm notification scheduling.`, action: { type: "setReminder", id: reminder.id, epgProgramId:reminder.epgProgramId, title: reminder.title, startsAt: reminder.startsAt.toISOString(), offsetMinutes } };
      }
      const mediaType = reference.contentType === "series" ? "series" : "movie";
      const state = await this.users.getRecommendationState(userId);
      const item = await this.catalog.getTitle(mediaType, Number(reference.externalId), state.country, state.ownedProviderIds);
      if (!item) continue;
      const opinion=titleOpinionAction(message);
      if(opinion.seen!==undefined){
        if(opinion.seen)await this.users.markWatched(userId,item);
        else await this.users.removeWatched(userId,item.mediaType,item.id);
        completed.push(`${item.title}: ${opinion.seen?"marked seen":"seen mark removed"}`);
      }
      if(opinion.reaction!==undefined){
        if(opinion.reaction===null)await this.users.clearFeedback(userId,item.mediaType,item.id);
        else {await this.users.applyFeedback(userId,item,opinion.reaction);}
        completed.push(`${item.title}: ${opinion.reaction===null?"opinion cleared":opinion.reaction.replace("_"," ")}`);
      }
      if (/\b(remove|don't|do not|no longer)\b/.test(lower) && (/watchlist/.test(lower)||wantAction)) { await this.users.removeWatchlist(userId,item.mediaType,item.id); completed.push(`${item.title} was removed from your Want to see list`); }
      else if (wantAction||/watchlist/.test(lower) || /^add\b/.test(lower)) { await this.users.addWatchlist(userId, item); completed.push(`${item.title} was added to your Want to see list`); }
    }
    return completed.length ? { type: "confirmation", content: `${completed.join("; ")}.` } : null;
  }
}
