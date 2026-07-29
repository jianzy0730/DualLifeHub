const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.resolve(__dirname,'..');
let stored='';
let chatCalls=0;
const files={
 read:async()=>{if(!stored)throw new Error('missing');return{content:stored}},
 mkdir:async()=>({}),
 write:async(_p,c)=>{stored=String(c);return{}}
};
const uiCtx={
 console,exports:{},ToolPkg:{getConfigDir:()=>'/mock/config',readResource:async()=>'/mock/index.html'},
 Tools:{Files:files,Chat:{sendMessage:async()=>{chatCalls+=1;throw new Error('must not call LLM')}}},
 getChatId:()=> 'chat-1',getCallerCardId:()=> 'role-1',
 Number,String,Boolean,Array,Object,JSON,Math,Date,Promise,Error,Set,setTimeout,clearTimeout
};
vm.createContext(uiCtx);
vm.runInContext(fs.readFileSync(path.join(root,'ui/pig_pet.ui.js'),'utf8'),uiCtx);
(async()=>{
 const result=await uiCtx.exports.interact({type:'tail_pull',distance:44,duration_ms:510});
 if(!result.success)throw new Error('interaction failed');
 if(chatCalls!==0)throw new Error('touch interaction called LLM');
 const d=result.data.decision;
 if(d.actions.join(',')!=='tail_snap,recoil,shake')throw new Error('local tail action failed');
 if(result.data.state.affection!==48||result.data.state.energy!==78)throw new Error('state update failed');
 let state=JSON.parse(stored);
 if(state.pending_events.length!==1||state.pending_events[0].type!=='tail_pull')throw new Error('event queue failed');
 if(state.pending_events[0].role_id!=='role-1')throw new Error('role context missing');

 const regs={};
 const mainCtx={
  console,exports:{},require:()=>({default:{}}),ToolPkg:{getConfigDir:()=>'/mock/config',registerUiRoute:()=>{},registerNavigationEntry:()=>{},registerToolboxUiModule:()=>{},registerPromptFinalizeHook:x=>{regs.final=x}},
  Tools:{Files:files},Icons:{SportsEsports:'game'},getCallerCardId:()=> 'role-1',
  Number,String,Boolean,Array,Object,JSON,Math,Date,Promise,Error,Set,setTimeout,clearTimeout
 };
 vm.createContext(mainCtx);
 vm.runInContext(fs.readFileSync(path.join(root,'main.js'),'utf8'),mainCtx);
 mainCtx.exports.registerToolPkg();
 const hooked=await regs.final.function({eventName:'before_send_to_model',eventPayload:{preparedHistory:[{kind:'USER',content:'你在干嘛'}],metadata:{activePrompt:{id:'role-1'}}}});
 if(!hooked||!hooked.preparedHistory)throw new Error('prompt hook returned nothing');
 const injected=hooked.preparedHistory.find(x=>x.kind==='SYSTEM'&&String(x.content).includes('双生猪猪身体互动记录'));
 if(!injected||!injected.content.includes('揪了你的卷尾巴'))throw new Error('tail event not injected');
 state=JSON.parse(stored);
 if(state.pending_events.length!==0||state.recent_events.length!==1)throw new Error('delivery queue transition failed');
 const second=await regs.final.function({eventName:'before_send_to_model',eventPayload:{preparedHistory:[{kind:'USER',content:'第二句'}],metadata:{activePrompt:{id:'role-1'}}}});
 if(second!==null)throw new Error('delivered events injected twice');
 console.log('MOCK RUNTIME PASSED');
})().catch(e=>{console.error(e);process.exit(1)});
