import {z} from 'zod';
export const tvPlanSchema=z.object({
  mode:z.enum(['recommend','schedule','next','title_airings','channel_overview','channel_summary']),
  pagination:z.enum(['first_page','more']).describe('more ONLY for additional/different options from the SAME result set. Contextual follow-ups, what comes next, and asking what is on now again are first_page. Context/reference continuity does not mean pagination.'),
  country:z.string().regex(/^[A-Z]{2}$/).nullable().describe('Explicitly requested country, or retained country for a contextual follow-up. Null for a fresh question using the profile country.'),
  channelIds:z.array(z.string()).max(4).describe('Empty means all available channels in the country; no channel selection is required for general recommendations or title airings.'),
  window:z.enum(['live','tonight','tomorrow']),
  horizonHours:z.number().int().min(1).max(48).nullable().optional().describe('For an explicitly requested rolling window such as the next three hours. Null otherwise. Starts at the server clock, not midnight.'),
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe('Explicit local date YYYY-MM-DD, otherwise null.'),
  time:z.string().nullable().describe('Explicit local clock HH:mm, otherwise null. Do not invent a clock for tonight.'),
  anchorId:z.string().nullable().describe('Verified broadcast ID from context for next-after-this, otherwise null.'),
  title:z.string().nullable().describe('Movie/series title for title_airings, resolved from conversation if needed.'),
  year:z.number().int().nullable(),
  goal:z.string().max(500).describe('Current viewing constraints, including retained follow-up constraints; not durable Taste.'),
  clarification:z.string().nullable(),
});
export type TvPlan=z.infer<typeof tvPlanSchema>;
