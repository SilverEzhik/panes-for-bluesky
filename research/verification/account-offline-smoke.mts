/** API behavior smoke, separate from UI layout tests.
 * Start Vite: npm run dev -- --host 127.0.0.1
 * Run: npm exec --yes --package tsx -- tsx research/verification/account-offline-smoke.mts
 * PANELS_DEV_URL can point at another Vite server. No real credentials or writes.
 */
import { chromium } from '@playwright/test';
import { mockBluesky, me } from '../../tests/fixtures.ts';
const browser = await chromium.launch({headless:true});
const context = await browser.newContext();
const page = await context.newPage();
const api = await mockBluesky(page);
await page.goto(process.env.PANELS_DEV_URL ?? 'http://127.0.0.1:5173/');
const initial = await page.evaluate(async({handle}) => {
 const {BlueskyClient} = await import('/src/lib/bluesky.ts');
 const win=window as any; win.Client=BlueskyClient; win.client=new BlueskyClient();
 const user=await win.client.login(handle,'test-app-password');
 const home=await win.client.homeFeed(); win.savedModeration=JSON.stringify(home.items[0].moderation); const notifications=await win.client.notifications();
 await win.client.profile(user.did); await win.client.thread(home.items[0].uri);
 return {connection:user.connection,home:home.items.length,notifications:notifications.items.length};
},{handle:me.handle});
await context.setOffline(true);
// Route handlers remain fulfilled even when context is offline; navigator.onLine
// must therefore short-circuit all network requests in the offline path.
const count=api.requests.length;
const offline=await page.evaluate(async()=>{
 const win=window as any; win.offline=new win.Client();
 const user=await win.offline.restoreSession(); const home=await win.offline.homeFeed();
 const notifications=await win.offline.notifications(); const thread=await win.offline.thread(home.items[0].uri);
 let rejected=false;try{await win.offline.publish('Do not send offline');}catch{rejected=true;}
 return {connection:user.connection,home:home.items.length,saved:home.offline&&!!home.savedAt,notificationsOffline:notifications.offline,threadOffline:thread.offline,moderationPreserved:win.savedModeration===JSON.stringify(home.items[0].moderation),rejected};
});
if(api.requests.length!==count)throw Error('Offline path issued requests');
await context.setOffline(false);
const online=await page.evaluate(async()=>{
 const win=window as any; const user=await win.offline.reconnect();
 const post=await win.offline.publish('Confirmed after reconnect');
 return {connection:user.connection,posted:post.uri.includes('/app.bsky.feed.post/')};
});
await context.setOffline(true);
const isolation=await page.evaluate(async()=>{
 const win=window as any; const key='sliding-panels.bluesky-session';
 const original=localStorage.getItem(key)!; const saved=JSON.parse(original);
 saved.session.did='did:plc:bbbbbbbbbbbbbbbbbbbbbbbb'; saved.session.handle='another.bsky.social';
 localStorage.setItem(key,JSON.stringify(saved));
 const other=new win.Client();const user=await other.restoreSession();
 let rejected=false;try{await other.homeFeed();}catch{rejected=true;}
 localStorage.setItem(key,original);
 win.expiring=new win.Client();await win.expiring.restoreSession();
 return {otherDid:user.did,otherFeedRejected:rejected};
});
await context.setOffline(false);api.failLogin=true;
const expired=await page.evaluate(async()=>{
 const win=window as any;const events:any[]=[];win.expiring.subscribeSession((u:any)=>events.push(u));
 const result=await win.expiring.reconnect();let rejected=false;try{await win.expiring.homeFeed();}catch{rejected=true;}
 return {result,session:win.expiring.session,rejected,nullEmitted:events.includes(null)};
});
if(!isolation.otherFeedRejected||expired.session!==null||!expired.nullEmitted)throw Error('Isolation or expiry failed');
if(initial.connection!=='verified'||offline.connection!=='offline'||!offline.saved||!offline.rejected||!offline.moderationPreserved||online.connection!=='verified'||!online.posted)throw Error('Offline/reconnection assertions failed');
console.log(JSON.stringify({transport:'Mocked XRPC; real Chromium navigator, IndexedDB, and client SDK',initial,offline,online,isolation,expired,refreshCalls:api.requests.filter(r=>r.endpoint==='com.atproto.server.refreshSession').length,writeCalls:api.requests.filter(r=>r.endpoint==='com.atproto.repo.createRecord').length}));
await browser.close();
