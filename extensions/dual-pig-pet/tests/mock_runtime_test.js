const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.resolve(__dirname,'..');
let stored='';
let sentPrompt='';
const ctx={
  console,
  exports:{},
  ToolPkg:{getConfigDir:()=>'/mock/config',readResource:async()=>'/mock/index.html'},
  Tools:{
    Files:{
      read:async()=>{if(!stored)throw new Error('missing');return{content:stored}},
      mkdir:async()=>({}),
      write:async(_p,c)=>{stored=String(c);return{}}
    },
    Chat:{
      sendMessage:async(prompt,chatId,roleId,_sender,options)=>{
        sentPrompt=prompt;
        if(chatId!=='chat-1'||roleId!=='role-1')throw new Error('context not forwarded');
        if(options.persist_turn!==false||options.hide_user_message!==true)throw new Error('wrong send options');
        return{aiResponse:'```json\n{"reply":"谁准你揪我尾巴了。","emotion":"annoyed","actions":[{"name":"tail_snap"},{"name":"recoil"}],"state_update":{"affection":-2,"energy":-1}}\n```'};
      }
    }
  },
  getChatId:()=> 'chat-1',
  getCallerCardId:()=> 'role-1',
  getCallerName:()=> 'user',
  Number,String,Boolean,Array,Object,JSON,Math,Date,Promise,Error,Set,
  setTimeout,clearTimeout
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'ui/pig_pet.ui.js'),'utf8'),ctx);
(async()=>{
  const result=await ctx.exports.interact({type:'tail_pull',distance:44,duration_ms:510});
  if(!result.success)throw new Error('interaction failed');
  const d=result.data.decision;
  if(d.reply!=='谁准你揪我尾巴了。')throw new Error('reply parsing failed');
  if(d.actions.join(',')!=='tail_snap,recoil')throw new Error('action parsing failed');
  if(result.data.state.affection!==48||result.data.state.energy!==79)throw new Error('state update failed');
  if(!sentPrompt.includes('当前 Operit 角色卡')||!sentPrompt.includes('揪了一下你的卷尾巴'))throw new Error('persona/event prompt missing');
  if(!stored.includes('"interaction_count":1'))throw new Error('state persistence failed');
  console.log('MOCK RUNTIME PASSED');
})().catch(e=>{console.error(e);process.exit(1)});
