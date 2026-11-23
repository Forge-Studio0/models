import {world,system} from '@minecraft/server';

// Stable API 2.6. No player.json, extra health bar, inventory changes, resurrection
// after death, or permanent resistance. The main BP owns RPG health and bodies.
const OBJECTIVE='swbr_down26',FINAL='nzs_finalization_death_v1834',DOWN='desmaio:caido';
const REPLAY='swbr_dn_replay26',TICKET='swbr_dn_ticket26_',OK='swbr_dn_ok26_',ERROR='swbr_dn_err26_';
const FLOOR=0.000001;
const DOWN_EPOCH='swbr_dn_epoch34_',WAKE_TICK='swbr_dn_wake34_';
function bodyEpoch(p){try{const tag=p.getTags().find(t=>t.startsWith(DOWN_EPOCH)),n=Number(tag?.slice(DOWN_EPOCH.length));return Number.isSafeInteger(n)&&n>=0?n:0;}catch{return 0;}}
function sameBody(q){return valid(q.player)&&(generations.get(q.player.id)||0)===q.generation&&bodyEpoch(q.player)===q.epoch;}
const pending=new Map(),generations=new Map(),actions=new Map(),lastHits=new Map(),lastDeaths=new Map(),probes=new Map();
const started=system.currentTick;
let sequence=0,nativeReady=false,subscriptionError='';
const counters={received:0,candidates:0,reserved:0,confirmed:0,failed:0,errors:0};
function clock(){return Math.floor(world.getAbsoluteTime());}
function fresh(name){try{const n=world.scoreboard.getObjective(OBJECTIVE)?.getScore(name),age=clock()-n;return typeof n==='number'&&age>=0&&age<=100;}catch{return false;}}
function ready(){return nativeReady&&fresh('core_v1');}
function startupWindow(){return nativeReady&&system.currentTick-started<40;}
function valid(p){try{return !!p&&p.isValid!==false;}catch{return false;}}
function health(p){return p.getComponent('minecraft:health');}
function deathFloor(p){try{const n=Number(health(p)?.effectiveMin);return n>0&&n<=FLOOR*1.1;}catch{return false;}}
function safeSensor(p){try{return p.getComponent('minecraft:type_family')?.hasTypeFamily('nzs_health_pipeline_v18727')===true;}catch{return false;}}
function ticket(){return (++sequence).toString(16).padStart(8,'0')+Math.floor(Math.random()*0x100000000).toString(16).padStart(8,'0')+Math.floor(Math.random()*0x100000000).toString(16).padStart(8,'0');}
function normalize(cause){return String(cause||'').replace(/_/g,'').toLowerCase();}
function clear(q){
 pending.delete(q.id);
 try{for(const prefix of [TICKET,OK,ERROR])q.player.removeTag(prefix+q.id);}catch{}
}
function originalDamage(q){
 const p=q.player;
 if(!sameBody(q)||p.hasTag(FINAL)||p.hasTag(DOWN)||(health(p)?.currentValue??0)<=0)return;
 try{
  p.addTag(REPLAY);
  // The core did not accept this reserved fatal hit. Remove the direct-death
  // floor before replay, rather than leave a player immortal at the minimum.
  if(deathFloor(p))p.triggerEvent('swbr:floor_allow_death30');
  if(q.kind==='force'){p.kill();return;}
  const source={cause:q.cause||'override'};
  if(valid(q.attacker))source.damagingEntity=q.attacker;
  p.applyDamage(q.amount,source);
 }catch(error){console.warn('[SWBR Desmaio] Dano original não reaplicado: '+error);}
 finally{try{p.removeTag(REPLAY);}catch{}}
}
function monitor(q,attempt=0){
 if(!pending.has(q.id))return;
 const p=q.player;
 if(!sameBody(q)){clear(q);return;}
 if(p.hasTag(OK+q.id)){counters.confirmed++;clear(q);return;}
 if(p.hasTag(ERROR+q.id)||attempt>=8){
  counters.failed++;clear(q);console.warn('[SWBR Desmaio] Reserva sem confirmação; proteção temporária liberada.');
  originalDamage(q);return;
 }
 system.runTimeout(()=>monitor(q,attempt+1),1);
}
function reserve(p,hit){
 if(pending.size>=256)return false;
 const id=ticket(),q={...hit,id,player:p,generation:generations.get(p.id)||0,epoch:bodyEpoch(p)};
 pending.set(id,q);counters.reserved++;
 system.run(()=>{
  if(!pending.has(id))return;
  if(!sameBody(q)||p.hasTag(FINAL)||(health(p)?.currentValue??0)<=0){clear(q);return;}
  try{
   p.addTag(TICKET+id);
   p.runCommand('scriptevent swbr:downed_hit26 '+JSON.stringify({v:26,epoch:q.epoch,ticket:id,kind:q.kind,amount:q.amount,native:q.native,scripted:q.scripted,cause:q.cause,attackerId:q.attacker?.id}));
   system.runTimeout(()=>monitor(q),1);
  }catch(error){counters.failed++;clear(q);originalDamage(q);console.warn('[SWBR Desmaio] Reserva não enviada: '+error);}
 });return true;
}
function promptFinalize(attacker,victim){
 const key=attacker.id+':'+victim.id,now=system.currentTick;
 if((actions.get(key)||0)>now)return;actions.set(key,now+40);
 const id=ticket(),epoch=bodyEpoch(victim);system.run(()=>{
  if(!valid(attacker)||!valid(victim)||bodyEpoch(victim)!==epoch||!victim.hasTag(DOWN)||victim.hasTag(FINAL)||attacker.hasTag(DOWN)||attacker.hasTag(FINAL))return;
  try{attacker.addTag(TICKET+id);attacker.runCommand('scriptevent swbr:downed_action26 '+JSON.stringify({ticket:id,victim:victim.id,epoch}));}catch{}
  system.runTimeout(()=>{try{attacker.removeTag(TICKET+id);}catch{}},10);
 });
}
function beforeHurt(e){
 const p=e.hurtEntity,a=e.damageSource?.damagingEntity;
 if(p?.typeId==='minecraft:player'){
  if(p.hasTag(FINAL))return;
  counters.received++;lastHits.set(p.id,{tick:system.currentTick,cause:String(e.damageSource?.cause||'unknown'),candidate:false,reserved:false});
  if(probes.has(p.id)){probes.set(p.id,true);e.cancel=true;return;}
 }
 const hiraishin=e.damageSource?.damagingProjectile?.typeId==='nz:hiraishin_bullet';
 if(a?.typeId==='minecraft:player'&&(a.hasTag(FINAL)||a.hasTag('swbr_finalizing44')||a.hasTag('desmaio:carregando')&&!hiraishin||a.hasTag('desmaio:revivendo'))){e.cancel=true;return;}
 if(e.cancel)return;
 if(a?.typeId==='minecraft:player'&&a.hasTag(DOWN)){e.cancel=true;return;}
 if(p?.typeId!=='minecraft:player')return;
 if(p.hasTag(REPLAY)||p.hasTag('nzs_native_replay_v18719'))return;
 if(!ready()&&!startupWindow())return;
 if(p.hasTag(DOWN)){
  e.cancel=true;
  if(a?.typeId==='minecraft:player'&&a.id!==p.id&&a.isSneaking)promptFinalize(a,p);
  return;
 }
 const cause=normalize(e.damageSource?.cause),scripted=p.hasTag('nzs_safe_damage_v18408')||p.hasTag('nzs_converted_damage_v18732');
 // The owned player.json sensor suppresses raw PvP; safe_melee receives the
 // contact notification and applies the marked stat-scaled hit once. Canceling
 // the earlier native hurt event can suppress that notification on some engines.
 // Delegate raw contact to the sensor instead of intercepting the same hit twice.
 if(a?.typeId==='minecraft:player'&&cause==='entityattack'&&safeSensor(p)&&!scripted)return;
 const h=health(p),amount=Number(e.damage);
 const forced=['suicide','selfdestruct'].includes(cause);
 if(!h||h.currentValue<=0)return;
 // A forced death can report a non-finite amount. Its cause is resolved before
 // validating ordinary damage; otherwise that native path escaped interception.
 if(!forced&&(!Number.isFinite(amount)||amount<=0||amount+1e-7<h.currentValue))return;
 if(!forced&&amount>1e15)return;
 counters.candidates++;lastHits.get(p.id).candidate=true;
 const native=p.hasTag('nzs_virtual_damage_v18408')||p.hasTag('nzs_converted_damage_v18732');
 if(reserve(p,{kind:forced?'force':'damage',amount:forced?0:amount,native,scripted,cause:String(e.damageSource?.cause||'override'),attacker:a})){e.cancel=true;lastHits.get(p.id).reserved=true;}
}
function subscribeNative(){
 if(nativeReady)return;
 try{world.beforeEvents.entityHurt.subscribe(e=>{try{beforeHurt(e);}catch(error){counters.errors++;if(counters.errors<=3)console.warn('[SWBR Desmaio] Interceptação: '+error);}});nativeReady=true;subscriptionError='';}
 catch(error){subscriptionError=String(error);console.warn('[SWBR Desmaio] Requer Bedrock 1.26.10+ / API 2.6: '+error);}
}
subscribeNative();system.run(subscribeNative);try{world.afterEvents.worldLoad?.subscribe(subscribeNative);}catch{}
try{world.beforeEvents.entityHeal.subscribe(e=>{
 const p=e.healedEntity;
 if(p?.typeId==='minecraft:player'&&p.hasTag(FINAL))e.cancel=true;
});}catch{}
// While unconscious, ordinary interactions, blocks and item casts stay disabled.
for(const [name,key]of [['itemUse','source'],['playerInteractWithBlock','player'],['playerInteractWithEntity','player'],['playerBreakBlock','player'],['playerPlaceBlock','player']])try{
 world.beforeEvents[name]?.subscribe(e=>{if(ready()&&e[key]?.hasTag(DOWN))e.cancel=true;});
}catch{}
function heartbeat(){
 if(!nativeReady)return;
 try{const o=world.scoreboard.getObjective(OBJECTIVE)??world.scoreboard.addObjective(OBJECTIVE,OBJECTIVE);o.setScore('driver_v1',clock());}catch{}
 for(const [key,until]of actions)if(until<system.currentTick)actions.delete(key);
}
system.run(heartbeat);system.runInterval(heartbeat,20);
function cancelPlayer(id){generations.set(id,(generations.get(id)||0)+1);for(const q of [...pending.values()])if(q.player.id===id)clear(q);}
world.afterEvents.playerLeave.subscribe(({playerId})=>{cancelPlayer(playerId);generations.delete(playerId);lastHits.delete(playerId);lastDeaths.delete(playerId);probes.delete(playerId);});
world.afterEvents.playerSpawn.subscribe(({player})=>{
 cancelPlayer(player.id);
 for(const tag of player.getTags())if(tag===REPLAY||tag.startsWith(TICKET)||tag.startsWith(OK)||tag.startsWith(ERROR))try{player.removeTag(tag);}catch{}
});
// The core handles direct health writes itself. This receipt is a bounded
// fallback if that core stops responding; it does not run inside the health event.
try{world.afterEvents.entityHealthChanged?.subscribe(({entity:p,newValue})=>{
 if(p?.typeId!=='minecraft:player'||!deathFloor(p)||p.hasTag(FINAL)||p.hasTag(DOWN)||!(newValue>0&&newValue<=FLOOR*1.1))return;
 const epoch=bodyEpoch(p),wake=p.getTags().find(t=>t.startsWith(WAKE_TICK)),age=clock()-Number(wake?.slice(WAKE_TICK.length));
 if(age>=0&&age<=3&&Number(health(p)?.currentValue)>FLOOR*1.1)return;
 system.run(()=>{
  if(!valid(p)||bodyEpoch(p)!==epoch||p.hasTag(FINAL)||p.hasTag(DOWN)||(health(p)?.currentValue??0)<=0||[...pending.values()].some(q=>q.player.id===p.id&&q.epoch===epoch))return;
  reserve(p,{kind:'force',amount:0,native:true,scripted:false,cause:'selfDestruct'});
 });
});}catch{}
world.afterEvents.entityDie.subscribe(({deadEntity:p,damageSource})=>{
 if(p?.typeId!=='minecraft:player')return;
 try{if(p.hasTag(FINAL)){cancelPlayer(p.id);return;}}catch{}
 try{const hp=Number(health(p)?.currentValue);if(hp>0&&(p.hasTag(DOWN)||deathFloor(p)&&hp<=FLOOR*1.1))return;}catch{}
 const hit=lastHits.get(p.id),seen=!!hit&&system.currentTick-hit.tick<=2;
 const record={cause:String(damageSource?.cause||'unknown'),hook:seen,reserved:seen&&hit.reserved,ready:ready(),tick:system.currentTick};
 lastDeaths.set(p.id,record);
 console.warn('[SWBR Desmaio] Morte sem finalização: '+p.name+' · causa='+record.cause+' · eventoAntesDoDano='+seen+' · reservado='+record.reserved+' · serviço='+record.ready);
});
function verifyNative(p){
 if(p?.typeId!=='minecraft:player')return;
 const mode=String(p.getGameMode()).toLowerCase();
 if(mode==='creative'||mode==='spectator'){p.sendMessage('§eFaça a verificação em sobrevivência ou aventura.');return;}
 const h=health(p),before=Number(h?.currentValue)||0;
 if(!valid(p)||p.hasTag(DOWN)||p.hasTag(FINAL)||before<=1){p.sendMessage('§eFaça a verificação vivo, fora do desmaio e com mais de 1 HP nativo.');return;}
 probes.set(p.id,false);
 try{
  p.applyDamage(1,{cause:'override'});
  const intercepted=probes.get(p.id)===true;
  if(!intercepted&&health(p)?.currentValue>0&&health(p).currentValue<before)health(p).setCurrentValue(before);
  p.sendMessage(intercepted?'§aEvento antes do dano: confirmado e cancelado. '+(ready()?'BP principal conectado.':'§cBP principal ainda não respondeu.')+'\n'+(deathFloor(p)?'§aPiso de vida contra /kill: carregado.':'§cPiso contra /kill NÃO carregado: confira o BP principal e a prioridade do player.json.'):'§cEvento antes do dano não confirmado. Confira o BP Desmaio Nativo 1.0.10 e o log do servidor.');
 }catch(error){p.sendMessage('§cFalha na verificação nativa: '+error);}
 finally{probes.delete(p.id);}
}
system.afterEvents.scriptEventReceive.subscribe(e=>{
 if(e.id==='swbr:desmaio_verificar'){system.run(()=>verifyNative(e.sourceEntity));return;}
 if(e.id!=='swbr:desmaio_nativo_status')return;
 const p=e.sourceEntity;
 if(e.id==='swbr:desmaio_nativo_status'){
  const death=p?lastDeaths.get(p.id):undefined;
  const msg='§bDesmaio Nativo 1.0.10: '+(ready()?'§aATIVO':'§cAGUARDANDO BP SWBR')+'\n§7Danos observados: '+counters.received+' · Candidatos fatais: '+counters.candidates+' · Reservas: '+counters.reserved+' · Confirmadas: '+counters.confirmed+' · Falhas: '+counters.failed+' · Erros: '+counters.errors+'\n§7Piso nativo /kill: '+(deathFloor(p)?'carregado':'não carregado')+(subscriptionError?'\n§cInscrição: '+subscriptionError:'')+(death?'\n§7Última morte: '+death.cause+' · evento antes do dano: '+(death.hook?'sim':'não')+' · reservado: '+(death.reserved?'sim':'não'):'');
  if(p?.typeId==='minecraft:player')p.sendMessage(msg);else console.warn(msg);return;
 }
});
