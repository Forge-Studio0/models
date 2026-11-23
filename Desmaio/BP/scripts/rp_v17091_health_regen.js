import { fatigueFactors, prop } from "./rp_v1840_policy.js";
import { world, system } from "@minecraft/server";
import { isFinalDeath } from './rp_v18719_downed_bridge.js';

// v17.0.91 — regeneração passiva centralizada.
// O Minecraft não regenera mais 1 ponto por vez pela fome. Depois de 60s sem
// tomar/causar dano, recupera 10% da VIDA ATUAL MÁXIMA por segundo.
const REGEN_DELAY_TICKS = 20 * 60;
const REGEN_INTERVAL_TICKS = 20;
const REGEN_FRACTION = 0.10;
const COMBAT_LOCK_TICKS = 20 * 10;
const regenReadyAt = new Map();
const combatUntil = new Map();

function validPlayer(p){
  try{return !!p && p.typeId === "minecraft:player" && (typeof p.isValid !== "function" || p.isValid());}catch{return false;}
}
export function markCombatActivity(p,{lockHealthRegen=true,ticks=COMBAT_LOCK_TICKS}={}){
  if(!validPlayer(p)) return;
  combatUntil.set(p.id,Math.max(combatUntil.get(p.id)||0,system.currentTick+Math.max(1,Math.floor(ticks))));
  if(lockHealthRegen)regenReadyAt.set(p.id, system.currentTick + REGEN_DELAY_TICKS);
}
export function getCombatTicksLeft(p){
  if(!validPlayer(p))return 0;
  const left=(combatUntil.get(p.id)||0)-system.currentTick;
  if(left<=0){combatUntil.delete(p.id);return 0}
  return left;
}
export function isPlayerInCombat(p){return getCombatTicksLeft(p)>0}
function lockRegen(p){
  markCombatActivity(p,{lockHealthRegen:true});
}
function disableVanillaNaturalRegen(){
  try{world.getDimension("overworld").runCommandAsync("gamerule naturalregeneration false");}catch{}
}

// Qualquer dano recebido reinicia o minuto. Se houver um jogador como agressor,
// ele também entra no período de combate, inclusive em dano de jutsu/projétil
// quando a API preserva damagingEntity.
try{
  world.afterEvents.entityHurt.subscribe(ev=>{
    const hurt=ev.hurtEntity;
    if(validPlayer(hurt)) lockRegen(hurt);
    const attacker=ev.damageSource?.damagingEntity;
    if(validPlayer(attacker) && attacker.id !== hurt?.id) lockRegen(attacker);
  });
}catch{}

// Fallback para golpes físicos que algumas builds/API reportam sem damagingEntity
// no entityHurt virtualizado.
try{
  world.afterEvents.entityHitEntity.subscribe(ev=>{
    const attacker=ev.damagingEntity;
    if(validPlayer(attacker)) lockRegen(attacker);
    const target=ev.hitEntity;
    if(validPlayer(target)) lockRegen(target);
  });
}catch{}

try{
  world.afterEvents.playerSpawn.subscribe(({player})=>{
    // Entrar/renascer nunca dá regeneração instantânea: começa o contador de 60s.
    regenReadyAt.set(player.id, system.currentTick + REGEN_DELAY_TICKS);
  });
}catch{}
try{world.afterEvents.playerLeave.subscribe(ev=>regenReadyAt.delete(ev.playerId));}catch{}
try{world.afterEvents.playerLeave.subscribe(ev=>combatUntil.delete(ev.playerId));}catch{}

disableVanillaNaturalRegen();
// Plugins/comandos podem reativar gamerule; reafirma em intervalo bem longo e barato.
system.runInterval(disableVanillaNaturalRegen, 20 * 60 * 5);

system.runInterval(()=>{
  const now=system.currentTick;
  for(const p of world.getAllPlayers()){
    try{
      if(isFinalDeath(p) || p.hasTag?.("nzs_admin_boss_player") || p.hasTag?.("nzs_downed") || p.hasTag?.("desmaio:caido")) continue;
      let ready=regenReadyAt.get(p.id);
      if(ready===undefined){ ready=now+REGEN_DELAY_TICKS; regenReadyAt.set(p.id,ready); }
      if(now < ready) continue;

      const health=p.getComponent("minecraft:health")||p.getComponent("health");
      if(!health || typeof health.setCurrentValue!=="function") continue;
      const max=Math.max(1,Number(health.effectiveMax??health.defaultValue??20));
      const cur=Math.max(0,Number(health.currentValue)||0);
      if(cur<=0 || cur>=max-.001) continue;

      // A Vida acima do teto nativo é virtualizada por proporção. Curar 10% do
      // max nativo equivale exatamente a 10% da Vida efetiva mostrada no HUD.
      const heal=Math.max(1,max*REGEN_FRACTION*fatigueFactors(p).regen*Math.max(.4,Number(prop(p,"nzw_regen_wound_factor",1))));
      health.setCurrentValue(Math.min(max,cur+heal));
    }catch{}
  }
},REGEN_INTERVAL_TICKS);
