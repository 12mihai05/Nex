import {z} from 'zod';
export const tvPlanSchema=z.object({
  mode:z.enum(['recommend','schedule','next','title_airings','channel_overview','channel_summary']),
  continuation:z.boolean().describe('True for more/different results of the same request. Preserve channel, date, goal and time. False for a new topic or explicit repeat.'),
  country:z.string().regex(/^[A-Z]{2}$/).nullable().describe('Explicitly requested country, or retained country for a contextual follow-up. Null for a fresh question using the profile country.'),
  channelIds:z.array(z.string()).max(4),
  window:z.enum(['live','tonight','tomorrow']),
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe('Explicit local date YYYY-MM-DD, otherwise null.'),
  time:z.string().nullable().describe('Explicit local clock HH:mm, otherwise null. Do not invent a clock for tonight.'),
  anchorId:z.string().nullable().describe('Verified broadcast ID from context for next-after-this, otherwise null.'),
  title:z.string().nullable().describe('Movie/series title for title_airings, resolved from conversation if needed.'),
  year:z.number().int().nullable(),
  goal:z.string().max(500).describe('Current viewing constraints, including retained follow-up constraints; not durable Taste.'),
  clarification:z.string().nullable(),
});
export type TvPlan=z.infer<typeof tvPlanSchema>;
