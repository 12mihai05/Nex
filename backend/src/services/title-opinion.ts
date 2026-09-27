export function titleOpinionAction(message:string) {
  const text=message.toLowerCase();
  const viewingNegated=/\b(?:not|never|haven't|haven’t|have not)\s+(?:yet\s+)?(?:seen|watched)\b|\b(?:not sure|don't know|do not know)[^,.]{0,25}\b(?:seen|watched)\b/.test(text);
  const undoSeen=/\b(?:unmark|undo|remove)\b.*\b(?:seen|watched|history)\b/.test(text);
  const seen=undoSeen?false:!viewingNegated&&/\b(?:seen|watched)\b/.test(text)?true:undefined;
  let reaction:"like"|"super_like"|"dislike"|"meh"|null|undefined;
  if(/\b(?:clear|remove)\b.*\b(?:rating|opinion|reaction|feedback)\b/.test(text))reaction=null;
  else if(/\b(?:dislike|disliked|hated|hate|didn't like|did not like)\b/.test(text))reaction="dislike";
  else if(/\bmeh\b/.test(text))reaction="meh";
  else if(/\bsuper[- ]?like(?:d)?\b/.test(text))reaction="super_like";
  else if(/\blike(?:d)?\b/.test(text)&&!/\b(?:don't|do not|not sure|didn't|did not)\b/.test(text))reaction="like";
  return {seen,reaction};
}
