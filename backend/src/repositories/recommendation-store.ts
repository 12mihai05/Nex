import { and, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { getDatabase, type NexDatabase } from '../db/client.js';
import { contentEmbeddings, userRecommendationCache } from '../db/schema.js';

export interface SemanticStore {
  publicVectors(keys: string[]): Promise<Map<string, number[]>>;
  putPublic(entries: Array<{key: string; vector: number[]}>): Promise<void>;
  privateValue(userId: string, key: string): Promise<unknown>;
  putPrivate(userId: string, key: string, value: unknown): Promise<void>;
}

// Float32 is the embedding provider's native precision. Packing public vectors
// avoids transferring thousands of long decimal strings from Turso on each feed.
export function packVector(vector:number[]) {
  const buffer=Buffer.alloc(vector.length*4);
  vector.forEach((value,i)=>buffer.writeFloatLE(value,i*4));
  return JSON.stringify({format:'f32le',length:vector.length,data:buffer.toString('base64')});
}
export function unpackVector(json:string):number[]|null {
  try {
    const value:unknown=JSON.parse(json);
    if(Array.isArray(value))return value.length>=2&&value.length<=3072&&value.every(n=>typeof n==='number'&&Number.isFinite(n))?value:null;
    if(!value||typeof value!=='object')return null;
    const packed=value as {format?:unknown;length?:unknown;data?:unknown};
    if(packed.format!=='f32le'||typeof packed.length!=='number'||!Number.isInteger(packed.length)||packed.length<2||packed.length>3072||typeof packed.data!=='string'||packed.data.length>17000)return null;
    const buffer=Buffer.from(packed.data,'base64');if(buffer.length!==packed.length*4)return null;
    const vector=Array.from({length:packed.length},(_,i)=>buffer.readFloatLE(i*4));return vector.every(Number.isFinite)?vector:null;
  }catch{return null;}
}

export class RecommendationStore implements SemanticStore {
  constructor(private readonly db: Pick<NexDatabase, 'select'|'insert'|'delete'> = getDatabase()) {}

  async publicVectors(keys: string[]) {
    if (!keys.length) return new Map<string, number[]>();
    const rows = await this.db.select().from(contentEmbeddings).where(and(inArray(contentEmbeddings.key, keys), gt(contentEmbeddings.expiresAt, new Date())));
    return new Map(rows.flatMap(row => {
      const vector=unpackVector(row.vectorJson);return vector?[[row.key,vector] as const]:[];
    }));
  }

  async putPublic(entries: Array<{key: string; vector: number[]}>) {
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    await this.db.delete(contentEmbeddings).where(lt(contentEmbeddings.expiresAt, new Date()));
    for (let i = 0; i < entries.length; i += 80) {
      await this.db.insert(contentEmbeddings).values(entries.slice(i, i + 80).map(e => ({key: e.key, vectorJson: packVector(e.vector), expiresAt})))
        .onConflictDoUpdate({target:contentEmbeddings.key,set:{vectorJson:sql`excluded.vector_json`,expiresAt}});
    }
    await this.db.delete(contentEmbeddings).where(lt(contentEmbeddings.expiresAt, new Date()));
    // Opportunistically prune expired private caches even for inactive users.
    await this.db.delete(userRecommendationCache).where(lt(userRecommendationCache.expiresAt, new Date()));
    // This is a bounded cache of encountered metadata, never a catalog mirror.
    await this.db.delete(contentEmbeddings).where(inArray(contentEmbeddings.key,
      this.db.select({key: contentEmbeddings.key}).from(contentEmbeddings).orderBy(desc(contentEmbeddings.expiresAt)).limit(1000).offset(5000)));
  }

  async privateValue(userId: string, key: string): Promise<unknown> {
    const row = (await this.db.select().from(userRecommendationCache).where(and(eq(userRecommendationCache.userId, userId), eq(userRecommendationCache.key, key), gt(userRecommendationCache.expiresAt, new Date()))).limit(1))[0];
    try { return row ? JSON.parse(row.payloadJson) as unknown : undefined; } catch { return undefined; }
  }

  async putPrivate(userId: string, key: string, value: unknown) {
    const values = {userId, key, payloadJson: JSON.stringify(value), expiresAt: new Date(Date.now() + 7 * 86400000)};
    await this.db.insert(userRecommendationCache).values(values).onConflictDoUpdate({target: [userRecommendationCache.userId, userRecommendationCache.key], set: {payloadJson: values.payloadJson, expiresAt: values.expiresAt}});
    await this.db.delete(userRecommendationCache).where(and(eq(userRecommendationCache.userId, userId), lt(userRecommendationCache.expiresAt, new Date())));
    await this.db.delete(userRecommendationCache).where(and(eq(userRecommendationCache.userId, userId), inArray(userRecommendationCache.key,
      this.db.select({key: userRecommendationCache.key}).from(userRecommendationCache).where(eq(userRecommendationCache.userId, userId)).orderBy(desc(userRecommendationCache.expiresAt)).limit(1000).offset(32))));
  }

  async clearPrivate(userId: string) {
    await this.db.delete(userRecommendationCache).where(eq(userRecommendationCache.userId, userId));
  }
}
