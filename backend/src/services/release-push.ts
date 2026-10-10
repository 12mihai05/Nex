import {createSign} from 'node:crypto';
import {z} from 'zod';
import type {PushSender} from './release-tracking.js';

// Service-account material is read only by the scheduled worker, never sent to clients.
const credentials=z.object({project_id:z.string().regex(/^[a-z0-9-]+$/),client_email:z.string().email(),private_key:z.string().min(100)});
export class FcmReleaseSender implements PushSender {
  private auth?:{token:string;until:number};
  constructor(private account:z.infer<typeof credentials>){}
  static fromEnvironment(){
    const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if(!raw)throw new Error('FIREBASE_NOT_CONFIGURED');
    return new FcmReleaseSender(credentials.parse(JSON.parse(raw)));
  }
  private async accessToken(){
    if(this.auth&&this.auth.until>Date.now())return this.auth.token;
    const now=Math.floor(Date.now()/1000);
    const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
    const unsigned=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:this.account.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})}`;
    const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();
    const assertion=`${unsigned}.${signer.sign(this.account.private_key,'base64url')}`;
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('PUSH_AUTH_FAILED');
    const data=z.object({access_token:z.string(),expires_in:z.number()}).parse(await response.json());
    this.auth={token:data.access_token,until:Date.now()+Math.max(0,data.expires_in-60)*1000};return data.access_token;
  }
  async send(token:string,title:string,body:string,data:Record<string,string>):Promise<'sent'|'invalid'> {
    const response=await fetch(`https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,{
      method:'POST',headers:{Authorization:`Bearer ${await this.accessToken()}`,'Content-Type':'application/json'},
      body:JSON.stringify({message:{token,notification:{title,body},data,android:{ttl:'86400s',notification:{tag:data.eventId,channel_id:'nex_releases'}},apns:{headers:{'apns-collapse-id':data.eventId}}}}),signal:AbortSignal.timeout(15000)});
    if(response.ok)return 'sent';
    const error=await response.json().catch(()=>null) as {error?:{details?:Array<{errorCode?:string}>}}|null;
    if(error?.error?.details?.some(d=>d.errorCode==='UNREGISTERED'))return 'invalid';
    throw new Error('PUSH_DELIVERY_FAILED');
  }
}
