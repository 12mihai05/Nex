export function chatCapabilityReply(message:string):string|null {
  const plain=message.toLowerCase();
  if(/\b(can|could|will|able|possible)\b/.test(plain)&&/\b(change|update|save|learn|remember)\b/.test(plain)&&/\b(taste|preferences?|what i like|what i don't like|what i like and what not)\b/.test(plain))
    return 'Yes. Tell me what you like or dislike, and I can remember it for future recommendations. I’ll tell you what changed. Requests just for tonight stay temporary.';
  if(/\bwhat (?:can|could) you do\b|\bhow (?:do i|can i) use (?:you|this chat)\b/i.test(message))
    return 'I can recommend films and series, explain your saved Taste, check TV schedules and upcoming releases, and answer entertainment questions. I can also prepare library changes, Taste corrections and TV reminders for you to confirm. Follow up on a card or ask for more choices. If a title is ambiguous or a source has no listing, I’ll say so.';
  return null;
}
