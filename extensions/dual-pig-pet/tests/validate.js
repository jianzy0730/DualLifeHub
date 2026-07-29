const fs=require('fs');const path=require('path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'resources/webapp/index.html'),'utf8');
const ui=fs.readFileSync(path.join(root,'src/ui/pig_pet.ui.js'),'utf8');
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
function assert(v,m){if(!v)throw new Error(m)}
assert(manifest.toolpkg_id==='com.community.dual_pig_pet','wrong package id');
assert(manifest.version==='0.2.0','wrong version');
assert(html.includes('tail_pull'),'tail_pull interaction missing');
assert(html.includes('class="tail-hit"'),'tail hit target missing');
assert(html.includes('DualPigHost'),'host bridge missing');
assert(html.includes('data-zone="head"')&&html.includes('data-zone="body"'),'touch zones missing');
assert(html.includes('即时反应 · 已记下'),'instant local feedback missing');
assert(!ui.includes('Tools.Chat.sendMessage'),'touch interactions must not call LLM');
assert(main.includes('registerPromptFinalizeHook'),'interaction context hook missing');
assert(main.includes('pending_events'),'event queue missing');
for(const action of ['blink','tail_wag','nuzzle','recoil','tail_snap'])assert(html.includes(action),'missing action '+action);
console.log('VALIDATION PASSED');
