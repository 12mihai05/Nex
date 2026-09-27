import "../src/env.js";
import { readdir,readFile } from "node:fs/promises";
import { join,relative } from "node:path";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../../",import.meta.url));
const needles=Object.entries(process.env).filter(([k,v])=>/^(OPENAI_API_KEY|TMDB_READ_ACCESS_TOKEN|TURSO_AUTH_TOKEN|BETTER_AUTH_SECRET|NEX_INVITE_CODE|EPG_SYNC_SECRET|VERCEL_TOKEN)$/.test(k) && v && v.length>=6).map(([,v])=>v!);
const matches:string[]=[]; let checked=0;
async function scan(dir:string) {
  for(const e of await readdir(dir,{withFileTypes:true})) {
    if ([".git",".tooling","node_modules",".dart_tool"].includes(e.name) || e.name.startsWith(".env") || /\.db(?:-|$)/.test(e.name)) continue;
    const path=join(dir,e.name);
    if(e.isDirectory()) { await scan(path); continue; }
    if(!/\.(?:ts|js|json|dart|md|html|yaml|yml|xml|sql|txt|map)$/.test(e.name)) continue;
    const content=await readFile(path,"utf8"); checked++;
    if(needles.some((n)=>content.includes(n))) matches.push(relative(root,path));
  }
}
await scan(root);
console.log(JSON.stringify({checkedFiles:checked,secretMatchFiles:matches,credentialValuesPrinted:false}));
if(matches.length) process.exitCode=1;
