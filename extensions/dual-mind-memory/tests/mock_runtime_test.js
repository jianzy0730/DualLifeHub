const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

class MemoryStore {
  constructor(){ this.items = new Map(); this.links=[]; }
  async create(o){ if(this.items.has(o.title)) throw new Error('duplicate title'); this.items.set(o.title,{title:o.title,content:o.content,contentType:o.contentType,source:o.source,folderPath:o.folderPath,tags:o.tags,importance:.5,credibility:.5,createdAt:new Date().toISOString()}); return 'ok'; }
  async update(o){ const x=this.items.get(o.oldTitle); if(!x) throw new Error('not found '+o.oldTitle); if(o.newTitle && o.newTitle!==o.oldTitle){ this.items.delete(o.oldTitle); x.title=o.newTitle; this.items.set(o.newTitle,x); } for(const k of ['content','contentType','source','folderPath','tags','importance','credibility']) if(o[k]!==undefined) x[k]=o[k]; return 'ok'; }
  async getByTitle(o){ const x=this.items.get(o.title); if(!x) throw new Error('not found'); return x.content; }
  async query(o){ let a=[...this.items.values()].filter(x=>!o.folderPath || x.folderPath===o.folderPath); if(o.query && o.query!=='*'){ const q=o.query.toLowerCase(); a=a.filter(x=>(x.title+' '+x.content).toLowerCase().includes(q.split(/\s+/)[0])); }
    return {memories:a.slice(0,o.limit||20).map(x=>({...x}))}; }
  async deleteMemory(o){ if(!this.items.delete(o.title)) throw new Error('not found'); return 'ok'; }
  async link(o){ this.links.push(o); return {id:this.links.length}; }
}

async function runTool(ctx, name, params){ ctx.__last=null; ctx.exports[name](params); for(let i=0;i<100 && ctx.__last===null;i++) await new Promise(r=>setTimeout(r,5)); if(ctx.__last===null) throw new Error('no complete for '+name); return ctx.__last; }

function hash32(text){ let h=2166136261>>>0; for(const ch of String(text||'')){ h^=ch.charCodeAt(0); h=Math.imul(h,16777619)>>>0; } return h>>>0; }
function unitRandom(seed){ return hash32(seed)/4294967296; }
function deterministicForgetId(){
  const day=new Date().toISOString().slice(0,10);
  for(let i=0;i<10000;i+=1){
    const id=`test_mem_${i}`;
    if(unitRandom(`${id}|${day}|0`)<0.95) return id;
  }
  throw new Error('could not find deterministic forgetting seed');
}

(async()=>{
 const store=new MemoryStore();
 const ctx={console, exports:{}, Tools:{Memory:store}, getCallerCardId:()=> 'card-1', complete:(x)=>ctx.__last=x, setTimeout, clearTimeout, Math, Date, JSON, String, Number, Boolean, Array, Object, Set, Promise, Error};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(ROOT, 'packages', 'dual_mind_memory.js'), 'utf8'),ctx);
 let r;
 r=await runTool(ctx,'remember',{title:'地铁晕倒',summary:'用户感冒时在地铁上差点晕倒',details:'那天地铁很挤，用户在感冒。',status:'active',importance:0,confidence:.9,half_life_days:1,observation_days:7}); console.log('remember',r);
 r=await runTool(ctx,'recall',{query:'地铁',limit:5}); console.log('recall',r.data.memories.length);
 r=await runTool(ctx,'mark_memory',{title:'地铁晕倒',status:'uncertain',reason:'细节待确认'}); console.log('mark',r.data.status);
 r=await runTool(ctx,'revise_memory',{title:'地铁晕倒',new_summary:'用户感冒时在拥挤地铁上明显不适',reason:'修正“差点晕倒”的确定性',confidence:.6}); console.log('revise',r.data.revision_count);
 // Make memory very old and active with zero importance so forgetting is nearly certain.
 const item=store.items.get('[DMM] 地铁晕倒'); const p=JSON.parse(item.content); p.status='active'; p.memory_id=deterministicForgetId(); p.last_recalled_at=Date.now()-365*86400000; p.created_at=p.last_recalled_at; p.importance=0; p.half_life_days=1; p.recall_count=0; item.content=JSON.stringify(p); item.folderPath='dual_mind_memory/active';
 r=await runTool(ctx,'run_forgetting_cycle',{force:true}); console.log('cycle',r.data.evaluated,r.data.forgotten,r.data.purged,r.data.decisions);
 const forgotten=[...store.items.values()].find(x=>x.folderPath==='dual_mind_memory/forgotten'); if(!forgotten) throw new Error('not forgotten');
 r=await runTool(ctx,'restore_memory',{title:forgotten.title,reason:'重新确认重要'}); console.log('restore',r.success,r.data.status);
 r=await runTool(ctx,'inspect_forgetting_log',{query:'*',limit:20}); console.log('logs',r.data.logs.map(x=>x.event_type));
 r=await runTool(ctx,'explain_memory',{title:'地铁晕倒'}); console.log('explain',r.data.status,typeof r.data.current_forget_probability);

 // Test main hook registration and recall injection.
 const regs={};
 const env={};
 const ctx2={console,exports:{},Tools:{Memory:store,SoftwareSettings:{writeEnvironmentVariable:async(k,v)=>{env[k]=v;}}},getEnv:(k)=>env[k],getCallerCardId:()=> 'card-1',ToolPkg:{registerInputMenuTogglePlugin:x=>regs.toggle=x,registerSystemPromptComposeHook:x=>regs.system=x,registerPromptFinalizeHook:x=>regs.final=x},Math,Date,JSON,String,Number,Boolean,Array,Object,Set,Promise,Error};
 vm.createContext(ctx2); vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8'),ctx2); ctx2.exports.registerToolPkg();
 const hooked=await regs.final.function({eventName:'before_send_to_model',eventPayload:{processedInput:'地铁',preparedHistory:[{kind:'USER',content:'地铁'}],metadata:{activePrompt:{id:'card-1'}}}});
 if(!hooked || !hooked.preparedHistory || hooked.preparedHistory[0].kind!=='SYSTEM') throw new Error('hook failed');
 console.log('hook ok', hooked.preparedHistory[0].content.slice(0,50));
 console.log('ALL TESTS PASSED');
})();
