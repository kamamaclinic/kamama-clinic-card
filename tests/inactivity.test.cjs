const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {createRequire}=require("node:module");
const {clinicDate,addCalendarMonths,inactivityReminder}=require("../lib/card-inactivity");
const card={id:"synthetic-card",email:"synthetic@example.com",total_minutes:300,used_minutes:60,expires_at:"2027-12-31",purchased_at:"2026-01-01",current_cycle_started_at:"2026-01-01T00:00:00Z",view_token:"synthetic-view-token"};
const tx={id:"visit-one",client_id:card.id,minutes:-60,created_at:"2026-09-25T08:00:00Z"};

test("two calendar months is the default and eligibility starts on the matching clinic date",()=>{
 assert.equal(inactivityReminder(card,tx,undefined,"2026-11-24"),null);
 assert.equal(inactivityReminder(card,tx,undefined,"2026-11-25").dueDate,"2026-11-25");
 assert.equal(inactivityReminder(card,tx,1,"2026-10-25").dueDate,"2026-10-25");
 assert.equal(inactivityReminder(card,tx,3,"2026-11-25"),null);
});
test("calendar month ends clamp correctly and treatment dates use Israel time",()=>{
 assert.equal(addCalendarMonths("2026-12-31",2),"2027-02-28");
 assert.equal(addCalendarMonths("2023-12-31",2),"2024-02-29");
 assert.equal(clinicDate("2026-09-24T22:30:00Z"),"2026-09-25");
});
test("expired, exhausted, archived and never-treated cards are excluded",()=>{
 for(const c of [{...card,expires_at:"2026-11-24"},{...card,used_minutes:300},{...card,archived_at:"2026-11-01"}]) assert.equal(inactivityReminder(c,tx,2,"2026-11-25"),null);
 assert.equal(inactivityReminder(card,null,2,"2026-11-25"),null);
 assert.equal(inactivityReminder(card,{...tx,minutes:300},2,"2026-11-25"),null);
 assert.equal(inactivityReminder(card,{...tx,minutes:0},2,"2026-11-25"),null);
 assert.equal(inactivityReminder(card,{...tx,created_at:null},2,"2026-11-25"),null);
 assert.equal(inactivityReminder(card,{...tx,client_id:"other"},2,"2026-11-25"),null);
});
test("renewal creates a fresh waiting period and settings changes do not re-send the same visit",()=>{
 const renewed={...card,purchased_at:"2026-11-24",current_cycle_started_at:"2026-11-24T08:00:00Z"};
 assert.equal(inactivityReminder(renewed,tx,2,"2026-11-25"),null);
 assert.ok(inactivityReminder(renewed,tx,2,"2027-01-24"));
 assert.equal(inactivityReminder(card,tx,2,"2026-11-25").dedupeKey,inactivityReminder(card,tx,1,"2026-11-25").dedupeKey);
 assert.notEqual(inactivityReminder(card,tx,2,"2026-11-25").dedupeKey,inactivityReminder(card,{...tx,id:"visit-two"},2,"2026-11-25").dedupeKey);
});
function job({enabled=true,items=[card],transactions=[tx],missingSettings=false}={}){
 const data=structuredClone({cards:items,transactions}),reads=[],sent=[],dedupe=new Set();
 const clock=new Date("2026-11-25T10:00:00Z");
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock.getTime()}}
 const nativeRequire=createRequire(path.resolve(__dirname,"../api/card-reminders.js"));
 const context={module:{exports:{}},Date:FixedDate,Intl,console,
 require:name=>name==="./card-email"?{
  cardRemaining:c=>Math.max(0,c.total_minutes-c.used_minutes),
  cronAuthorized:req=>req.headers.authorization==="Bearer synthetic-cron",
  getSettings:async()=>missingSettings?{}:{notify_card_inactivity:enabled,card_inactivity_months:2,card_half_year_days:183,card_expiry_days:30,gift_expiry_days:30},
  validEmail:value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value||""),
  cardMail:(c,type)=>({subject:type,text:String(c.total_minutes-c.used_minutes)}),giftMail:()=>({}),
  rest:async(table,query,options={})=>{
   assert.ok(!options.method||options.method==="GET","No business-record writes allowed");reads.push({table,query});
   if(table==="clients")return structuredClone(data.cards.filter(c=>!c.archived_at));
   if(table==="gift_vouchers")return [];
   assert.equal(table,"transactions");assert.ok(query.includes("minutes=lt.0"));assert.ok(query.includes("limit=1"));
   const url=new URL("https://synthetic.test/"+query),id=url.searchParams.get("client_id").slice(3);
   return structuredClone(data.transactions.filter(t=>t.client_id===id&&t.minutes<0).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,1));
  },
  sendOnce:async payload=>{if(dedupe.has(payload.dedupeKey))return {status:"skipped",reason:"already_sent"};dedupe.add(payload.dedupeKey);sent.push(payload);return {status:"sent"}},
  json:(res,status,body)=>res.status(status).json(body)
 }:name==="../lib/card-inactivity"?(()=>{
  const ctx={module:{exports:{}},Date:FixedDate,Intl};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,"../lib/card-inactivity.js"),"utf8"),ctx);return ctx.module.exports;
 })():nativeRequire(name)};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,"../api/card-reminders.js"),"utf8"),context);
 return {data,reads,sent,async run(authorized=true){const r={};await context.module.exports({method:"GET",headers:authorized?{authorization:"Bearer synthetic-cron"}:{}},{status(n){r.status=n;return this},json(b){r.body=b;return b}});return r;}};
}
test("daily runs send once per last debit, ignore newer loads, and preserve all business records",async()=>{
 const runner=job({transactions:[tx,{...tx,id:"load",minutes:300,created_at:"2026-11-24T10:00:00Z"},{...tx,id:"expiry",minutes:0,created_at:"2026-11-24T11:00:00Z"}]}),before=JSON.stringify(runner.data);
 assert.equal((await runner.run()).status,200);await runner.run();
 assert.equal(runner.sent.length,1);assert.equal(runner.sent[0].notificationType,"inactivity");
 assert.equal(JSON.stringify(runner.data),before);
});
test("disabled settings and missing email never attempt an inactivity notification",async()=>{
 for(const runner of [job({enabled:false}),job({missingSettings:true}),job({items:[{...card,email:""}]})]){
  await runner.run();assert.equal(runner.sent.length,0);assert.equal(runner.reads.filter(r=>r.table==="transactions").length,0);
 }
 const unauthorized=job();assert.equal((await unauthorized.run(false)).status,401);assert.equal(unauthorized.reads.length,0);assert.equal(unauthorized.sent.length,0);
});
test("a recent debit restarts the waiting period",async()=>{
 const runner=job({transactions:[tx,{...tx,id:"new-visit",created_at:"2026-11-24T10:00:00Z"}]});
 await runner.run();assert.equal(runner.sent.length,0);
});
test("inactivity email states exact unused minutes and keeps the booking and personal-card links",()=>{
 const ctx={module:{exports:{}},require:()=>({}),process:{env:{BOOKING_URL:"https://booking.synthetic.test/",APP_BASE_URL:"https://cards.synthetic.test/"}}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,"../api/card-email.js"),"utf8"),ctx);
 const mail=ctx.module.exports.cardMail(card,"inactivity");
 assert.ok(mail.text.includes("240 דקות"));assert.ok(mail.text.includes("https://booking.synthetic.test/"));
 assert.ok(mail.text.includes("https://cards.synthetic.test/card/synthetic-view-token"));
 assert.ok(mail.html.includes("לקביעת טיפול"));
});
test("disabled notifications are silent while successes auto-dismiss and real errors remain visible",async()=>{
 const helpers=await import("../src/notification-notice.mjs");
 assert.equal(helpers.cardNotificationNotice({status:"skipped",reason:"disabled"}),"");
 assert.ok(helpers.cardNotificationNotice({status:"skipped",reason:"missing_email"}).includes("לא הוגדרה"));
 const source=fs.readFileSync(path.resolve(__dirname,"../src/main.jsx"),"utf8");
 const a=source.indexOf("  async function notify("),b=source.indexOf("\nasync function updateClient",a);
 const notices=[],context={sendAdminNotification:async()=>({status:"skipped",reason:"disabled"}),session:{},setEmailNotice:v=>notices.push(v),cardNotificationNotice:helpers.cardNotificationNotice};
 vm.createContext(context);vm.runInContext(source.slice(a,b),context);await context.notify("card-transaction",{id:card.id});
 assert.deepEqual(notices,[""]);
 const start=source.indexOf("  useEffect(()=>{",source.indexOf("  const [emailNotice,setEmailNotice]"));
 const end=source.indexOf("\n\n  const selected",start);
 const effects=[],timers=[],cleared=[];
 const hooks={emailNotice:"הודעת המייל נשלחה.",selectedId:card.id,isTransientCardNotice:helpers.isTransientCardNotice,
 useEffect:fn=>effects.push(fn),setTimeout:(fn,delay)=>{timers.push({fn,delay});return 9},clearTimeout:id=>cleared.push(id),setEmailNotice:v=>notices.push(v)};
 vm.createContext(hooks);vm.runInContext(source.slice(start,end),hooks);
 const cleanup=effects[0]();assert.equal(timers[0].delay,5000);timers[0].fn();assert.equal(notices.at(-1),"");cleanup();assert.deepEqual(cleared,[9]);
 hooks.emailNotice="לא ניתן לשלוח הודעת מייל כרגע.";assert.equal(effects[0](),undefined);assert.equal(timers.length,1);
});
