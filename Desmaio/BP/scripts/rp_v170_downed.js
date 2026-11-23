import {watchInterval,registerMapSize} from './swbr_perf_181152.js';
import {cachedPlayers} from './swbr_player_cache_181152.js';
import {carryAlignment} from './rp_v18714_carry_alignment.js';
import {registerDownedHandler,registerDownedActionHandler,isProtectedDownedLife,LIVE_HEALTH_FLOOR,finishDownedProtection,bodyEpoch} from './rp_v18719_downed_bridge.js';
import {refreshDamageGuards} from './rp_v1871_damage_guards.js';
import {characterRevision} from "./rp_v18358_character_state.js";
import {showSessionForm} from "./rp_v1873_form_session.js";
import {canOccupy,teleportPlayerSafely} from "./rp_v18345_safe_movement.js";
import {syncNewContentVisuals} from "./rp_v1878_content_runtime.js";
import {captureControlLease,renewControlEffects,releaseControlLease,releaseLegacyDownedMovement} from "./rp_v18711_control_lease.js";
import { world, system, InputPermissionCategory, EntityComponentTypes, EquipmentSlot, Player, InputButton, ButtonState } from "@minecraft/server";
import {actionFor,actionEpoch,claimAction,releaseAction,retireParticipant,registerCarryTravel,isCarryTravelTransition,traceRescue as trace,rescueDiagnostics as diagnostics} from './rp_v1845_rescue_state.js';
import { ActionFormData } from "@minecraft/server-ui";
import { prepareUnrewritableDeath, FINALIZATION_DEATH_TAG, safeNativeHealthMax, nativeHealthEventValue, defeatPlayer } from "./rp_v131_safe_health.js";
import {getEffectiveAttribute} from './rp_v130_mode_multipliers.js';
import { stageFinalizationAudit, stageDownedDeathAudit, clearStagedDeathAudit } from "./rp_v18368_death_audit.js";
import { isScriptedDamageActive, hasSafeHealthSensor } from "./rp_v18010_damage_origin.js";

const DOWN_TICKS = 20 * 120;
const REVIVE_TICKS = 20 * 10;
const CHECK_INTERVAL = 5;
const REVIVE_DISTANCE = 3.0;
const FINALIZE_DISTANCE = 3.5;
const downed = new Map();
registerMapSize('desmaiados',()=>downed.size);
const finalizeForms = new Map();
const actionForms = new Map();
const FINALIZE_TICKS=16;
const REVIVE_TAG='desmaio:revivendo';
const FINISH_TAG='swbr_finalizing44',FINISH_LEASE='swbr_finalize_lease44';
const DEATH_ATTEMPT='swbr_death_attempt44';
const DEATH_FLOOR_ATTEMPTS = 3;
const finalizations=new Map(),revives=new Map(),entryTicks=new Map(),deathAttempts=new Map();
const FINAL_DEATH_PROP = "nzs_finalization_respawn_pending_v1834";
const SAVED_DOWNED="nzs_downed_state_v26";
const clockKey=p=>'swbr_downed_clock45_'+p.id;
const deathKey=p=>'swbr_final_death83_'+p.id;
function timeLeftMs(state){
 const ms=state.clockPaused?state.remainingMs:state.expiresAt-Date.now();
 return Number.isFinite(ms)?Math.max(0,Math.min(DOWN_TICKS*50,ms)):0;
}
function persistDowned(state){
 const data=JSON.stringify({clockVersion:45,revision:state.revision,expiresAt:state.clockPaused?null:state.expiresAt,
  paused:!!state.clockPaused,remainingMs:timeLeftMs(state),
  mark:{owner:state.jashinOwnerName,ownerHash:state.jashinOwnerHash,until:state.jashinMarkUntilAtLatch}});
 let saved=false;
 try{state.player.setDynamicProperty(SAVED_DOWNED,data);saved=true}catch(error){if(valid(state.player))trace('unexpected',state.player,undefined,'player clock save: '+error)}
 // A leave event may already invalidate the Player. The world receipt still
 // records the exact resume deadline, including time spent offline afterwards.
 try{world.setDynamicProperty(clockKey(state.player),data);saved=true}catch(error){trace('unexpected',state.player,undefined,'world clock save: '+error)}
 if(!saved)throw Error('Cannot persist downed clock');
}
function pauseClock(state){
 state.remainingMs=timeLeftMs(state);state.remaining=Math.ceil(state.remainingMs/50);
 state.clockPaused=true;state.expiresAt=null;persistDowned(state);
 trace('clock_pause',undefined,state.player,'remainingMs='+state.remainingMs);
 showDownedTimer(state);
}
function resumeClock(state,reason){
 if(!state.clockPaused)return;
 const remaining=timeLeftMs(state);state.clockPaused=false;state.remainingMs=remaining;
 state.expiresAt=Date.now()+remaining;state.remaining=Math.ceil(remaining/50);
 try{persistDowned(state)}catch(error){trace('unexpected',undefined,state.player,error)}
 trace('clock_resume',undefined,state.player,reason+'; remainingMs='+remaining);
 showDownedTimer(state);
}
function clearClock(player){
 try{player.setDynamicProperty(SAVED_DOWNED,undefined)}catch(error){if(valid(player))trace('unexpected',player,undefined,error)}
 try{world.setDynamicProperty(clockKey(player),undefined)}catch(error){trace('unexpected',player,undefined,error)}
}

// Integração opcional com Naruto Zenkai v157.4+.
const JASHIN_MODE = "nz:modo_jashin";
const HIDAN_MODE = "nz:modo_hidan";
const JASHIN_IMMORTAL_PROP = "nzs_jashin_immortal_until_v15619";
const JASHIN_MARK_OWNER_PROP = "nzs_jashin_mark_owner_v158";
const JASHIN_MARK_UNTIL_PROP = "nzs_jashin_mark_until_v158";
const JASHIN_CREDIT_GUARD_PROP = "nzs_jashin_finalize_credit_until_v158";
// v4.2: ponte global entre packs por scoreboards.
const JMARK_OBJ="nzsJMark", JMARK_UNTIL_OBJ="nzsJMarkT", JCREDIT_OBJ="nzsJCredit", JGUARD_OBJ="nzsJGuard", JIMM_OBJ="nzsJImm";
function objective(name){try{return world.scoreboard.getObjective(name)??world.scoreboard.addObjective(name,name)}catch{return undefined}}
function score(p,name){try{return objective(name)?.getScore(p.scoreboardIdentity)??0}catch{return 0}}
function scoreSet(p,name,v){try{objective(name)?.setScore(p.scoreboardIdentity,Math.max(0,Math.min(2147483647,Math.floor(Number(v)||0))))}catch{}}
function hashName(name){let h=2166136261>>>0;for(const ch of String(name)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0}return (h&0x7fffffff)||1}
function nowSec(){return Math.floor(Date.now()/1000)}
function globalJashinMark(victim){const ownerHash=score(victim,JMARK_OBJ),until=score(victim,JMARK_UNTIL_OBJ);if(ownerHash<=0||until<nowSec())return undefined;return {ownerHash,until}}
function grantGlobalCredit(finisher){scoreSet(finisher,JCREDIT_OBJ,score(finisher,JCREDIT_OBJ)+1);scoreSet(finisher,JGUARD_OBJ,nowSec()+10)}
function globalImmortalActive(p){return false;} // Hidan/Jashin immortality removed in 18.11.23.

function valid(e) {
  try {
    if (!e) return false;
    if (typeof e.isValid === "function") return e.isValid();
    if (typeof e.isValid === "boolean") return e.isValid;
    return !!e.id;
  } catch { return false; }
}
function healthOf(player) {
  try { return player.getComponent(EntityComponentTypes.Health); } catch { return undefined; }
}
function setMovement(player, enabled) {
  try { player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, enabled); }
  catch { try { player.runCommand(`inputpermission set @s movement ${enabled ? "enabled" : "disabled"}`); } catch {} }
}
const DOWN_LEASE="nzs_downed_lease_v18711",CARRY_LEASE="nzs_carry_lease_v18711";
function retireLegacyDownedEffects(player) {
  for (const name of ['resistance', 'weakness']) try {
    if (player.getEffect(name)?.amplifier === 255) player.removeEffect(name);
  } catch {}
}
function carrySeat(carrier,target){
 const age=p=>Math.max(0,Math.min(2,Math.floor(Number(p.getProperty('nzs:body_age'))||0)));
 return age(carrier)*3+age(target);
}
function attachCarry(carrier,state){
 try{
  const seat=carrier.getComponent('minecraft:rideable');
  state.nativeCarry=!!seat&&(seat.getRiders().some(p=>p.id===state.player.id)||seat.addRider(state.player));
 }catch(error){state.nativeCarry=false;trace('unexpected',carrier,state.player,'mount: '+error);}
 return state.nativeCarry;
}
function carrySpot(carrier,target){
 const o=carryAlignment(carrier.getProperty('nzs:body_age'),target.getProperty('nzs:body_age'));
 const yaw=carrier.getRotation().y*Math.PI/180;
 return {x:carrier.location.x+Math.sin(yaw)*o.distance,y:carrier.location.y+o.height,z:carrier.location.z-Math.cos(yaw)*o.distance};
}
function playDownAnimation(player){syncNewContentVisuals(player)}
function stopDownAnimation(player){syncNewContentVisuals(player)}
function showDownedTimer(state){
 try{state.player.onScreenDisplay.setActionBar(`§cDesmaiado §f${Math.ceil(timeLeftMs(state)/1000)}s §8| ${state.clockPaused?'§bTempo pausado — sendo carregado':'§7Aguarde socorro'}`)}catch{}
}
function reconcileLiveBody(state,player=state.player){
 if(downed.get(player.id)!==state||characterRevision(player)!==state.revision||finalDeathPending(player)||(healthOf(player)?.currentValue??0)<=0)return false;
 state.player=player;
 try{player.addTag('desmaio:caido');setMovement(player,false);renewControlEffects(player,state.controlLease);playDownAnimation(player);showDownedTimer(state);}catch{}
 return player.hasTag('desmaio:caido');
}

function dist(a,b) { const dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }
function isPlayer(e){ try{return e instanceof Player || e?.typeId==="minecraft:player";}catch{return false;} }
function finalDeathPending(player){try{return player.hasTag(FINALIZATION_DEATH_TAG)||Number(player.getDynamicProperty(FINAL_DEATH_PROP)||0)>0}catch{return false}}
function purgeDownedStateOnSpawn(player, terminal=false){
 const legacy=player.hasTag("desmaio:caido")&&!player.getDynamicProperty(DOWN_LEASE)&&!downed.has(player.id);
 const state=downed.get(player.id);if(state){downed.delete(player.id);detachCarrier(state,false,terminal);}
 if(!state&&(player.hasTag('desmaio:carregado')||player.hasTag('desmaio:carregando')||player.hasTag(FINISH_TAG)||player.getDynamicProperty(FINISH_LEASE)||player.getDynamicProperty(CARRY_LEASE)))trace('orphan_cleanup',player,player,'restored_session');
 for(const carried of downed.values())if(carried.carrierId===player.id)detachCarrier(carried,false);
 for(const s of [...finalizations.values()])if(s.actor.id===player.id||s.state.player.id===player.id)cancelFinalization(s,'spawn');
 for(const s of [...revives.values()])if(s.actor.id===player.id||s.state.player.id===player.id)cancelRevive(s,'spawn');
 retireParticipant(player.id);
 if(player.hasTag(REVIVE_TAG)){trace('orphan_cleanup',player,undefined,'revive_tag');player.removeTag(REVIVE_TAG);}
 for(const tag of ["desmaio:caido","desmaio:carregado","desmaio:carregando"])try{player.removeTag(tag)}catch{}
 let oldLease=state?.controlLease;try{oldLease=oldLease||JSON.parse(String(player.getDynamicProperty(DOWN_LEASE)||'null'))}catch{}
 if(legacy)retireLegacyDownedEffects(player);
 releaseControlLease(player,DOWN_LEASE,oldLease);releaseControlLease(player,CARRY_LEASE);
 try{player.removeTag(FINISH_TAG);releaseControlLease(player,FINISH_LEASE)}catch{}
 try{player.triggerEvent("swbr:carry32_off")}catch{}
 if(legacy)releaseLegacyDownedMovement(player);
 try{stopDownAnimation(player)}catch{}
}

function readDeathAttempt(player) {
  let local, backup;
  try { local = JSON.parse(String(player.getDynamicProperty(DEATH_ATTEMPT) || 'null')); } catch {}
  try { backup = JSON.parse(String(world.getDynamicProperty(deathKey(player)) || 'null')); } catch {}
  return backup || local;
}

function saveDeathAttempt(player, state) {
  const { revision, finisher, victim, killRequested, zeroRequested, confirmed } = state;
  const serialized = JSON.stringify({ revision, finisher, victim, killRequested, zeroRequested, confirmed });
  if (valid(player)) try { player.setDynamicProperty(DEATH_ATTEMPT, serialized); } catch {}
  try { world.setDynamicProperty(deathKey(player), serialized); } catch (error) { trace('unexpected', undefined, {id:player.id}, error); }
}

function cancelDeathCallback(id) {
  const attempt = deathAttempts.get(id);
  deathAttempts.delete(id);
  if (attempt?.timer !== undefined) system.clearRun(attempt.timer);
  return attempt;
}

function clearFinalDeath(player) {
  cancelDeathCallback(player.id);
  try { player.setDynamicProperty(FINAL_DEATH_PROP, undefined); } catch {}
  try { player.setDynamicProperty(DEATH_ATTEMPT, undefined); } catch {}
  try { world.setDynamicProperty(deathKey(player), undefined); } catch {}
  try { player.removeTag(FINALIZATION_DEATH_TAG); } catch {}
}

function restoreNativeHealth(player, full) {
  try {
    player.triggerEvent('swbr:floor_restore30');
    player.triggerEvent(`health.${nativeHealthEventValue(safeNativeHealthMax(getEffectiveAttribute(player, 'vida')))}`);
    const health = healthOf(player);
    if (health && (full || health.currentValue > 0)) {
      health.setCurrentValue(full ? health.effectiveMax : Math.max(1, health.effectiveMax * .10));
    }
  } catch (error) { trace('unexpected', undefined, player, error); }
}

function confirmDeath(player) {
  const active = cancelDeathCallback(player.id);
  const attempt = active || readDeathAttempt(player);
  if (!attempt || attempt.confirmed || !active && valid(player) && attempt.revision !== characterRevision(player)) return;
  attempt.confirmed = true;
  saveDeathAttempt(player, attempt);
  const victim = attempt.victim || (valid(player) ? player.name : player.id);
  trace(attempt.finisher ? 'finalize_complete' : 'timeout_complete', undefined, {name:victim}, 'engine death confirmed');
  if (attempt.finisher) try {
    world.sendMessage(`§4[Finalização] §c${attempt.finisher} finalizou ${victim}.`);
  } catch {}
}

function releaseFailedDeath(player, reason) {
  // Only a still-living player can leave a failed attempt. A committed corpse
  // stays the engine's responsibility until playerSpawn.
  if (!valid(player) || healthOf(player)?.currentValue === 0) return;
  clearStagedDeathAudit(player);
  clearFinalDeath(player);
  restoreNativeHealth(player, false);
  finishDownedProtection(player);
  trace('death_failed', undefined, player, reason);
  trace('unexpected', undefined, player, 'Morte nativa não confirmada: ' + reason);
  try { player.sendMessage('§eO motor não confirmou a morte. Seu controle foi restaurado.'); } catch {}
}

function performRealDeath(player, state, finisher, saved) {
  if (!valid(player) || deathAttempts.has(player.id) || !(healthOf(player)?.currentValue > 0)) return false;
  if ((state && downed.get(player.id) !== state) || (!saved && finalDeathPending(player))) return false;
  const receipt = {
    revision: characterRevision(player), finisher: finisher?.name ?? saved?.finisher, victim: player.name,
    killRequested: !!(saved?.killRequested || saved?.issued), zeroRequested: !!saved?.zeroRequested,
    floorAttempts: 0, confirmed: false,
  };
  if (!prepareUnrewritableDeath(player)) return false;
  deathAttempts.set(player.id, receipt);
  try { player.setDynamicProperty(FINAL_DEATH_PROP, Date.now()); } catch {}
  saveDeathAttempt(player, receipt);
  if (state) clearDowned(state, true);
  else {
    purgeDownedStateOnSpawn(player, true);
    clearClock(player);
    finishDownedProtection(player);
  }
  if (receipt.finisher) {
    const author = finisher || cachedPlayers().find(p => p.name === receipt.finisher) || {name:receipt.finisher};
    stageFinalizationAudit(author, player);
  } else stageDownedDeathAudit(player);
  trace('death_commit', finisher, player, saved ? 'reconnected' : finisher ? 'finalize' : 'timeout');

  const later = ticks => {
    if (deathAttempts.get(player.id) === receipt) receipt.timer = system.runTimeout(advance, ticks);
  };
  const advance = () => {
    if (deathAttempts.get(player.id) !== receipt) return;
    if (!valid(player)) { cancelDeathCallback(player.id); return; }
    if (characterRevision(player) !== receipt.revision) { releaseFailedDeath(player, 'character_changed'); return; }
    const health = healthOf(player);
    if (health?.currentValue <= 0) return;
    if (!health || health.effectiveMin !== 0) {
      if (receipt.floorAttempts++ >= DEATH_FLOOR_ATTEMPTS) { releaseFailedDeath(player, 'death_floor_not_open'); return; }
      try { player.triggerEvent('swbr:floor_allow_death30'); } catch (error) { trace('unexpected', finisher, player, error); }
      later(2);
      return;
    }
    if (!receipt.killRequested) {
      receipt.killRequested = true;
      saveDeathAttempt(player, receipt);
      trace('death_issued', finisher, player, 'kill');
      let accepted = false;
      try { accepted = player.kill(); } catch (error) { trace('unexpected', finisher, player, error); }
      later(accepted ? 8 : 3);
      return;
    }
    if (!receipt.zeroRequested) {
      receipt.zeroRequested = true;
      saveDeathAttempt(player, receipt);
      trace('death_issued', finisher, player, 'setCurrentValue(0)');
      try { health.setCurrentValue(0); } catch (error) { trace('unexpected', finisher, player, error); }
      later(5);
      return;
    }
    releaseFailedDeath(player, 'engine_refused_death');
  };
  // Entity component groups can take a game frame to settle. Confirmation is
  // owned by entityDie/playerSpawn, never by the return value of kill().
  advance();
  return true;
}

// Lê somente uma marca Jashin que ainda estava válida naquele instante.
// O sistema de desmaio usa esse dado para "travar" o crédito enquanto o alvo está caído.
function activeJashinMark(victim) {
  const g=globalJashinMark(victim);
  if(g)return g;
  try {
    const owner = String(victim.getDynamicProperty(JASHIN_MARK_OWNER_PROP) || "");
    const until = Number(victim.getDynamicProperty(JASHIN_MARK_UNTIL_PROP) || 0);
    if (!owner || until < Date.now()) return undefined;
    return { owner, ownerHash: hashName(owner), until: Math.floor(until/1000) };
  } catch { return undefined; }
}
function latchJashinMark(state) {
  if (!state || state.jashinOwnerHash) return;
  const mark = activeJashinMark(state.player);
  if (mark) {
    state.jashinOwnerName = mark.owner || state.jashinOwnerName;
    state.jashinOwnerHash = mark.ownerHash || (mark.owner ? hashName(mark.owner) : 0);
    state.jashinMarkUntilAtLatch = mark.until;
    try{persistDowned(state)}catch{}
  }
}

export function enterDowned(player, capturedJashinMark, remainingTicks=DOWN_TICKS) {
  if(!valid(player)||finalDeathPending(player))return false;
  if(downed.has(player.id))return player.hasTag('desmaio:caido');
  const h=healthOf(player),before=Number(h?.currentValue)||0;
  if(!h||before<=0)return false;
  for(const s of [...revives.values()])if(s.actor.id===player.id)cancelRevive(s,'rescuer_downed');
  const jashinMark=capturedJashinMark||activeJashinMark(player);
  const remaining=Math.max(1,Math.min(DOWN_TICKS,Math.floor(Number(remainingTicks)||DOWN_TICKS)));
  const state={player,revision:characterRevision(player),remaining,remainingMs:remaining*50,clockPaused:false,expiresAt:Date.now()+remaining*50,rescuerId:undefined,
    progress:0,carrierId:undefined,carriedAt:0,anchor:{...player.location},dimensionId:player.dimension.id,
    jashinOwnerName:jashinMark?.owner,jashinOwnerHash:jashinMark?.ownerHash||(jashinMark?.owner?hashName(jashinMark.owner):0),jashinMarkUntilAtLatch:jashinMark?.until};
  try{
    state.controlLease=captureControlLease(player,DOWN_LEASE,{blindness:{amplifier:0,duration:40}},true);
    h.setCurrentValue(1);
    player.addTag('desmaio:caido');
    if(!player.hasTag('desmaio:caido'))throw Error('Tag de desmaio não confirmada');
    downed.set(player.id,state);
    setMovement(player,false);
    renewControlEffects(player,state.controlLease);
    persistDowned(state);
  }catch(error){
    downed.delete(player.id);
    clearClock(player);
    try{player.removeTag('desmaio:caido')}catch{}
    try{releaseControlLease(player,DOWN_LEASE,state.controlLease)}catch{}
    try{if(h.currentValue>0)h.setCurrentValue(Math.min(h.effectiveMax,before))}catch{}
    trace('unexpected',player,undefined,'Downed admission: '+error);
    return false;
  }
  try{playDownAnimation(player)}catch{}
  trace('downed_enter', player, player, 'remainingMs=' + timeLeftMs(state));
  showDownedTimer(state);
  // One guarded confirmation after the admission tick; no animation restart loop.
  system.run(()=>{if(valid(player)&&downed.get(player.id)===state)reconcileLiveBody(state,player);});
  try{player.sendMessage('§cVocê desmaiou! §fOutro jogador pode escolher Reviver no painel e permanecer ao seu lado por 10s. §bCarregar pausa o tempo. §4Finalização: agache, ataque e confirme. §fMorte automática em 2 minutos fora do transporte.')}catch{}
  return true;
}
// Registro tardio evita um ciclo de importação com a camada de Vida virtual.
registerDownedHandler(player=>globalImmortalActive(player)||enterDowned(player));
function playerById(id){return id?[...cachedPlayers()].find(p=>p.id===id):undefined}
function detachCarrier(state,notify=true,terminal=false){
 if(!state)return;
 const previousId=state.carrierId,carrier=playerById(previousId),player=state.player,lease=state.carryLease,claim=state.carryClaim;
 state.carrierId=undefined;state.carryLease=undefined;state.carriedAt=0;state.nativeCarry=false;state.mountPending=false;
 state.carryClaim=undefined;state.dropInput=undefined;state.travel=undefined;releaseAction(claim);
 if(previousId&&!terminal)resumeClock(state,state.dropReason||'requested');
 if(carrier&&valid(carrier)){
  if(valid(player))try{carrier.getComponent('minecraft:rideable')?.ejectRider(player);}catch{}
  try{carrier.triggerEvent('swbr:carry32_off')}catch{}
  try{carrier.removeTag("desmaio:carregando")}catch{}
  releaseControlLease(carrier,CARRY_LEASE,lease);
  try{syncNewContentVisuals(carrier)}catch{}
  if(notify)try{carrier.sendMessage(`§eVocê soltou ${player.name}.`)}catch{}
 }
 if(valid(player))try{
  player.removeTag('desmaio:carregado');
  if(!terminal&&previousId&&valid(player)&&(healthOf(player)?.currentValue??0)>0){
   const dim=player.dimension,origin=carrier?.dimension.id===dim.id?carrier.location:player.location;
   let placed=teleportPlayerSafely(player,dim,origin,{radius:2,maxDrop:4,maxRise:1});
   if(!placed&&state.groundDimension===dim.id&&state.groundAnchor)placed=teleportPlayerSafely(player,dim,state.groundAnchor,{radius:1,maxDrop:2,maxRise:1});
   state.anchor=placed?{...player.location}:undefined;
  }else state.anchor={...player.location};
  state.dimensionId=player.dimension.id;
 }catch(error){state.anchor=undefined;trace('unexpected',carrier,player,'drop: '+error)}
 if(previousId)trace('carry_drop',carrier||{id:previousId},valid(player)?player:{id:player.id},state.dropReason||'requested');
 state.dropReason=undefined;
 if(valid(player))try{syncNewContentVisuals(player)}catch{}
}
function startCarry(carrier,state){
 const target=state.player;
 if(!canAct(carrier,state,3)||!availableActor(carrier)||state.finalization||state.revive||timeLeftMs(state)<=0)return false;
 if([...downed.values()].some(s=>s.carrierId===carrier.id&&s!==state)||state.carrierId)return false;
 const claim=claimAction('carry',carrier,target);if(!claim)return false;
 let lease;try{lease=captureControlLease(carrier,CARRY_LEASE,{slowness:{amplifier:1,duration:20}})}catch(error){releaseAction(claim);trace('unexpected',carrier,target,error);return false}
 state.carrierId=carrier.id;state.carriedAt=system.currentTick;state.carrierRevision=characterRevision(carrier);state.rescuerId=undefined;state.progress=0;
 state.carryLease=lease;state.carryClaim=claim;
 state.groundAnchor={...target.location};state.groundDimension=target.dimension.id;
 try{
  pauseClock(state);
  carrier.triggerEvent('swbr:carry32_'+carrySeat(carrier,target));
  state.nativeCarry=false;state.mountPending=true;state.mountTries=0;
  carrier.addTag('desmaio:carregando');target.addTag('desmaio:carregado');syncNewContentVisuals(carrier);syncNewContentVisuals(target);
  state.dropInput=initialCarryInput(carrier);
 }catch(error){state.dropReason='start_failed';detachCarrier(state,false);trace('unexpected',carrier,target,error);return false;}
 trace('carry_start',carrier,target);
 carrier.sendMessage(`§bVocê está carregando ${target.name} nas costas. §7Agachar + pular para soltar, ou use !soltar.`);return true;
}

function carryingState(actor){
 const claim=actionFor(actor);
 if(claim?.kind!=='carry'||claim.actor!==actor.id)return;
 const state=downed.get(claim.target);
 return state?.carrierId===actor.id&&state.carryClaim===claim?state:undefined;
}
function carryTransition(player){
 const claim=actionFor(player);if(claim?.kind!=='carry')return false;
 const state=downed.get(claim.target),travel=state?.travel;
 if(!travel||system.currentTick>travel.until)return false;
 if(travel.phase==='moving')return true;
 const carrier=playerById(state.carrierId),target=state.player;
 return valid(carrier)&&valid(target)&&carrier.dimension.id===travel.dimension.id&&target.dimension.id===travel.dimension.id&&
  dist(carrier.location,travel.carrierAt)<5&&dist(target.location,travel.targetAt)<5;
}
function teleportCarriedParty(carrier,dimension,anchor,options){
 const state=carryingState(carrier),target=state?.player;
 if(!state||!canAct(carrier,state,5)||!state.clockPaused||state.finalization||state.revive)return false;
 const original={dimension:carrier.dimension,carrier:{...carrier.location},target:{...target.location},
  carrierRotation:carrier.getRotation(),targetRotation:target.getRotation()};
 state.travel={phase:'moving',until:system.currentTick+8};
 try{
  try{carrier.getComponent('minecraft:rideable')?.ejectRider(target)}catch(error){trace('unexpected',carrier,target,'travel dismount: '+error)}
  state.nativeCarry=false;
  if(!teleportPlayerSafely(carrier,dimension,anchor,options))throw Error('carrier_destination_unavailable');
  const spot=carrySpot(carrier,target),config={dimension,rotation:{x:0,y:carrier.getRotation().y},checkForBlocks:true,keepVelocity:false};
  let moved=false;
  if(canOccupy(dimension,spot))moved=target.tryTeleport(spot,config);
  if(!moved)moved=target.tryTeleport(carrier.location,config);
  if(!moved)throw Error('passenger_destination_unavailable');
  target.clearVelocity();state.anchor={...target.location};state.dimensionId=dimension.id;
  state.groundAnchor={...carrier.location};state.groundDimension=dimension.id;
  state.mountPending=!attachCarry(carrier,state);state.mountTries=0;
  state.travel={phase:'settling',until:system.currentTick+8,dimension,carrierAt:{...carrier.location},targetAt:{...target.location}};
  trace('carry_hiraishin',carrier,target,dimension.id+'; remainingMs='+timeLeftMs(state));
  return true;
 }catch(error){
  // Source coordinates belonged to this same live session immediately before
  // travel. Roll back both participants; never charge for a split transport.
  try{
   carrier.teleport(original.carrier,{dimension:original.dimension,rotation:original.carrierRotation,checkForBlocks:false});
   target.teleport(original.target,{dimension:original.dimension,rotation:original.targetRotation,checkForBlocks:false});
   state.anchor={...target.location};state.dimensionId=original.dimension.id;
   state.mountPending=!attachCarry(carrier,state);state.mountTries=0;
   state.travel={phase:'settling',until:system.currentTick+8,dimension:original.dimension,carrierAt:original.carrier,targetAt:original.target};
  }catch(rollbackError){state.travel=undefined;state.dropReason='travel_rollback_failed';detachCarrier(state,false);trace('unexpected',carrier,target,rollbackError)}
  trace('carry_hiraishin_cancel',carrier,target,String(error));return false;
 }
}
registerCarryTravel({teleport:teleportCarriedParty,transition:carryTransition});

function clearDowned(state, terminal=false) {
  const p = state.player;
  downed.delete(p.id);
  retireForms(p.id);
  if(state.finalization)cancelFinalization(state.finalization,'state_cleared');
  if(state.revive)cancelRevive(state.revive,'state_cleared');
  detachCarrier(state,false,terminal);
  clearClock(p);
  try { p.removeTag("desmaio:caido"); } catch {}
  releaseControlLease(p,DOWN_LEASE,state.controlLease);
  try{stopDownAnimation(p)}catch{}
  finishDownedProtection(p);
  if(!terminal)refreshDamageGuards(p,{force:true});
  trace('downed_cleanup',undefined,p,terminal?'death':'released');
}
function settleRevivedDamage(player){
 const revision=characterRevision(player),epoch=actionEpoch(player),life=bodyEpoch(player);
 // Reconciliação após reviver: nenhum estado do desmaio pode bloquear o PvP.
 // Não conceder invulnerabilidade, não mudar os cálculos gerais do combate.
 // Jobs antigos são invalidados por morte, novo desmaio ou troca de personagem.
 for(const delay of [1,3,10,20])system.runTimeout(()=>{
  if(!valid(player)||characterRevision(player)!==revision||actionEpoch(player)!==epoch||bodyEpoch(player)!==life||
   downed.has(player.id)||player.hasTag('desmaio:caido')||finalDeathPending(player)||
   (healthOf(player)?.currentValue??0)<=0)return;
  // Marcas temporárias só são válidas durante applyDamage síncrono.
  // Remoção adiada não interfere no hit ainda em processamento.
  try{player.removeTag('nzs_safe_damage_v18408');player.removeTag('nzs_virtual_damage_v18408');
      player.removeTag('nzs_converted_damage_v18732');}catch{}
  refreshDamageGuards(player,{force:true});
 },delay);
}
function restoreDownedLife(state, session) {
  const p = state.player;
  if (!valid(p) || downed.get(p.id) !== state || finalDeathPending(p) ||
      timeLeftMs(state) <= 0 || !(healthOf(p)?.currentValue > 0)) return false;
  if(session)cancelRevive(session,'completed');
  clearDowned(state);
  const h = healthOf(p);
  try { h?.setCurrentValue(Math.max(1, h.effectiveMax * 0.10)); } catch { try { h?.setCurrentValue(2); } catch {} }
  settleRevivedDamage(p);
  return true;
}

function revive(state, rescuer, session) {
  const p = state.player;
  if(!restoreDownedLife(state,session))return;
  // Sem Regeneração II automática: ela mascarava golpes pequenos após o revive
  // em jogadores com vida virtual comprimida. Os 10% de vida já foram aplicados.
  try { p.sendMessage(`§aVocê foi revivido por ${rescuer.name}! §fVida restaurada: 10%.`); } catch {}
  try { rescuer.sendMessage(`§aVocê reviveu ${p.name}!`); } catch {}
}

// Ponte para jutsus oficiais de cura/reanimação. Limpa o estado interno inteiro,
// não apenas a tag visual, para o sistema não derrubar o jogador novamente.
export function wakePlayer(player) {
  if(!valid(player)||finalDeathPending(player)||(healthOf(player)?.currentValue??0)<=0)return false;
  if(!downed.has(player.id)&&player.hasTag('desmaio:caido'))recoverDowned(player);
  const state = downed.get(player.id);
  return !!state && restoreDownedLife(state);
}
export function isPlayerDowned(player) { return !!player?.id && downed.has(player.id); }
function completeRespawn(player, wasFinalized) {
  purgeDownedStateOnSpawn(player, true);
  clearClock(player);
  clearFinalDeath(player);
  restoreNativeHealth(player, true);
  finishDownedProtection(player);
  if(!wasFinalized)return;
  trace('native_respawn',player,player,'engine spawn retained');
  try{player.sendMessage('§7Você foi finalizado. O Minecraft definiu seu ponto de renascimento.')}catch{}
}

function recoverInterruptedDeath(p) {
  if(deathAttempts.has(p.id))return true;
  const saved = readDeathAttempt(p);
  if(!saved)return false;
  const health = healthOf(p);
  if(!health || health.currentValue <= 0)return true;
  if(saved.revision !== characterRevision(p)) {
    purgeDownedStateOnSpawn(p,true);
    clearClock(p);
    clearFinalDeath(p);
    restoreNativeHealth(p,false);
    finishDownedProtection(p);
    return true;
  }
  // A confirmed death, or a completed native respawn after a shutdown before
  // the receipt was updated, cannot kill the newly spawned actor again.
  const alreadySpawned = (saved.killRequested || saved.issued || saved.zeroRequested) &&
    health.effectiveMin > 0 && health.currentValue > 1;
  if(saved.confirmed || alreadySpawned) {
    completeRespawn(p,true);
    return true;
  }
  return performRealDeath(p,undefined,undefined,saved);
}
function recoverDowned(p){
 if(downed.has(p.id))return;
 if(recoverInterruptedDeath(p))return;
 let saved,backup;
 try{saved=JSON.parse(String(p.getDynamicProperty(SAVED_DOWNED)||'null'))}catch(error){trace('unexpected',p,undefined,'clock read: '+error)}
 try{backup=JSON.parse(String(world.getDynamicProperty(clockKey(p))||'null'))}catch(error){trace('unexpected',p,undefined,'world clock read: '+error)}
 if(backup?.clockVersion===45&&backup.revision===characterRevision(p))saved=backup;
 const orphanedCarry=p.hasTag('desmaio:carregado')||saved?.clockVersion===45&&saved.paused===true;
 purgeDownedStateOnSpawn(p);
 if(!saved||saved.revision!==characterRevision(p)||finalDeathPending(p)||(healthOf(p)?.currentValue??0)<=0){
  clearClock(p);return;
 }
 const paused=saved.clockVersion===45&&saved.paused===true;
 let ms=paused?saved.remainingMs:Number(saved.expiresAt)-Date.now();
 if(!Number.isFinite(ms)||paused&&(ms<0||ms>DOWN_TICKS*50)){clearClock(p);trace('orphan_cleanup',p,undefined,'invalid_clock');return;}
 ms=Math.min(DOWN_TICKS*50,ms);
 if(ms<=0){performRealDeath(p);return;}
 let grounded=true;
 if(orphanedCarry){
  try{p.runCommand('ride @s stop_riding')}catch(error){trace('unexpected',p,undefined,'orphan dismount: '+error)}
  try{grounded=teleportPlayerSafely(p,p.dimension,p.location,{radius:2,maxDrop:4,maxRise:1})}
  catch(error){grounded=false;trace('unexpected',p,undefined,'orphan drop: '+error)}
  trace('orphan_cleanup',p,undefined,'transport_dropped');
 }
 if(enterDowned(p,saved.mark,Math.ceil(ms/50))){
  const state=downed.get(p.id);state.expiresAt=Date.now()+ms;state.remainingMs=ms;persistDowned(state);
  if(!grounded)state.anchor=undefined;
  if(paused)trace('clock_resume',undefined,p,'orphaned_transport; remainingMs='+ms);
 }
}
system.run(()=>{for(const p of cachedPlayers())try{recoverDowned(p)}catch(error){trace('unexpected',p,undefined,'session recovery: '+error)}});
// Sessões narrativas (como a dominação de Bijū) podem manter o estado de
// desmaio ativo sem permitir que o cronômetro global mate o jogador no meio da cena.
export function keepPlayerDowned(player, minimumTicks = 200) {
  const state=downed.get(player?.id);if(!state)return false;
  if(finalDeathPending(player)||timeLeftMs(state)<=0)return false;
  if(state.clockPaused)return true;
  const n=Number(minimumTicks),minimum=Number.isFinite(n)?Math.max(20,Math.min(DOWN_TICKS,Math.floor(n))):200;
  state.remainingMs=Math.max(timeLeftMs(state),minimum*50);state.remaining=Math.ceil(state.remainingMs/50);
  state.expiresAt=Date.now()+state.remainingMs;
  try{persistDowned(state)}catch{}
  return true;
}
function reallyDie(state) {
  const p = state.player;
  if (downed.get(p.id)!==state || state.clockPaused || timeLeftMs(state)>0 || finalDeathPending(p))return;
  // Mantém a regra já existente de creditar a morte automática, mas agora aceita
  // a marca que foi travada enquanto o alvo estava desmaiado.
  try{
    latchJashinMark(state);
    const liveMark = activeJashinMark(p);
    const ownerHash = liveMark?.ownerHash || state.jashinOwnerHash || (state.jashinOwnerName ? hashName(state.jashinOwnerName) : 0);
    const owner=[...cachedPlayers()].find(x=>hashName(x.name)===ownerHash);
    if(owner)grantJashinFinalizeCredit(owner,p,state);
  }catch{}
  if(performRealDeath(p,state))trace('clock_expired',undefined,p);
}
function jashinEquipped(p){
  try{const id=p.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Head)?.typeId;return id===JASHIN_MODE||id===HIDAN_MODE;}catch{return false;}
}
function grantJashinFinalizeCredit(){return false;} // Hidan/Jashin: no immortality reward.

function canAct(actor,state,range=FINALIZE_DISTANCE){
 const victim=state?.player;
 try{return !!state&&downed.get(victim.id)===state&&valid(actor)&&valid(victim)&&actor.id!==victim.id&&
  (healthOf(actor)?.currentValue??0)>0&&(healthOf(victim)?.currentValue??0)>0&&
  !downed.has(actor.id)&&!actor.hasTag('desmaio:caido')&&!finalDeathPending(actor)&&!finalDeathPending(victim)&&
  victim.hasTag('desmaio:caido')&&characterRevision(victim)===state.revision&&timeLeftMs(state)>0&&
  actor.dimension.id===victim.dimension.id&&dist(actor.location,victim.location)<=range;
 }catch{return false}
}
function availableActor(actor){
 try{return !actor.getTags().some(tag=>['desmaio:carregando','desmaio:carregado',REVIVE_TAG,FINISH_TAG,'nzs_jailed_v1569','nzs_punishment_frozen','nzs_captured_v147','nzw_surgery','nzw_grabbed','nzs_genjutsu_immersive','nzs_genjutsu_controlled','nzs_shadow_bound'].includes(tag));}
 catch{return false}
}
function cancelRevive(session,reason){
 if(!session||revives.get(session.state.player.id)!==session)return;
 const actor=session.actor,target=session.state.player;
 revives.delete(target.id);session.state.revive=undefined;releaseAction(session.claim);
 try{actor.removeTag(REVIVE_TAG);actor.onScreenDisplay.setActionBar(reason==='completed'?'§aSocorro concluído':'§eSocorro cancelado')}catch(error){if(valid(actor))trace('unexpected',actor,target,error)}
 trace(reason==='completed'?'revive_complete':'revive_cancel',actor,target,reason);
}
function startRevive(actor,state){
 if(!canAct(actor,state,REVIVE_DISTANCE)||!availableActor(actor)||state.carrierId||state.finalization||state.revive||timeLeftMs(state)<=0)return false;
 const claim=claimAction('revive',actor,state.player);if(!claim)return false;
 const session={actor,state,claim,revision:characterRevision(actor),dimension:actor.dimension.id,
  anchor:{...actor.location},until:system.currentTick+REVIVE_TICKS};
 state.revive=session;revives.set(state.player.id,session);
 try{actor.addTag(REVIVE_TAG);actor.onScreenDisplay.setActionBar('§aRevivendo '+state.player.name+'... §f10s — permaneça parado')}
 catch(error){cancelRevive(session,'start_failed');trace('unexpected',actor,state.player,error);return false;}
 trace('revive_start',actor,state.player);return true;
}
function tickRevives(){
 for(const s of [...revives.values()]){
  const actor=s.actor,target=s.state.player;
  let reason;
  if(!valid(actor)||!valid(target))reason='disconnected';
  else if((healthOf(actor)?.currentValue??0)<=0||(healthOf(target)?.currentValue??0)<=0)reason='death';
  else if(actor.dimension.id!==s.dimension||target.dimension.id!==s.dimension)reason='dimension_changed';
  else if(characterRevision(actor)!==s.revision||characterRevision(target)!==s.state.revision)reason='character_changed';
  else if(timeLeftMs(s.state)<=0)reason='target_timeout';
  else if(!canAct(actor,s.state,REVIVE_DISTANCE))reason='distance_or_state';
  else if(s.state.carrierId||s.state.finalization||actionFor(actor)!==s.claim||actionFor(target)!==s.claim||!actor.hasTag(REVIVE_TAG))reason='action_changed';
  else if(actor.getTags().some(t=>['desmaio:carregando','desmaio:carregado',FINISH_TAG,'nzw_surgery','nzw_grabbed','nzs_jailed_v1569','nzs_punishment_frozen','nzs_captured_v147','nzs_genjutsu_immersive','nzs_genjutsu_controlled','nzs_shadow_bound'].includes(t)))reason='incompatible_state';
  else if(dist(actor.location,s.anchor)>.15)reason='movement';
  if(!reason&&actor.inputInfo?.getMovementVector)try{const v=actor.inputInfo.getMovementVector();if(Math.hypot(v.x,v.y)>.1)reason='movement_input'}catch(error){trace('unexpected',actor,target,'revive input: '+error);reason='input_unavailable';}
  if(reason){cancelRevive(s,reason);continue;}
  if(system.currentTick>=s.until){revive(s.state,actor,s);continue;}
  if((s.until-system.currentTick)%20===0)try{actor.onScreenDisplay.setActionBar(`§aRevivendo ${target.name}... §f${Math.ceil((s.until-system.currentTick)/20)}s — permaneça parado`)}catch(error){trace('unexpected',actor,target,error)}
 }
}
function initialCarryInput(carrier){
 try{
  const sneak=carrier.inputInfo.getButtonState(InputButton.Sneak)===ButtonState.Pressed||carrier.isSneaking;
  const jump=carrier.inputInfo.getButtonState(InputButton.Jump)===ButtonState.Pressed;
  return {sneak:!!sneak,jump:!!jump,lastSneak:-Infinity,lastJump:-Infinity,latched:!!(sneak&&jump)};
 }catch(error){trace('unexpected',carrier,undefined,'carry input unavailable; use panel/!soltar: '+error);return {unavailable:true};}
}
function checkDropInput(state,carrier,event){
 const input=state.dropInput;if(!input||input.unavailable)return;
 try{
  const sneak=(event?.button===InputButton.Sneak?event.newButtonState===ButtonState.Pressed:carrier.inputInfo.getButtonState(InputButton.Sneak)===ButtonState.Pressed)||carrier.isSneaking;
  const jump=event?.button===InputButton.Jump?event.newButtonState===ButtonState.Pressed:carrier.inputInfo.getButtonState(InputButton.Jump)===ButtonState.Pressed;
  const now=system.currentTick,sneakEdge=sneak&&!input.sneak,jumpEdge=jump&&!input.jump;
  if(sneakEdge)input.lastSneak=now;if(jumpEdge)input.lastJump=now;
  const combo=(jumpEdge&&(sneak||now-input.lastSneak<=4))||(sneakEdge&&(jump||now-input.lastJump<=4));
  if(combo&&!input.latched){input.latched=true;state.dropReason='sneak_jump';detachCarrier(state);return;}
  if(!sneak&&!jump)input.latched=false;
  input.sneak=!!sneak;input.jump=!!jump;
 }catch(error){input.unavailable=true;trace('unexpected',carrier,state.player,'carry input: '+error)}
}
world.afterEvents.playerButtonInput.subscribe(event=>{
 if(event.button!==InputButton.Jump&&event.button!==InputButton.Sneak)return;
 const state=[...downed.values()].find(s=>s.carrierId===event.player.id);
 if(state)checkDropInput(state,event.player,event);
});
function facesTarget(actor,target){
 try{const v=actor.getViewDirection(),dx=target.location.x-actor.location.x,dz=target.location.z-actor.location.z;
  const d=Math.hypot(dx,dz),l=Math.hypot(v.x,v.z);return d<.6||l>.001&&(dx*v.x+dz*v.z)/(d*l)>=.25;
 }catch{return false}
}
function cancelFinalization(session,reason){
 if(!session||finalizations.get(session.state.player.id)!==session)return;
 const actor=session.actor,victim=session.state.player;
 finalizations.delete(victim.id);session.state.finalization=undefined;
 releaseAction(session.claim);
 try{actor.removeTag(FINISH_TAG);releaseControlLease(actor,FINISH_LEASE,session.lease)}catch(error){trace('unexpected',actor,victim,error)}
 for(const p of [actor,victim])try{p.playAnimation('animation.swbr44.release',{controller:'swbr44_finalize',blendOutTime:.1})}catch{}
 if(reason!=='committed')trace('finalize_cancel',actor,victim,reason);
}
function finalizeDowned(finisher,victim){
 const state=downed.get(victim.id);
 if(!canAct(finisher,state)||state.finalization||state.revive||finisher.hasTag(REVIVE_TAG)||finisher.hasTag(FINISH_TAG)||!facesTarget(finisher,victim))return;
 if(state.carrierId&&state.carrierId!==finisher.id)return;
 if([...downed.values()].some(s=>s.carrierId===finisher.id&&s!==state))return;
 if(state.carrierId){state.dropReason='finalize';detachCarrier(state,false);}
 const claim=claimAction('finalize',finisher,victim);if(!claim)return;
 let lease;try{lease=captureControlLease(finisher,FINISH_LEASE,{},true)}catch(error){releaseAction(claim);trace('unexpected',finisher,victim,error);return;}
 const session={actor:finisher,state,lease,claim,revision:characterRevision(finisher),dimension:finisher.dimension.id,
  anchor:{...finisher.location},until:system.currentTick+FINALIZE_TICKS};
 state.finalization=session;state.progress=0;state.rescuerId=undefined;finalizations.set(victim.id,session);
 try{finisher.addTag(FINISH_TAG);renewControlEffects(finisher,lease)}catch(error){cancelFinalization(session,'start_failed');trace('unexpected',finisher,victim,error);return;}
 for(const [p,name]of [[finisher,'finisher'],[victim,'victim']])try{
  p.playAnimation('animation.swbr44.'+name,{controller:'swbr44_finalize',blendOutTime:.1});
 }catch(error){trace('unexpected',finisher,victim,'animation: '+error)}
 trace('finalize_start',finisher,victim);
}
function tickFinalizations(){
 for(const s of [...finalizations.values()]){
  const actor=s.actor,victim=s.state.player;
  let reason;
  if(!valid(actor)||!valid(victim))reason='disconnected';
  else if((healthOf(actor)?.currentValue??0)<=0)reason='executor_dead';
  else if(actor.dimension.id!==s.dimension||victim.dimension.id!==s.dimension)reason='dimension_changed';
  else if(characterRevision(actor)!==s.revision)reason='character_changed';
  else if(!canAct(actor,s.state)||s.state.carrierId)reason='state_changed';
  else if(actionFor(actor)!==s.claim||actionFor(victim)!==s.claim)reason='action_changed';
  else if(dist(actor.location,s.anchor)>.8||!facesTarget(actor,victim))reason='moved_or_turned';
  if(reason){cancelFinalization(s,reason);continue;}
  try{renewControlEffects(actor,s.lease)}catch(error){cancelFinalization(s,'control_failed');trace('unexpected',actor,victim,error);continue;}
  if(system.currentTick<s.until)continue;
  cancelFinalization(s,'committed');
  try{victim.setDynamicProperty('nzs_last_pvp_killer',actor.name);victim.setDynamicProperty('nzs_last_pvp_tick',system.currentTick)}catch{}
  grantJashinFinalizeCredit(actor,victim,s.state);
  performRealDeath(victim,s.state,actor);
 }
}
function promptFinalize(finisher,victim){
  const state=downed.get(victim?.id);
  if(!canAct(finisher,state)||state.finalization||state.revive||finisher.hasTag(REVIVE_TAG)||finisher.hasTag(FINISH_TAG)||state.carrierId&&state.carrierId!==finisher.id)return;
  const key=`${finisher.id}:${victim.id}`;if(finalizeForms.has(key))return;
  const token={actor:finisher.id,target:victim.id,actorEpoch:actionEpoch(finisher),targetEpoch:actionEpoch(victim)};finalizeForms.set(key,token);
  const form=new ActionFormData().title("§4§lFINALIZAÇÃO")
    .body(`§cFinalizar ${victim.name}?\n\n§7A ação leva 0,8s e cancela se você se afastar, virar, morrer ou perder o alvo.`)
    .button("§4FINALIZAR")
    .button("§aCancelar")
    ;
  showSessionForm(form,finisher,()=>finalizeForms.get(key)===token&&actionEpoch(finisher)===token.actorEpoch&&actionEpoch(victim)===token.targetEpoch&&canAct(finisher,state)&&!state.finalization&&!state.revive,[victim])
   .then(r=>{if(finalizeForms.get(key)!==token)return;if(!r.canceled&&r.selection===0)finalizeDowned(finisher,victim)})
   .catch(error=>trace('unexpected',finisher,victim,'finalize form: '+error))
   .finally(()=>{if(finalizeForms.get(key)===token)finalizeForms.delete(key)});
}
function promptDownedActions(player,victim){
  const state=downed.get(victim?.id);if(!canAct(player,state)||state.finalization||state.revive||player.hasTag(FINISH_TAG)||player.hasTag(REVIVE_TAG))return;
  const key=`${player.id}:${victim.id}`;if(actionForms.has(key))return;
  const token={actor:player.id,target:victim.id,actorEpoch:actionEpoch(player),targetEpoch:actionEpoch(victim)};actionForms.set(key,token);
  const mine=state.carrierId===player.id;
  const f=new ActionFormData().title("§l§bJOGADOR DESMAIADO").body(`§f${victim.name}\n§7Escolha como interagir com o corpo.`)
    .button(mine?"§eSoltar jogador":"§bCarregar jogador")
    .button("§aReviver jogador — 10 segundos")
    .button("§4Finalizar jogador")
    .button("§7Cancelar");
  showSessionForm(f,player,()=>actionForms.get(key)===token&&actionEpoch(player)===token.actorEpoch&&actionEpoch(victim)===token.targetEpoch&&canAct(player,state)&&!state.finalization&&!state.revive,[victim]).then(r=>{
   if(actionForms.get(key)!==token||r.canceled||r.selection===3)return;
   if(r.selection===0){if(mine){if(state.carrierId===player.id){state.dropReason='menu';detachCarrier(state)}}else startCarry(player,state);return}
   if(r.selection===1)startRevive(player,state);
   if(r.selection===2)promptFinalize(player,victim);
  }).catch(error=>trace('unexpected',player,victim,'body form: '+error))
   .finally(()=>{if(actionForms.get(key)===token)actionForms.delete(key)});
}
registerDownedActionHandler((actor,victim,action)=>action==='finalize'?promptFinalize(actor,victim):promptDownedActions(actor,victim));

// Contact remains observable even when the damage sensor suppresses raw PvP.
// Use exactly the hit entity; never replace it with a nearby bystander.
world.afterEvents.entityHitEntity.subscribe(({damagingEntity:actor,hitEntity:victim})=>{
 if(!isPlayer(actor)||!isPlayer(victim))return;
 const state=downed.get(victim.id);if(!state)return;
 const old=entryTicks.get(actor.id)??-100;if(system.currentTick-old<8)return;
 entryTicks.set(actor.id,system.currentTick);
 system.run(()=>{
  if(downed.get(victim.id)!==state||!valid(actor))return;
  if(actor.isSneaking)promptFinalize(actor,victim);else promptDownedActions(actor,victim);
 });
});
function selectedBody(actor,name=''){
 const candidates=[...downed.values()].filter(s=>canAct(actor,s));
 if(name)return candidates.find(s=>s.player.name.toLowerCase()===name.toLowerCase());
 return candidates.filter(s=>facesTarget(actor,s.player)).sort((a,b)=>dist(actor.location,a.player.location)-dist(actor.location,b.player.location))[0];
}
function bodyCommand(actor,action,name=''){
 if(!valid(actor))return;
 if(action==='soltar'){
  const state=[...downed.values()].find(s=>s.carrierId===actor.id);
  if(state){state.dropReason='command';detachCarrier(state)}return;
 }
 const state=selectedBody(actor,name);
 if(!state){try{actor.sendMessage('§eOlhe para um jogador desmaiado a até 3,5 blocos, ou informe o nome exato.')}catch{}return;}
 if(action==='carregar')startCarry(actor,state);
 else if(action==='reviver')startRevive(actor,state);
 else if(action==='finalizar')promptFinalize(actor,state.player);
 else promptDownedActions(actor,state.player);
}
world.beforeEvents.chatSend?.subscribe(e=>{
 const match=/^!(corpo|carregar|soltar|reviver|finalizar)(?:\s+(.*))?$/i.exec(String(e.message||'').trim());
 if(!match)return;e.cancel=true;system.run(()=>bodyCommand(e.sender,match[1].toLowerCase(),String(match[2]||'').trim()));
});
system.afterEvents.scriptEventReceive.subscribe(e=>{
 if(e.id==='swbr:corpo_diagnostico'){
  const players=cachedPlayers().slice(0,32).map(p=>{
   try{
    const h=healthOf(p),effect=p.getEffect('resistance');
    return {player:p.name,revision:characterRevision(p),hp:h?.currentValue,max:h?.effectiveMax,min:h?.effectiveMin,
     healthSensor:hasSafeHealthSensor(p),mark:p.getComponent('minecraft:mark_variant')?.value,
     damageGuard:p.getProperty('nzs:damage_guard_v1871'),
     protectionTags:['desmaio:caido','desmaio:carregado','desmaio:carregando','desmaio:revivendo',FINISH_TAG,
      FINALIZATION_DEATH_TAG,'nzs_safe_damage_v18408','nzs_virtual_damage_v18408','nzs_phase_v18385',
      'nzs_henge_substitution_active_v17052','nzs_safe_zone_active'].filter(t=>p.hasTag(t)),
     resistance:effect?{amplifier:effect.amplifier,duration:effect.duration}:null};
   }catch(error){return {player:p.name,error:String(error)}}
  });
  const report={version:'18.11.83',active:{downed:downed.size,carrying:[...downed.values()].filter(s=>s.carrierId).length,
   reviving:revives.size,finalizing:finalizations.size,deathPending:deathAttempts.size,forms:actionForms.size+finalizeForms.size},
   clocks:[...downed.values()].map(s=>({player:s.player.name,paused:s.clockPaused,remainingMs:timeLeftMs(s)})),players,...diagnostics};
  const text=JSON.stringify(report);
  if(isPlayer(e.sourceEntity))e.sourceEntity.sendMessage('§b[SWBR Desmaio] '+text);else console.warn('[SWBR Desmaio] '+text);return;
 }
 if(e.id==='swbr:corpo'&&isPlayer(e.sourceEntity)){
  const [action,...name]=String(e.message||'corpo').trim().split(/\s+/);
  if(['corpo','carregar','soltar','reviver','finalizar'].includes(action))system.run(()=>bodyCommand(e.sourceEntity,action,name.join(' ')));
 }
});
// The API 2.6 service guards native attack damage. These gates cover scripts,
// use and interaction before their mutation handlers can start an incompatible action.
for(const [name,key]of [['itemUse','source'],['playerInteractWithBlock','player'],['playerInteractWithEntity','player'],['playerBreakBlock','player'],['playerPlaceBlock','player']])try{
 world.beforeEvents[name]?.subscribe(e=>{const p=e[key];if(p?.hasTag(FINALIZATION_DEATH_TAG)){e.cancel=true;return;}if(p&&(p.hasTag(FINISH_TAG)||p.hasTag(REVIVE_TAG)||p.hasTag('desmaio:carregando'))){
  if(name==='itemUse'&&e.itemStack?.typeId==='nz:hiraishin'&&actionFor(p)?.kind==='carry'&&actionFor(p).actor===p.id&&!p.hasTag(FINISH_TAG)&&!p.hasTag(REVIVE_TAG))return;
  e.cancel=true;
 }});
}catch(error){trace('unexpected',undefined,undefined,'action gate: '+error)}

// Native damage is reserved before the health write by the API 2.6 service
// or the leased player damage sensor. Never resurrect from an after-hurt event:
// the engine may already have committed death, loot and respawn at that point.

// Clique/interação também abre a finalização, quando a versão do Bedrock expõe o evento para player.
try{
  world.beforeEvents.playerInteractWithEntity?.subscribe(ev=>{
    const target=ev.target, player=ev.player;
    if(!target||!player||!downed.has(target.id)||player.id===target.id)return;
    const state=downed.get(target.id);
    try{ev.cancel=true;}catch{}
    system.run(()=>{if(downed.get(target.id)===state)promptDownedActions(player,target);});
  });
}catch{}

world.afterEvents.playerSpawn.subscribe(ev => {
  const p = ev.player;
  if(!valid(p))return;
  retireForms(p.id);
  if(ev.initialSpawn&&recoverInterruptedDeath(p))return;
  const wasFinalized=finalDeathPending(p)||deathAttempts.has(p.id)||!!readDeathAttempt(p);
  if(!wasFinalized&&isProtectedDownedLife(p)){
    const state=downed.get(p.id);
    if(state&&reconcileLiveBody(state,p))return;
    // A delayed spawn acknowledgment can precede the floor's scheduled handler.
    // Only a still-positive reserved value can be admitted here, never a corpse.
    const hp=healthOf(p)?.currentValue??0;
    if(hp>0&&hp<=LIVE_HEALTH_FLOOR*1.1&&defeatPlayer(p)&&downed.has(p.id))return;
  }
  if(ev.initialSpawn&&!wasFinalized){recoverDowned(p);return;}
  if(!ev.initialSpawn&&wasFinalized)confirmDeath(p);
  completeRespawn(p,wasFinalized);
});

watchInterval('desmaio_estado62',() => {
  if(!downed.size)return;
  const players=cachedPlayers(),byId=new Map(players.map(p=>[p.id,p]));
  for (const state of [...downed.values()]) {
    const p = state.player;
    if (!valid(p)) { detachCarrier(state,false);downed.delete(p?.id);continue; }
    if(characterRevision(p)!==state.revision){clearDowned(state);continue;}
    if(finalDeathPending(p)||(healthOf(p)?.currentValue??0)<=0||!p.hasTag('desmaio:caido')){clearDowned(state,true);continue;}
    if(!state.carrierId&&state.clockPaused)resumeClock(state,'carrier_missing');
    if(p.dimension.id!==state.dimensionId){state.dropReason='dimension_changed';detachCarrier(state,false);state.anchor={...p.location};state.dimensionId=p.dimension.id;}
    // Short leases expire on their own if this runtime stops or loses the session.
    try{renewControlEffects(p,state.controlLease);}catch{}
    state.remaining=Math.ceil(timeLeftMs(state)/50);
    // Também captura uma marca válida aplicada enquanto o jogador já está caído.
    latchJashinMark(state);
    try {
      const carrier=byId.get(state.carrierId);
      if(state.carrierId&&(!valid(carrier)||(healthOf(carrier)?.currentValue??0)<=0||downed.has(carrier.id)||carrier.dimension.id!==p.dimension.id||characterRevision(carrier)!==state.carrierRevision)){state.dropReason='carrier_invalid';detachCarrier(state,false)}
      else if(carrier){
        const spot=carrySpot(carrier,p);
        if(!state.nativeCarry&&!state.mountPending&&(dist(p.location,spot)>4||!canOccupy(p.dimension,spot))){state.dropReason='distance_or_obstruction';detachCarrier(state,false);continue;}
        if(state.nativeCarry&&!carrier.getComponent('minecraft:rideable')?.getRiders().some(r=>r.id===p.id)){detachCarrier(state,false);continue;}
        state.anchor={...p.location};state.dimensionId=carrier.dimension.id;
        try{renewControlEffects(carrier,state.carryLease);carrier.onScreenDisplay.setActionBar(`§bCarregando ${p.name} §7— agachar + pular para soltar`)}catch(error){trace('unexpected',carrier,p,error)}
      } else {
        if (p.dimension.id !== state.dimensionId) { state.anchor={...p.location}; state.dimensionId=p.dimension.id; }
        if(!state.anchor){
         const at=p.location,below=p.dimension.getBlock({x:Math.floor(at.x),y:Math.floor(at.y-.05),z:Math.floor(at.z)});
         if(below&&!below.isAir)state.anchor={...at};
        }
        if(state.anchor&&dist(p.location,state.anchor)>4)state.anchor={...p.location};
        if (state.anchor&&dist(p.location,state.anchor) > 0.15) p.teleport(state.anchor, { dimension:p.dimension, rotation:p.getRotation() });
      }
    } catch(error){state.dropReason='carry_check_failed';detachCarrier(state,false);trace('unexpected',undefined,p,error)}
    if (!state.clockPaused&&timeLeftMs(state)<=0) { reallyDie(state); continue; }
    try{const h=healthOf(p);if(h&&h.currentValue>0&&h.currentValue!==1)h.setCurrentValue(1);}catch{}
    if(system.currentTick%20===0)showDownedTimer(state);
  }
}, CHECK_INTERVAL);

function retireForms(playerId){
 entryTicks.delete(playerId);
 for(const forms of [actionForms,finalizeForms])for(const [key,t]of forms)if(t.actor===playerId||t.target===playerId)forms.delete(key);
}
world.afterEvents.playerLeave.subscribe(({playerId})=>{
 cancelDeathCallback(playerId);
 retireForms(playerId);
 for(const s of [...finalizations.values()])if(s.actor.id===playerId||s.state.player.id===playerId)cancelFinalization(s,'disconnected');
 for(const s of [...revives.values()])if(s.actor.id===playerId||s.state.player.id===playerId)cancelRevive(s,'disconnected');
 const state=downed.get(playerId);if(state){state.dropReason='target_disconnected';detachCarrier(state,false);downed.delete(playerId);}
 for(const s of downed.values())if(s.carrierId===playerId){s.dropReason='carrier_disconnected';detachCarrier(s,false);}
 retireParticipant(playerId);
});
world.afterEvents.playerDimensionChange?.subscribe(({player})=>{
 if(isCarryTravelTransition(player))return;
 for(const s of [...finalizations.values()])if(s.actor.id===player.id||s.state.player.id===player.id)cancelFinalization(s,'dimension_changed');
 for(const s of [...revives.values()])if(s.actor.id===player.id||s.state.player.id===player.id)cancelRevive(s,'dimension_changed');
 for(const state of downed.values())if(state.carrierId===player.id||state.player.id===player.id){state.dropReason='dimension_changed';detachCarrier(state,false);}
 retireForms(player.id);
 retireParticipant(player.id);
});
world.afterEvents.entityDie.subscribe(({deadEntity})=>{
 if(deadEntity.typeId!=='minecraft:player')return;
 if(deathAttempts.has(deadEntity.id)||finalDeathPending(deadEntity))confirmDeath(deadEntity);
 if(isProtectedDownedLife(deadEntity)){
  const state=downed.get(deadEntity.id);
  if(state)system.run(()=>{if(valid(deadEntity))reconcileLiveBody(state,deadEntity);});
  return;
 }
 if(!valid(deadEntity)){
  const id=deadEntity.id,state=downed.get(id);
  downed.delete(id);
  if(state)detachCarrier(state,false,true);
  for(const carried of downed.values())if(carried.carrierId===id)detachCarrier(carried,false);
  retireForms(id);
  retireParticipant(id);
  try{world.setDynamicProperty(clockKey(deadEntity),undefined)}catch{}
  return;
 }
 purgeDownedStateOnSpawn(deadEntity,true);
 clearClock(deadEntity);
});

// Only the compatibility path needs position correction. Native passengers
// follow the carrier in the engine, including turns, jumps and network frames.
watchInterval('carregamento_desmaio',()=>{
 tickFinalizations();
 tickRevives();
 for(const state of downed.values()){
  if(!state.carrierId)continue;
  if(state.travel&&system.currentTick>state.travel.until)state.travel=undefined;
  const carrier=playerById(state.carrierId),p=state.player;
  if(!canAct(carrier,state,5)||state.finalization||characterRevision(carrier)!==state.carrierRevision){state.dropReason='state_changed';detachCarrier(state,false);continue;}
  if(actionFor(carrier)!==state.carryClaim||actionFor(p)!==state.carryClaim){state.dropReason='reservation_lost';detachCarrier(state,false);continue;}
  checkDropInput(state,carrier);
  if(!state.carrierId)continue;
  if(state.mountPending){
   if(attachCarry(carrier,state)){state.mountPending=false;trace('carry_native',carrier,p)}
   else if(++state.mountTries>=3){state.mountPending=false;trace('carry_compatibility',carrier,p,'native_mount_unavailable');}
   else continue;
  }
  if(state.nativeCarry){
   try{if(!carrier.getComponent('minecraft:rideable')?.getRiders().some(r=>r.id===p.id)){state.dropReason='mount_lost';detachCarrier(state,false)}}catch(error){state.dropReason='mount_error';detachCarrier(state,false);trace('unexpected',carrier,p,error)}
   continue;
  }
  try{
   const spot=carrySpot(carrier,p);
   if(dist(p.location,spot)>4||!canOccupy(p.dimension,spot)){state.dropReason='distance_or_obstruction';detachCarrier(state,false);continue;}
   p.teleport(spot,{dimension:carrier.dimension,rotation:{x:0,y:carrier.getRotation().y},checkForBlocks:true,keepVelocity:false});
   p.clearVelocity();
  }catch(error){state.dropReason='teleport_failed';detachCarrier(state,false);trace('unexpected',carrier,p,error)}
 }
},1);
