import { watchInterval } from "./swbr_perf_181152.js";
import { cachedPlayers } from "./swbr_player_cache_181152.js";
import {world,system} from '@minecraft/server';

// Script API 1.x keeps the RPG health/state machine. A separate API 2.6 pack
// reserves native lethal candidates before the engine can commit a death.
export const NATIVE_REPLAY_TAG='nzs_native_replay_v18719';
export const CONVERTED_DAMAGE_TAG='nzs_converted_damage_v18732';
const FINAL='nzs_finalization_death_v1834',OBJECTIVE='swbr_down26';
const TICKET='swbr_dn_ticket26_',OK='swbr_dn_ok26_',ERROR='swbr_dn_err26_';
let downedHandler,damageHandler,actionHandler,scaleHandler;
const sensorFailures=new Set();
let sensorHits=0;
export const LIVE_HEALTH_FLOOR=0.000001;
let floorHits=0,floorFailures=0;
const floorProcessing=new Set(),floorWarned=new Set(),floorLatched=new Set();
// Tags are shared by packs; dynamic properties are scoped to each BP's UUID.
const DOWN_EPOCH='swbr_dn_epoch34_',WAKE_TICK='swbr_dn_wake34_';
export function bodyEpoch(p){try{const tag=p.getTags().find(t=>t.startsWith(DOWN_EPOCH)),n=Number(tag?.slice(DOWN_EPOCH.length));return Number.isSafeInteger(n)&&n>=0?n:0;}catch{return 0;}}
export function isFinalDeath(p){try{return p?.hasTag(FINAL)===true;}catch{return false;}}
function justWoke(p){try{const tag=p.getTags().find(t=>t.startsWith(WAKE_TICK)),age=clock()-Number(tag?.slice(WAKE_TICK.length));return age>=0&&age<=3;}catch{return false;}}
// A rescue retires the whole fatal receipt, including callbacks queued by the
// separate native pack. It grants no damage immunity or grace period.
export function finishDownedProtection(p){
 const epoch=bodyEpoch(p)+1;
 try{for(const tag of p.getTags())if(tag.startsWith(DOWN_EPOCH)||tag.startsWith(WAKE_TICK))p.removeTag(tag);p.addTag(DOWN_EPOCH+epoch);p.addTag(WAKE_TICK+clock());}catch{}
 floorLatched.delete(p.id);floorWarned.delete(p.id);sensorFailures.delete(p.id);
 clearNativeTickets(p);
 try{p.triggerEvent('swbr:downed_disarm27');armNativeSensor(p);}catch{}
 system.run(()=>{try{if(bodyEpoch(p)===epoch&&!p.hasTag('desmaio:caido'))armNativeSensor(p);}catch{}});
}
export function nativeDeathFloorReady(p){
 try{const n=Number(p?.getComponent('minecraft:health')?.effectiveMin);return n>0&&n<=LIVE_HEALTH_FLOOR*1.1;}catch{return false;}
}
// A delayed death notification must not erase a newly admitted living body.
// Never applies to zero HP or to the intentional finalization/timeout path.
export function isProtectedDownedLife(p){
 try{
  if(p?.typeId!=='minecraft:player'||p.hasTag(FINAL))return false;
  const hp=Number(p.getComponent('minecraft:health')?.currentValue);
  return hp>0&&(p.hasTag('desmaio:caido')||
   hp<=1.000001&&!!p.getDynamicProperty('nzs_downed_state_v26')&&!!p.getDynamicProperty('nzs_downed_lease_v18711')||
   nativeDeathFloorReady(p)&&hp<=LIVE_HEALTH_FLOOR*1.1);
 }catch{return false;}
}
// /kill may set health directly without a cancellable hurt event. The native
// health minimum keeps that write above zero; no death/loot/respawn is committed.
function handleDeathFloor(p){
 try{
  if(p?.hasTag('desmaio:caido')){floorLatched.delete(p.id);return;}
  if(p?.typeId!=='minecraft:player'||p.hasTag(FINAL)||p.hasTag('desmaio:caido')||floorProcessing.has(p.id)||typeof damageHandler!=='function'||typeof downedHandler!=='function'||!nativeDeathFloorReady(p))return;
  const h=p.getComponent('minecraft:health');
  if(!(h.currentValue>0&&(floorLatched.has(p.id)||h.currentValue<=LIVE_HEALTH_FLOOR*1.1)))return;
  floorProcessing.add(p.id);
  floorLatched.delete(p.id);
  let accepted=false;
  try{accepted=damageHandler(p,{force:true})===true;}catch{}
  if(accepted){floorHits++;return;}
  floorFailures++;
  if(!floorWarned.has(p.id)){floorWarned.add(p.id);console.warn('[SWBR Desmaio] Piso fatal sem transição confirmada para '+p.name+'; liberando a morte original.');}
  // A broken state handler must not turn the health minimum into immortality.
  p.triggerEvent('swbr:floor_allow_death30');
  if(Number(p.getComponent('minecraft:health')?.effectiveMin)===0)p.kill();
 }catch(error){console.warn('[SWBR Desmaio] Piso fatal: '+error);}
 finally{if(p?.id)floorProcessing.delete(p.id);}
}
try{world.afterEvents.entityHealthChanged?.subscribe(e=>{
 const p=e.entity;
 if(p?.typeId!=='minecraft:player'||p.hasTag(FINAL)||p.hasTag('desmaio:caido')||!nativeDeathFloorReady(p)||!(e.newValue>0&&e.newValue<=LIVE_HEALTH_FLOOR*1.1)||floorLatched.has(p.id))return;
 // A coalesced notification from before the rescue cannot re-admit a healed
 // body. A genuinely new fatal write still has current HP at the floor.
 if(justWoke(p)&&Number(p.getComponent('minecraft:health')?.currentValue)>LIVE_HEALTH_FLOOR*1.1)return;
 const epoch=bodyEpoch(p);
 floorLatched.add(p.id);
 // Health writes are deferred outside entityHealthChanged. The latch also
 // prevents regeneration in the next tick from erasing an already fatal hit.
 system.run(()=>{if(bodyEpoch(p)===epoch)handleDeathFloor(p);});
});}catch{}
// Also covers engines that coalesce health notifications and restored sessions.
watchInterval("desmaio_ponte", ()=>{for(const p of cachedPlayers())handleDeathFloor(p);},1);
// The player already owns all 32 Entity Property slots. These temporary native
// marks are private to this service and never replace appearance properties.
const READY_NORMAL=18721,READY_SCALED=18722;
function nativeMark(p){try{return p?.getComponent('minecraft:mark_variant')?.value??0;}catch{return 0;}}
function sensorReady(p){return [READY_NORMAL,READY_SCALED].includes(nativeMark(p));}
function armNativeSensor(p){
 if(typeof downedHandler!=='function'||typeof damageHandler!=='function'||sensorFailures.has(p.id)||p.hasTag(FINAL)||nativeFatalPending(p))return false;
 if((p.getComponent('minecraft:health')?.currentValue??0)<=0)return false;
 p.triggerEvent(scaleHandler?.(p)===true?'swbr:downed_arm_scaled28':'swbr:downed_arm27');return true;
}
function clock(){return Math.floor(world.getAbsoluteTime());}
function board(){try{return world.scoreboard.getObjective(OBJECTIVE)??world.scoreboard.addObjective(OBJECTIVE,OBJECTIVE);}catch{return undefined;}}
function fresh(participant){try{const n=world.scoreboard.getObjective(OBJECTIVE)?.getScore(participant);const age=clock()-n;return typeof n==='number'&&age>=0&&age<=100;}catch{return false;}}
export function nativeFatalPending(p){try{return p?.getComponent('minecraft:mark_variant')?.value===18723;}catch{return false;}}
export function clearNativeFatalFlag(p){try{p?.triggerEvent('swbr:clear_fatal_v18723');}catch{}}
export function registerDownedHandler(fn){downedHandler=fn;}
export function registerNativeDamageHandler(fn){damageHandler=fn;}
export function registerNativeScaleHandler(fn){scaleHandler=fn;}
export function registerDownedActionHandler(fn){actionHandler=fn;}
export function nativeDownedBridgeReady(){return typeof damageHandler==='function'&&typeof downedHandler==='function'&&fresh('driver_v1');}
export function requestDowned(p){try{
 if(p?.typeId!=='minecraft:player'||p.hasTag(FINAL)||(p.getComponent('minecraft:health')?.currentValue??0)<=0)return false;
 return p.hasTag('desmaio:caido')||downedHandler?.(p)===true||p.hasTag('desmaio:caido');
}catch{return false;}}
function handshake(){
 if(typeof downedHandler!=='function'||typeof damageHandler!=='function')return;
 try{board()?.setScore('core_v1',clock());}catch{}
 for(const p of cachedPlayers())try{
  if(nativeFatalPending(p))handleFatalSensor(p);
  armNativeSensor(p);
 }catch{}
}
system.runTimeout(handshake,2);system.runInterval(handshake,20);
function handleFatalSensor(p){
 if(!nativeFatalPending(p)||p.hasTag(FINAL))return false;
 let accepted=false;
 try{accepted=damageHandler?.(p,{force:true})===true;}catch{}
 clearNativeFatalFlag(p);
 if(accepted){sensorHits++;system.run(()=>{try{armNativeSensor(p);}catch{}});return true;}
 sensorFailures.add(p.id);try{p.triggerEvent('swbr:downed_disarm27');}catch{}
 console.warn('[SWBR Desmaio] Sensor sem transição confirmada para '+p.name+'; reserva desativada nesta sessão.');return false;
}
function ack(p,ticket,accepted){try{p.removeTag(TICKET+ticket);p.addTag((accepted?OK:ERROR)+ticket);}catch{}}
function ticketOwner(e,ticket){
 if(!/^[a-f0-9]{24}$/.test(ticket||''))return;
 const source=e.sourceEntity??e.initiator;
 if(source)return source.typeId==='minecraft:player'&&source.hasTag(TICKET+ticket)?source:undefined;
 // Some command contexts arrive as server/world events. A one-use ticket,
 // already attached by the native BP, identifies exactly one living player.
 if(e.sourceBlock)return;
 const matches=cachedPlayers().filter(p=>p.hasTag(TICKET+ticket));
 return matches.length===1?matches[0]:undefined;
}
system.afterEvents.scriptEventReceive.subscribe(e=>{
 const p=e.sourceEntity;
 if(e.id==='swbr:desmaio_sensor_v18723'&&e.message==='fatal'&&p?.typeId==='minecraft:player'){handleFatalSensor(p);return;}
 if(e.id==='swbr:desmaio_status'){
  const enabled=sensorReady(p);
  const msg='§bDesmaio SWBR 18.11.83: '+(typeof damageHandler==='function'&&typeof downedHandler==='function'?'§aCORE ATIVO':'§cCORE INDISPONÍVEL')+'\n§7Sensor no jogador: '+(enabled?'ativo':'aguardando / outro player.json')+' · API nativa: '+(fresh('driver_v1')?'ativa':'§cNÃO CARREGADA — ative Desmaio Nativo 1.0.10')+' · Quedas pelo sensor: '+sensorHits+'\n§7Piso nativo contra /kill: '+(nativeDeathFloorReady(p)?'§aATIVO':'§cNÃO CARREGADO')+' §7· Quedas pelo piso: '+floorHits+' · Falhas: '+floorFailures+'\n§7Vida: '+String(p?.getComponent('minecraft:health')?.currentValue??'?')+' · Resistance: '+String(p?.getEffect('resistance')?.amplifier??'nenhuma')+' · Caído: '+String(p?.hasTag('desmaio:caido')??false)+' · Sensor: '+String(p?.getComponent('minecraft:type_family')?.hasTypeFamily?.('nzs_health_pipeline_v18727')??false);
  if(p?.typeId==='minecraft:player'){p.sendMessage(msg);try{p.runCommand('scriptevent swbr:desmaio_nativo_status');}catch{}}else console.warn(msg);return;
 }
 if(e.id==='swbr:desmaio_teste'){
  const requested=String(e.message||'').trim().replace(/^"|"$/g,'');
  const target=p?.typeId==='minecraft:player'?p:cachedPlayers().find(x=>x.name.toLowerCase()===requested.toLowerCase());
  if(!target){console.warn('[SWBR Desmaio] Pelo console: scriptevent swbr:desmaio_teste Gamertag do jogador online.');return;}
  const accepted=!target.hasTag(FINAL)&&damageHandler?.(target,{force:true})===true;
  target.sendMessage(accepted&&target.hasTag('desmaio:caido')?'§aTeste de estado: desmaio confirmado. §7Confira também a proteção de dano com /scriptevent swbr:desmaio_verificar.':accepted?'§eO teste foi resolvido pela defesa de morte do personagem, como Izanagi.':'§cO estado de desmaio não foi confirmado. Consulte /scriptevent swbr:desmaio_status.');return;
 }
 if(e.id==='swbr:desmaio_force_v18719'&&e.message==='force'){
  if(!p)return;
  if(p.typeId!=='minecraft:player'){try{p.kill();}catch{}}
  else if(!p.hasTag(FINAL))damageHandler?.(p,{force:true});
  return;
 }
 if(e.id==='swbr:downed_action26'){
  let d;try{d=JSON.parse(e.message);}catch{return;}
  const actor=ticketOwner(e,d?.ticket);if(!actor)return;
  actor.removeTag(TICKET+d.ticket);
  const victim=cachedPlayers().find(v=>v.id===d.victim);
  if(!victim||d.epoch!==bodyEpoch(victim)||victim.hasTag(FINAL)||!victim.hasTag('desmaio:caido')||actor.hasTag('desmaio:caido')||actor.dimension.id!==victim.dimension.id||Math.hypot(actor.location.x-victim.location.x,actor.location.y-victim.location.y,actor.location.z-victim.location.z)>3.5)return;
  actionHandler?.(actor,victim,'finalize');return;
 }
 if(e.id!=='swbr:downed_hit26')return;
 let d;try{d=JSON.parse(e.message);}catch{return;}
 const target=ticketOwner(e,d?.ticket);if(d?.v!==26||!target)return;
 if(!fresh('driver_v1')){ack(target,d.ticket,false);return;}
 if(!Number.isSafeInteger(d.epoch)||d.epoch<0){ack(target,d.ticket,false);return;}
 if(d.epoch!==bodyEpoch(target)){ack(target,d.ticket,true);return;}
 if(target.hasTag(FINAL)){ack(target,d.ticket,true);return;}
 if(d.kind!=='force'&&(d.kind!=='damage'||!Number.isFinite(d.amount)||d.amount<=0||d.amount>1e15)){ack(target,d.ticket,false);return;}
 let attacker;
 try{if(typeof d.attackerId==='string'&&d.attackerId.length<128)attacker=world.getEntity(d.attackerId);}catch{}
 let accepted=false;
 try{accepted=damageHandler?.(target,d.kind==='force'?{force:true}:{amount:d.amount,native:d.native===true,scripted:d.scripted===true,cause:String(d.cause||'').slice(0,64),attacker})===true;}catch(error){console.warn('[SWBR Desmaio] Golpe não confirmado: '+error);}
 ack(target,d.ticket,accepted);
});
export function clearNativeTickets(p){
 clearNativeFatalFlag(p);
 try{for(const t of p.getTags())if(t.startsWith('desmaio:ticket_v18719_')||t.startsWith(TICKET)||t.startsWith(OK)||t.startsWith(ERROR)||t==='swbr_dn_replay26'||t===NATIVE_REPLAY_TAG||t===CONVERTED_DAMAGE_TAG)p.removeTag(t);}catch{}
}
world.afterEvents.playerSpawn.subscribe(({player})=>{floorLatched.delete(player.id);floorWarned.delete(player.id);sensorFailures.delete(player.id);try{player.triggerEvent('swbr:downed_disarm27');}catch{}clearNativeTickets(player);system.run(()=>{try{armNativeSensor(player);}catch{}});});
world.afterEvents.playerLeave.subscribe(({playerId})=>{sensorFailures.delete(playerId);floorLatched.delete(playerId);floorWarned.delete(playerId);floorProcessing.delete(playerId);});
