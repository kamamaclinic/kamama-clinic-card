const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function library({owner=false,secret='cron-test'}={}){
 const sent=[];
 const context={module:{exports:{}},URL,console,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://db.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public-test',CRON_SECRET:secret}},require:()=>({createTransport:()=>({sendMail:async m=>sent.push(m)})}),fetch:async()=>({ok:true,json:async()=>({id:owner?'3903aa50-e4db-4165-b673-3a61803f13c7':'unrelated-authenticated-user'})})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/card-email.js'),'utf8'),context);return context.module.exports;
}
test('administrator must be the existing clinic owner, not just any valid login',async()=>{
 const req={headers:{authorization:'Bearer test'}};assert.equal(await library().requireAdmin(req),false);assert.equal(await library({owner:true}).requireAdmin(req),true);assert.equal(await library({owner:true}).requireAdmin({headers:{}}),false);
});
test('cron fails closed and rejects the forgeable x-vercel-cron header',()=>{
 assert.equal(library().cronAuthorized({headers:{'x-vercel-cron':'1'}}),false);
 assert.equal(library({secret:''}).cronAuthorized({headers:{'x-vercel-cron':'1'}}),false);
 assert.equal(library().cronAuthorized({headers:{authorization:'Bearer cron-test'}}),true);
 assert.equal(library().cronAuthorized({headers:{},query:{secret:'cron-test'}}),true);
});
test('gift lookup uses exact code filter and returns no recipient email or other vouchers',async()=>{
 let query;
 const ctx={module:{exports:{}},require:()=>({json:(res,n,b)=>res.status(n).json(b),rest:async(table,q)=>{assert.equal(table,'gift_vouchers');query=q;return [{code:'GIFT-ABC234',recipient_name:'Synthetic',minutes:60,expiry_date:'2099-01-01',from_name:'Synthetic',blessing:'Test',redeemed:false}];}})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/gift.js'),'utf8'),ctx);
 let result;const response={setHeader(){},status(n){this.code=n;return this},json(b){result=b;return b}};
 await ctx.module.exports({method:'GET',query:{code:'GIFT-ABC234'}},response);
 assert.equal(response.code,200);assert.ok(query.includes('&code=eq.GIFT-ABC234&limit=1'));assert.ok(!query.includes('recipient_email'));assert.ok(!JSON.stringify(result).includes('recipient_email'));
 await ctx.module.exports({method:'GET',query:{code:'*'}},response);assert.equal(response.code,404);
});
