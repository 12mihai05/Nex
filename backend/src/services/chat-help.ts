export function chatCapabilityReply(message:string):string|null {
  const plain=message.toLowerCase();
  if(/\b(can|could|will|able|possible)\b/.test(plain)&&/\b(change|update|save|learn|remember)\b/.test(plain)&&/\b(taste|preferences?|what i like|what i don't like|what i like and what not)\b/.test(plain))
    return 'Yes. Tell me your lasting likes and dislikes—story ideas, genres, moods or other preferences—and I can update your taste. For example: “I generally love underdog stories, but dislike graphic violence.” I’ll tell you when a preference is saved. Wishes just for tonight stay temporary. This question has not changed your taste.';
  if(/\bwhat (?:can|could) you do\b|\bhow (?:do i|can i) use (?:you|this chat)\b/i.test(message))
    return 'I can find movies and series for your taste, check TV schedules by country/channel/time, update lasting preferences, and prepare watchlist, Seen or rating changes for you to confirm. I can also prepare TV reminders with the channel and advance minutes. Ask one clear task at a time; ambiguous titles or missing TV listings need clarification.';
  return null;
}
