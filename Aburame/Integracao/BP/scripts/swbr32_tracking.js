import {onlinePlayers,playersNear} from './swbr40_presence.js';
import {world,system,EquipmentSlot,MolangVariableMap} from '@minecraft/server';
import {ActionFormData,ModalFormData} from '@minecraft/server-ui';
import {showSessionForm} from './rp_v1873_form_session.js';
import {characterRevision} from './rp_v18358_character_state.js';
import {getCurrentChakra,getMaxChakra} from './rp_v180_chakra_service.js';
import {setTrackingOverlay,clearTrackingOverlay,trackingOverlayStatus} from './swbr35_chakra_overlay.js';
import {TRACKING_MODES,TRACKING_HUD,TRACKING_FILTERS,trackingSettings,trackingDistance,trackingBearing,trackingPower,trackingFilterAllows,trackingText} from './swbr32_tracking_math.js';

const PREF='swbr_tracking32',sessions=new Map(),paused=new Map(),warned=new Set(),failures=new Map();
const villages=['Folha','Areia','Nuvem','Nevoa','Pedra','Chuva','Som','Paz','Neve','EntidadeLP'];
const slots=[EquipmentSlot.Head,EquipmentSlot.Chest,EquipmentSlot.Legs,EquipmentSlot.Feet];
function settings(p){try{return trackingSettings(JSON.parse(String(p.getDynamicProperty(PREF)||'{}')));}catch{return trackingSettings();}}
function save(p,value){p.setDynamicProperty(PREF,JSON.stringify(trackingSettings(value)));}
function village(p){return villages.find(v=>p.hasTag(v))||'';}
function valid(p){try{return p?.typeId==='minecraft:player'&&(typeof p.isValid==='function'?p.isValid():p.isValid!==false)&&p.getComponent('minecraft:health')?.currentValue>0&&!p.hasTag('nzs_finalization_death_v1834');}catch{return false;}}
export function availableTracking(p){
 try{const eq=p.getComponent('minecraft:equippable'),items=slots.map(s=>eq?.getEquipment(s)?.typeId);return Object.keys(TRACKING_MODES).filter(k=>TRACKING_MODES[k].items.some(id=>items.includes(id)));}catch{return [];}
}
function usable(p){return valid(p)&&!p.hasTag('desmaio:caido')&&!p.hasTag('sw_truco_seated')&&!p.hasTag('swbr_chess_seated')&&!p.hasTag('nzs_creator_sealed_v18385');}
function candidates(p,kind,pref,players){
 const mode=TRACKING_MODES[kind],own=village(p);
 return players.filter(t=>{
  if(t.id===p.id||!valid(t)||t.dimension.id!==p.dimension.id||trackingDistance(p.location,t.location)>mode.range)return false;
  const h=t.getComponent('minecraft:health');
  if(kind==='byaku'&&Number(getCurrentChakra(t))<=0)return false;
  return trackingFilterAllows(pref.filter,own,village(t),h.currentValue/Math.max(1,h.effectiveMax));
 }).sort((a,b)=>trackingDistance(p.location,a.location)-trackingDistance(p.location,b.location));
}
function clear(p,session){
 try{clearTrackingOverlay(p);}catch(error){failures.set(p.id,String(error).slice(0,160));}
 if(session?.hudOwned)try{p.onScreenDisplay.setTitle('',{subtitle:'',fadeInDuration:0,stayDuration:1,fadeOutDuration:0});}catch{}
 sessions.delete(p.id);
}
function publishHud(p,session){
 const text=payload(p,session);
 // updateSubtitle alone does nothing on a cold ScreenDisplay. Establish and
 // renew a real title lifetime; JSON UI consumes its private routing marker.
 if(!session.hudOwned||system.currentTick+10>=(session.hudUntil||0)){
  p.onScreenDisplay.setTitle(TRACKING_HUD,{subtitle:text,fadeInDuration:0,stayDuration:60,fadeOutDuration:0});
  session.hudUntil=system.currentTick+60;
 }else p.onScreenDisplay.updateSubtitle(text);
 session.hudOwned=true;session.hudTick=system.currentTick;
}
export function suspendTrackingHud(p,ticks=60){
 try{clearTrackingOverlay(p);}catch{}
 paused.set(p.id,system.currentTick+Math.max(1,ticks));
 const s=sessions.get(p.id);if(s)s.hudOwned=false;
}
export function trackingTitle(p,title,options={}){
 suspendTrackingHud(p,(Number(options.fadeInDuration)||0)+(Number(options.stayDuration)||20)+(Number(options.fadeOutDuration)||0)+5);
 p.onScreenDisplay.setTitle(title,options);
}
function name(p){const first=p.getDynamicProperty('nzs_roleplay_name');return trackingText(first?first+' '+String(p.getDynamicProperty('nzs_roleplay_surname')||p.getDynamicProperty('rp_clan')||''):p.name);}
function payload(p,s){
 const mode=TRACKING_MODES[s.kind],t=s.target;
 const bearing=t?trackingBearing(p.location,t.location,p.getRotation().y):{direction:'—',compass:0};
 const distance=t?Math.round(trackingDistance(p.location,t.location)):0;
 const power=t?trackingPower(distance,mode.range):0;
 const tag=TRACKING_HUD+':rp36:'+':'+s.kind+':'+(s.pref.visual?':filter:':'')+':dir'+bearing.compass+':'+':power'+power+':';
 if(!t)return tag+'§7Buscando alvo...\n§8Alcance §f'+mode.range+' m §8· !rastreio';
 const short=value=>{const n=Math.max(0,Math.floor(Number(value)||0));return n>=1000000?(n/1000000).toFixed(1)+'M':n>=10000?(n/1000).toFixed(1)+'k':String(n);};
 const heading=mode.color+name(t).slice(0,22)+' §7· §f'+distance+' m';
 const detail=s.kind==='byaku'?'§dCH §f'+short(getCurrentChakra(t))+'/'+short(getMaxChakra(t)):
  s.kind==='insects'?'§b5 insetos · sinal '+power+'/10':'§cCheiro '+power+'/10';
 return tag+heading+'\n§7'+bearing.direction+' §8| '+detail;
}
function refreshOverlay(p,s){
 try{
  const target=s?.target;
  if(!s||!usable(p)||!s.pref.visual||system.currentTick<(paused.get(p.id)||0)||!availableTracking(p).includes(s.kind)||!valid(target)||target.dimension.id!==p.dimension.id||trackingDistance(p.location,target.location)>TRACKING_MODES[s.kind].range){clearTrackingOverlay(p);return;}
  setTrackingOverlay(p,target,s.kind,characterRevision(target));
 }catch(error){
  failures.set(p.id,'Rede de chakra: '+String(error).slice(0,130));
  if(!warned.has('overlay:'+p.id)){warned.add('overlay:'+p.id);console.warn('[SWBR Rastreio] Rede corporal: '+String(error).slice(0,150));}
 }
}
function update(){
 const players=onlinePlayers();
 for(const p of players)try{
  const pref=settings(p),allowed=availableTracking(p);
  if(!pref.enabled||!allowed.length||!usable(p)){clear(p,sessions.get(p.id));continue;}
  const kind=allowed.includes(pref.kind)?pref.kind:allowed[0];
  let s=sessions.get(p.id);
  if(!s||s.revision!==characterRevision(p)||s.kind!==kind||s.dimension!==p.dimension.id){clear(p,s);s={kind,revision:characterRevision(p),dimension:p.dimension.id};sessions.set(p.id,s);}
  s.pref=pref;
  const list=candidates(p,kind,pref,playersNear(p.dimension,p.location,TRACKING_MODES[kind].range));
  if(s.selectedId){
   const selected=players.find(t=>t.id===s.selectedId);
   if(selected&&characterRevision(selected)!==s.selectedRevision&&!s.invalidTarget){s.invalidTarget=true;p.sendMessage('§eA identidade do alvo mudou. Selecione o novo personagem.');}
  }
  const target=s.invalidTarget?undefined:s.selectedId?list.find(t=>t.id===s.selectedId&&characterRevision(t)===s.selectedRevision):list[0];
  const old=s.target?.id;s.target=target;
  if(target&&old!==target.id)p.sendMessage(TRACKING_MODES[kind].color+'[Rastreio] §f'+name(target)+' identificado a '+Math.round(trackingDistance(p.location,target.location))+' blocos.');
  if(!target&&old)p.sendMessage('§7[Rastreio] Sinal perdido: fora de alcance, dimensão ou filtro.');
  failures.delete(p.id);refreshOverlay(p,s);
  if(system.currentTick<(paused.get(p.id)||0))continue;
  publishHud(p,s);
 }catch(error){failures.set(p.id,String(error).slice(0,160));if(!warned.has('hud:'+p.id)){warned.add('hud:'+p.id);console.warn('[SWBR Rastreio] HUD: '+String(error).slice(0,160));}}
}

function particle(p,id,position,size,color,budget){
 if(budget.left<=0)return;
 if(typeof p.spawnParticle!=='function'){failures.set(p.id,'Partículas privadas indisponíveis nesta API.');return;}
 try{
  const vars=new MolangVariableMap();vars.setFloat('variable.track_w',size[0]);vars.setFloat('variable.track_h',size[1]);
  for(let i=0;i<4;i++)vars.setFloat('variable.track_'+['r','g','b','a'][i],color[i]);
  p.spawnParticle(id,position,vars);budget.left--;
 }catch(error){failures.set(p.id,String(error).slice(0,160));if(!warned.has(p.id)){warned.add(p.id);console.warn('[SWBR Rastreio] Marcador privado indisponível: '+String(error).slice(0,150));}}
}
let visualCursor=0;
function visuals(){
 const budget={left:256},players=onlinePlayers();
 if(!players.length)return;
 const start=visualCursor%players.length;visualCursor++;
 for(let index=0;index<players.length;index++){
  const p=players[(start+index)%players.length];
  const s=sessions.get(p.id);refreshOverlay(p,s);if(!s||!usable(p)||!s.pref.visual||system.currentTick<(paused.get(p.id)||0))continue;
  if(s.kind==='byaku')continue;
  if(budget.left<45){visualCursor=(start+index)%players.length;break;}
  const t=s.target,hasTarget=valid(t)&&t.dimension.id===p.dimension.id;
  try{
   if (!hasTarget || !availableTracking(p).includes(s.kind)) continue;
   const d = trackingDistance(p.location, t.location);
   if (d <= .01 || d > TRACKING_MODES[s.kind].range || system.currentTick - (s.lastTrailTick ?? -100) < 5) continue;
   s.lastTrailTick = system.currentTick;
   const dx = (t.location.x - p.location.x) / d;
   const dz = (t.location.z - p.location.z) / d;
   if (s.kind === 'insects') {
    const reach = Math.min(d, 18);
    for (let i = 1; i <= 5; i++) {
     const step = reach * i / 5;
     const at = {
      x: p.location.x + dx * step,
      y: p.location.y + (t.location.y - p.location.y) * (step / d) + .74 + Math.sin(system.currentTick * .08 + i) * .09,
      z: p.location.z + dz * step
     };
     particle(p, 'swbr:track_insect32', at, [.03, .038], [1, 1, 1, .86], budget);
    }
   } else {
    for (let i = 1; i <= 8; i++) {
     const step = Math.min(d, 18) * i / 8;
     const at = {
      x: p.location.x + dx * step,
      y: p.location.y + .4 + Math.sin(system.currentTick * .08 + i) * .12,
      z: p.location.z + dz * step
     };
     particle(p, 'swbr:track_scent32', at, [.17, .17], [.9, .8, .85, .45], budget);
    }
   }
  }catch{}
 }
}

export async function openTrackingMenu(p){
 const available=availableTracking(p),pref=settings(p);
 if(!available.length){p.sendMessage('§eAtive um Byakugan, um modo Inuzuka ou os insetos Aburame para usar o rastreio.');return;}
 const kind=available.includes(pref.kind)?pref.kind:available[0];
 const f=new ActionFormData().title('§lRASTREAMENTO SENSORIAL').body('§7'+available.map(k=>TRACKING_MODES[k].label).join(' · ')+'\n§fSensor: '+TRACKING_MODES[kind].label+'\n§7Ativa junto ao modo. Rede corporal, marcadores e filtro são privados.')
  .button('§bSelecionar alvo').button('§eFiltros e aparência').button(pref.enabled?'§cDesligar rastreio':'§aLigar rastreio').button('§7Fechar');
 const r=await showSessionForm(f,p,()=>availableTracking(p).length>0);if(r.canceled)return;
 if(r.selection===2){save(p,{...pref,enabled:!pref.enabled});update();return;}
 if(r.selection===1){
  const modeNames=available.map(k=>TRACKING_MODES[k].label);
  const form=new ModalFormData().title('Filtros do rastreio').dropdown('Sensor ativo',modeNames,available.indexOf(kind)).dropdown('Alvos',TRACKING_FILTERS,pref.filter).toggle('Rede de chakra, filtro e trilha',pref.visual).toggle('Rastreio ligado',pref.enabled);
  const res=await showSessionForm(form,p,()=>availableTracking(p).length>0);if(res.canceled)return;
  const v=res.formValues||[];if(!availableTracking(p).includes(available[v[0]]))return;
  save(p,{kind:available[v[0]],filter:v[1],visual:v[2],enabled:v[3]});update();return;
 }
 if(r.selection===0){
  const list=candidates(p,kind,pref,playersNear(p.dimension,p.location,TRACKING_MODES[kind].range)).slice(0,50);
  const form=new ActionFormData().title('Escolher alvo · '+TRACKING_MODES[kind].label).body('§7Alcance: '+TRACKING_MODES[kind].range+' blocos. A lista respeita seu filtro.').button('§aAutomático · mais próximo');
  for(const t of list)form.button(name(t)+'\n§7'+Math.round(trackingDistance(p.location,t.location))+' blocos');
  const revisions=list.map(characterRevision);
  const res=await showSessionForm(form,p,()=>availableTracking(p).includes(kind));if(res.canceled)return;
  save(p,{...pref,enabled:true,kind});update();const s=sessions.get(p.id);if(!s)return;
  if(res.selection===0){s.selectedId=undefined;s.selectedRevision=undefined;s.invalidTarget=false;}
  else{const t=list[res.selection-1];if(!valid(t)||characterRevision(t)!==revisions[res.selection-1])return;s.selectedId=t.id;s.selectedRevision=characterRevision(t);s.invalidTarget=false;}
  update();
 }
}
system.runInterval(update,10);system.runInterval(visuals,5);
world.afterEvents.playerLeave.subscribe(({playerId})=>{sessions.delete(playerId);paused.delete(playerId);warned.delete(playerId);warned.delete('hud:'+playerId);warned.delete('overlay:'+playerId);failures.delete(playerId);});
world.afterEvents.playerSpawn.subscribe(({player})=>{clear(player,sessions.get(player.id));paused.delete(player.id);});
try{world.beforeEvents.chatSend.subscribe(e=>{
 const command=e.message.trim().toLowerCase();if(command!=='!rastreio'&&command!=='!rastreio status')return;e.cancel=true;
 system.run(()=>{
  if(command==='!rastreio status'){
   const p=e.sender,s=sessions.get(p.id),pref=settings(p),allowed=availableTracking(p);
   const overlay=trackingOverlayStatus(p);
   p.sendMessage('§b[Rastreio 18.11.36] §f'+(allowed.map(k=>TRACKING_MODES[k].label).join(', ')||'Nenhum modo sensorial equipado')+'\n§7Sensor: '+(pref.enabled?'ligado':'desligado')+' · efeitos: '+(pref.visual?'ligados':'desligados')+'\n§7HUD: '+(s?.hudOwned?'inicializada':'aguardando')+' · alvo: '+(s?.target?name(s.target):'nenhum')+'\n§7Rede enviada: '+(overlay?'sim · perfil '+overlay.value+' · renovada há '+overlay.age+' ticks':'não')+'\n§7Recursos necessários: RP 18.11.36. Se aparecer :rp36: no cartão, o RP está antigo.'+(failures.has(p.id)?'\n§c'+failures.get(p.id):''));return;
  }
  openTrackingMenu(e.sender).catch(()=>{});
 });
});}catch{}
