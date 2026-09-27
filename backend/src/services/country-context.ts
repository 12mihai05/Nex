const names:Record<string,string>={"united kingdom":"GB",uk:"GB",britain:"GB",spain:"ES",france:"FR",switzerland:"CH",italy:"IT",germany:"DE",moldova:"MD",romania:"RO",bulgaria:"BG"};
const adjectives:Record<string,string>={british:"GB",spanish:"ES",french:"FR",swiss:"CH",italian:"IT",german:"DE",moldovan:"MD",romanian:"RO",bulgarian:"BG"};
export const countryTimezones:Record<string,string>={RO:"Europe/Bucharest",BG:"Europe/Sofia",GB:"Europe/London",ES:"Europe/Madrid",FR:"Europe/Paris",CH:"Europe/Zurich",IT:"Europe/Rome",DE:"Europe/Berlin",MD:"Europe/Chisinau"};

// Explicit request only: a title mentioning France or a preference for French
// films must not silently change the viewer's availability/EPG region.
export function explicitCountry(message:string):string|null {
  const lower=message.toLowerCase();
  const namesPattern=Object.keys(names).join("|");
  const match=lower.match(new RegExp(`\\b(?:in|for)\\s+(?:the\\s+)?(${namesPattern})\\b`));
  if(match) return names[match[1]!]!;
  const tv=lower.match(new RegExp(`\\b(${namesPattern}|${Object.keys(adjectives).join("|")})\\s+(?:tv|television|channels|schedule)\\b`));
  return tv ? names[tv[1]!]??adjectives[tv[1]!]??null : null;
}
