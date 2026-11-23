import { watchInterval } from "./swbr_perf_181152.js";
import { cachedPlayers } from "./swbr_player_cache_181152.js";
import {adaptiveMultiplier,confirmAdaptiveHit,ADAPT_RESOLVED} from './swbr23_adaptive.js';
import {routeSusanooDamage} from './susanoo_pilot_registry.js';
import {characterRevision} from './rp_v18358_character_state.js';
import {markCombatActivity} from './rp_v17091_health_regen.js';
import {tryOcularDodge} from './rp_v18731_dojutsu.js';
import { emitParticle } from "./rp_v18347_visual_budget.js";
import { traceDamage } from './rp_v18727_damage_trace.js';
import {registerNativeDamageHandler,registerNativeScaleHandler,requestDowned,NATIVE_REPLAY_TAG,CONVERTED_DAMAGE_TAG,isProtectedDownedLife,bodyEpoch} from './rp_v18719_downed_bridge.js';
import { fatigueFactors } from "./rp_v1840_policy.js";
import { world, system, EquipmentSlot, ItemStack } from "@minecraft/server";
import { getEffectiveAttribute } from "./rp_v130_mode_multipliers.js";
import { trySubstituteDamage } from "./rp_v17052_substitution.js";
import { liveDamageGuard } from "./rp_v1871_damage_guards.js";
import { queueEffectiveDamageIndicator, discardLastEffectiveDamageIndicator } from "./config/damage_indicator_bridge.js";
import { applyMarkedDamage, isTrucoFurniture, isScriptedDamageActive, hasSafeHealthSensor } from "./rp_v18010_damage_origin.js";
import { COMBAT_CONFIG } from "./rp_v18314_combat_config.js";
import { resistanceEventFromDefense } from "./rp_v96_combat_math.js";

// v18.1.2 — buffer nativo fixo para evitar custo de renderização/sincronização
// proporcional ao HP no cliente Bedrock. A Vida efetiva do RP continua integral
// (30k, 50k, 100k, 200k+); somente minecraft:health fica limitado a 20.000 e
// o dano acima desse ponto é convertido proporcionalmente pelo runtime virtual.
// Assim 100.000 HP continuam significando 100.000 HP, não 100.000 operações de HUD.
export const SAFE_NATIVE_HEALTH_CAP = 20000;

const fractionalDamage = new Map();
const virtualDamageContext = new Map();

// O Boss possui seu próprio contador de HP. Ele lê a unidade efetiva do
// mesmo golpe, sem subtrair o número comprimido nem aplicar Defesa novamente.
export function effectiveDamageFromVirtualEvent(event) {
  const entry = virtualDamageContext.get(event?.hurtEntity?.id);
  if (!entry) return undefined;
  const ratio = Math.max(0, Math.min(1, (Number(event.damage) || 0) / entry.native));
  return entry.effective * ratio;
}
const bypassNextDamage = new Set();
const lastNativeHealth = new Map();
const izanagiPending = new Set();
const izanagiOffhandBackup = new Map();
const izanagiDeathRecovery = new Map();
let beforeDamageInterceptionActive = false;
const IZANAGI_ARMED_TAG = "nzs_izanagi_armed";
const IZANAGI_UNTIL_PROP = "nzs_izanagi_until_tick";
const IZANAGI_SUSANOO_SEAL_TAG = "nzs_izanagi_susano_perfeito_selado";
const IZANAGI_USED_TAG = "nzs_izanagi_used_v18359";
export const FINALIZATION_DEATH_TAG = "nzs_finalization_death_v1834";
const IZANAGI_TOTEM_NAME = "§5Izanagi §8— §fReescrita da Morte";
const PERFECT_SUSANOO_KEYS = ["itachi","sasuke","sarada","madara","shisui","kakashi"];
const PERFECT_SUSANOO_IDS = PERFECT_SUSANOO_KEYS.map(key => `nz:susanoo_${key}5`);
const PERFECT_SUSANOO_ID_SET = new Set(PERFECT_SUSANOO_IDS);
const PERFECT_SUSANOO_COMBO_SUFFIXES = PERFECT_SUSANOO_KEYS.map(key => `_${key}`);

function canCorrectDamage(player, epoch) {
  return validEntity(player) && !player.hasTag(FINALIZATION_DEATH_TAG) && !player.hasTag('desmaio:caido') &&
    (epoch === undefined || bodyEpoch(player) === epoch);
}

// Uma escrita direta de HP não gera entityHurt. Este é o ponto único para
// derrotas desse tipo (ex.: DOT percentual), antes de escrever zero no motor.
export function defeatPlayer(player) {
  try {
    if (player?.typeId !== 'minecraft:player' || player.hasTag(FINALIZATION_DEATH_TAG)) return false;
    if (isIzanagiArmed(player)) { consumeIzanagi(player, 'fatal_health_write'); return true; }
    return requestDowned(player);
  } catch { return false; }
}

registerNativeScaleHandler(player=>isVirtualHealthActive(player));
// The native addon reserves the before-hurt event. Decide using
// fractional BP health BEFORE any lethal write, not an after-hurt resurrection.
registerNativeDamageHandler((player, hit) => {
  try {
    if(!validEntity(player)||player.hasTag(FINALIZATION_DEATH_TAG))return false;
    if(player.hasTag('desmaio:caido'))return true;
    const h=player.getComponent('minecraft:health');
    if(!h||h.currentValue<=0)return false;
    if(hit.force)return defeatPlayer(player);
    const adapt=hit.native||hit.scripted?1:adaptiveMultiplier(player);
    if(adapt<1)hit={...hit,amount:hit.amount*adapt};
    const direct=['entityattack','projectile','magic','entityexplosion'].includes(String(hit.cause||'').replace(/_/g,'').toLowerCase());
    if(direct&&liveDamageGuard('phase',player)||liveDamageGuard('substitution',player)||liveDamageGuard('safe_zone',player))return true;
    // Script hits already resolved their ocular roll, even below the HP cap.
    if(!hit.scripted&&!hit.native&&tryOcularDodge(player,{cause:hit.cause,damagingEntity:hit.attacker}))return true;
    const max=Math.max(1,Number(h.effectiveMax??h.defaultValue??20));
    const effectiveMax=Math.max(1,getEffectiveAttribute(player,'vida'));
    let native=hit.native||shouldBypassVirtualization(hit.cause)?hit.amount:hit.amount*Math.min(1,max/effectiveMax);
    let effective=hit.native?native*effectiveMax/max:hit.amount;
    const boss=player.hasTag('nzs_admin_boss_player');
    if(boss){effective=Math.min(250000,effective);native=Math.min(effective*max/effectiveMax,Number(h.currentValue)*.5);}
    if(!Number.isFinite(native)||native<=0)return false;
    if(!boss&&native>=Number(h.currentValue)){
      const accepted=defeatPlayer(player);
      if(accepted&&player.hasTag('desmaio:caido')){
        try{markCombatActivity(player);}catch{}
        const attacker=hit.attacker;
        if(attacker?.typeId==='minecraft:player'&&attacker.id!==player.id){
          try{markCombatActivity(attacker);player.setDynamicProperty('nzs_last_pvp_killer',attacker.name);
            player.setDynamicProperty('nzs_last_pvp_tick',system.currentTick);
            player.setDynamicProperty('nzs_last_pvp_killer_revision_v18358',characterRevision(attacker));
            player.setDynamicProperty('nzs_last_pvp_victim_revision_v18358',characterRevision(player));}catch{}
        }
      }
      return accepted;
    }
    confirmAdaptiveHit(player,effective);
    // A rounded Endstone HP value may have selected a nonfatal candidate.
    // Apply only the resolved native amount once; no second armor/defense pass.
    queueEffectiveDamageIndicator(hit.attacker,player,effective,native);
    bypassNextDamage.add(player.id);
    const prior=virtualDamageContext.get(player.id);
    virtualDamageContext.set(player.id,{native,effective});
    player.addTag(NATIVE_REPLAY_TAG);
    let applied;
    try{applied=applyMarkedDamage(player,native,{cause:'override',...(hit.attacker?{damagingEntity:hit.attacker}:{})},true);}
    finally{player.removeTag(NATIVE_REPLAY_TAG);bypassNextDamage.delete(player.id);
      if(prior)virtualDamageContext.set(player.id,prior);else virtualDamageContext.delete(player.id);}
    return applied!==false;
  }catch(error){console.warn('[SWBR Desmaio] Golpe reservado não aplicado: '+String(error));return false;}
});

export function safeNativeHealthMax(effectiveHealth) {
  const effective = Math.max(1, Math.round(Number(effectiveHealth) || 1));
  // player.json parte de 20 pontos nativos: health.0 => grupo health.20.
  return Math.min(SAFE_NATIVE_HEALTH_CAP, Math.max(20, effective));
}

// Converte o máximo nativo desejado para o nome real do evento em player.json.
// Ex.: para obter 100 de vida nativa é necessário disparar health.80.
export function nativeHealthEventValue(nativeMax) {
  const desired = Math.max(20, Math.min(SAFE_NATIVE_HEALTH_CAP, Math.round(Number(nativeMax) || 20)));
  return Math.max(0, desired - 20);
}

export function isVirtualHealthActive(player) {
  try {
    if (player?.hasTag?.("nzs_admin_boss_player")) return true;
    const effective = Math.max(1, getEffectiveAttribute(player, "vida"));
    const health = player.getComponent("minecraft:health") || player.getComponent("health");
    const nativeMax = Math.max(1, Number(health?.effectiveMax ?? health?.defaultValue ?? 20));
    return effective > nativeMax + 0.5;
  } catch {
    return false;
  }
}

export function effectiveHealthSnapshot(player) {
  try {
    const health = player.getComponent("minecraft:health") || player.getComponent("health");
    const nativeMax = Math.max(1, Number(health?.effectiveMax ?? health?.defaultValue ?? 20));
    const nativeCurrent = Math.max(0, Number(health?.currentValue) || 0);
    const effectiveMax = Math.max(1, getEffectiveAttribute(player, "vida"));
    let effectiveCurrent = Math.max(0, Math.min(effectiveMax, (nativeCurrent / nativeMax) * effectiveMax));
    if (player.hasTag?.("nzs_admin_boss_player")) {
      const stored = player.getDynamicProperty("nzs_boss_current_hp_v150");
      if (stored !== undefined && Number.isFinite(Number(stored))) effectiveCurrent = Math.max(0, Math.min(effectiveMax, Number(stored)));
    }
    return { nativeCurrent, nativeMax, effectiveCurrent, effectiveMax };
  } catch {
    return { nativeCurrent: 0, nativeMax: 20, effectiveCurrent: 0, effectiveMax: 20 };
  }
}

function shouldBypassVirtualization(cause) {
  const value = String(cause || "").toLowerCase();
  return value === "void" || value === "suicide" || value === "selfdestruct" || value === "self_destruct";
}

function nativeDamageFor(player, rawDamage, damageSource) {
  const health = player.getComponent("minecraft:health") || player.getComponent("health");
  const nativeMax = Math.max(1, Number(health?.effectiveMax ?? health?.defaultValue ?? 20));
  const effectiveMax = Math.max(1, getEffectiveAttribute(player, "vida"));
  const raw=Math.max(0,Number(rawDamage)||0);
  // Força e Defesa já foram resolvidas nativamente por minecraft:attack e
  // minecraft:damage_sensor. Esta função só converte escala para Bosses/vidas
  // acima da tabela; aplicar os atributos de novo duplicaria o multiplicador.
  const effectiveDamage=raw;
  const nativeDamage=effectiveDamage*(nativeMax/effectiveMax);
  return {nativeMax,effectiveMax,effectiveDamage,nativeDamage};
}

// v17.0.102 — via direta para dano de jutsu em jogadores com Vida virtual.
// Em Script API 1.x não há world.beforeEvents.entityHurt; por isso converter
// ANTES de applyDamage evita que um dano bruto mate o buffer nativo antes do
// fallback conseguir devolver a diferença. Para mobs/jogadores não virtuais,
// preserva-se o caminho normal já existente.
export function applyVirtualSafeDamage(target, rawDamage, damageSource = {}, options = {}) {
  try{if(damageSource?.damagingEntity?.hasTag('swbr_infinite_bound23'))return 0;}catch{}
  target=routeSusanooDamage(target,damageSource);
  if(!target)return 0;
  traceDamage(target, 'pedido', { raw:rawDamage, cause:damageSource?.cause });
  if (isTrucoFurniture(target)) return 0;
  let raw = Math.max(0, Number(rawDamage) || 0);
  if(!options.fatigueApplied && damageSource?.damagingEntity?.typeId === "minecraft:player") raw *= fatigueFactors(damageSource.damagingEntity).damage;
  if (!target || raw <= 0) return 0;
  try { if (target.typeId === "minecraft:player" && (target.hasTag("desmaio:caido") || trySubstituteDamage(target,damageSource))) return 0; } catch {}
  // Mirrors the native short Kamui guard for direct virtual jutsu damage.
  try{if(liveDamageGuard("phase",target)&&["entityattack","entity_attack","projectile","magic","entityexplosion","entity_explosion"].includes(String(damageSource?.cause||"").toLowerCase()))return 0;}catch{}
  try { if (target.typeId === "minecraft:player" && liveDamageGuard("safe_zone",target)) return 0; } catch {}
  try { const attacker=damageSource?.damagingEntity; if(attacker?.typeId === "minecraft:player" && liveDamageGuard("safe_zone",attacker)) return 0; } catch {}
  if(tryOcularDodge(target,damageSource))return 0;
  // v18.3.15 — fusível único de PvP. Não tenta "balancear" golpes comuns:
  // só corta valores acima da escala real observada do servidor (500k/golpe).
  try {
    const attacker=damageSource?.damagingEntity;
    if(target.typeId==="minecraft:player"&&attacker?.typeId==="minecraft:player"&&attacker.id!==target.id){
      raw=Math.min(raw,COMBAT_CONFIG.MAX_PVP_DAMAGE);
    }
  } catch {}
  const adapt=adaptiveMultiplier(target);
  const scriptAdapt=target.typeId==='minecraft:player'&&(isVirtualHealthActive(target)||String(damageSource?.cause).toLowerCase()==='override'||!hasSafeHealthSensor(target));
  if(scriptAdapt)raw*=adapt;
  let ownsAdaptMarker=false;
  try {
    if(scriptAdapt&&!target.hasTag(ADAPT_RESOLVED)){target.addTag(ADAPT_RESOLVED);ownsAdaptMarker=true;}
    if (target.typeId !== "minecraft:player" || !isVirtualHealthActive(target)) {
      if(target.typeId==='minecraft:player'&&String(damageSource?.cause).toLowerCase()==='override'){
        const h=target.getComponent('minecraft:health');
        if(h?.currentValue>0&&raw>=h.currentValue&&defeatPlayer(target))return raw;
      }
      const applied = applyMarkedDamage(target, raw, damageSource);
      if(applied!==false)confirmAdaptiveHit(target,raw);
      return applied === false ? 0 : raw;
    }
    // Resolva Defesa na unidade RPG, ANTES de comprimir a vida. O sensor do
    // Bedrock tem piso de 1 HP: em 134 milhões de HP, 1 nativo equivale a 6.700
    // efetivos. Aplicar o sensor depois da conversão inflava os golpes pequenos.
    // A marca virtual exclui só o sensor comum; armadura e efeitos continuam no motor.
    const override = String(damageSource?.cause || "").toLowerCase() === "override";
    const safeSensor = hasSafeHealthSensor(target);
    const reduction = override || !safeSensor ? 0 : resistanceEventFromDefense(getEffectiveAttribute(target, "defesa"));
    const converted = nativeDamageFor(target, raw * (1 - reduction / 1000), damageSource);
    if (target.hasTag?.("nzs_admin_boss_player")) {
      converted.effectiveDamage = Math.min(250000, converted.effectiveDamage);
      converted.nativeDamage = converted.effectiveDamage * converted.nativeMax / converted.effectiveMax;
    }
    const amount = Math.max(0, Number(converted.nativeDamage) || 0);
    traceDamage(target, 'conversao', { raw, amount, effectiveDamage:converted.effectiveDamage,
      effectiveMax:converted.effectiveMax, nativeMax:converted.nativeMax, reduction });
    // Nenhum piso arbitrário: .01 nativo pode significar milhares de HP efetivos.
    if (amount <= 0) return 0;
    // Override damage bypasses the native sensor. Resolve the official defeat
    // in this synchronous path, including when the optional native BP is absent.
    if(override){const h=target.getComponent('minecraft:health');if(h?.currentValue>0&&amount>=h.currentValue&&defeatPlayer(target))return converted.effectiveDamage;}
    try { queueEffectiveDamageIndicator(damageSource?.damagingEntity,target,converted.effectiveDamage,amount); } catch {}
    bypassNextDamage.add(target.id);
    const priorContext = virtualDamageContext.get(target.id);
    virtualDamageContext.set(target.id, { native: amount, effective: converted.effectiveDamage });
    let applied,markedContext=false;
    try {
      // The sensor marker is also a native defense switch, so keep it gated.
      // A separate synchronous metadata tag identifies converted hits even
      // when another pack supplies the active player definition.
      if(!safeSensor&&!target.hasTag(CONVERTED_DAMAGE_TAG)){target.addTag(CONVERTED_DAMAGE_TAG);markedContext=true;}
      applied = applyMarkedDamage(target, amount, damageSource, safeSensor);
    } finally {
      if(markedContext)try{target.removeTag(CONVERTED_DAMAGE_TAG)}catch{}
      if (priorContext) virtualDamageContext.set(target.id, priorContext);
      else virtualDamageContext.delete(target.id);
      // Se o evento recursivo não limpar o bypass, remova no tick seguinte.
      system.runTimeout(() => bypassNextDamage.delete(target.id), 1);
    }
    if (applied === false) {
      bypassNextDamage.delete(target.id);
      try { discardLastEffectiveDamageIndicator(damageSource?.damagingEntity,target); } catch {}
      return 0;
    }
    confirmAdaptiveHit(target,converted.effectiveDamage);
    return Math.max(0, Number(converted.effectiveDamage) || raw);
  } catch (error) {
    // Nunca reaplica o dano bruto em um player virtual/Boss: isso poderia
    // atravessar o buffer dedicado antes da conversão segura.
    try { console.warn(`[NZ Vida Virtual] dano seguro abortado: ${error}`); } catch {}
    return 0;
  } finally {if(ownsAdaptMarker)try{target.removeTag(ADAPT_RESOLVED);}catch{}}
}

function validEntity(entity) {
  try {
    return !!entity && (typeof entity.isValid === "function" ? entity.isValid() : entity.isValid !== false);
  } catch {
    return false;
  }
}

function cloneStack(item) {
  try { return item?.clone ? item.clone() : item; } catch { return item; }
}

function getEquippable(player) {
  try {
    return player.getComponent("minecraft:equippable") || player.getComponent("equippable");
  } catch {
    return undefined;
  }
}

function getOffhand(player) {
  try { return getEquippable(player)?.getEquipment(EquipmentSlot.Offhand); } catch { return undefined; }
}

function isIzanagiTotem(item) {
  try { return item?.typeId === "minecraft:totem_of_undying" && item?.nameTag === IZANAGI_TOTEM_NAME; }
  catch { return false; }
}

function isIzanagiArmed(player) {
  try {
    const until = Number(player.getDynamicProperty(IZANAGI_UNTIL_PROP)) || 0;
    return player.hasTag(IZANAGI_ARMED_TAG) && until >= system.currentTick;
  } catch {
    return false;
  }
}

function returnBackupItem(player, item) {
  if (!item) return;
  try {
    const inventory = player.getComponent("minecraft:inventory") || player.getComponent("inventory");
    const container = inventory?.container;
    if (container?.addItem) {
      const remainder = container.addItem(cloneStack(item));
      if (!remainder) return;
      player.dimension.spawnItem(remainder, player.location);
      return;
    }
  } catch {}
  try { player.dimension.spawnItem(cloneStack(item), player.location); } catch {}
}

function restoreIzanagiOffhand(player, forcedBackup) {
  const hasForcedBackup = arguments.length >= 2;
  const backup = hasForcedBackup ? forcedBackup : izanagiOffhandBackup.get(player.id);
  izanagiOffhandBackup.delete(player.id);
  const eq = getEquippable(player);
  if (!eq) {
    returnBackupItem(player, backup);
    return;
  }
  try {
    const current = eq.getEquipment(EquipmentSlot.Offhand);
    if (!current || isIzanagiTotem(current)) {
      eq.setEquipment(EquipmentSlot.Offhand, backup ? cloneStack(backup) : undefined);
    } else {
      returnBackupItem(player, backup);
    }
  } catch {
    returnBackupItem(player, backup);
  }
}

function equipIzanagiTotem(player) {
  const eq = getEquippable(player);
  if (!eq) return false;
  try {
    const current = eq.getEquipment(EquipmentSlot.Offhand);
    izanagiOffhandBackup.set(player.id, current ? cloneStack(current) : undefined);
    const totem = new ItemStack("minecraft:totem_of_undying", 1);
    totem.nameTag = IZANAGI_TOTEM_NAME;
    try { totem.setLore(["§7Proteção temporária do Izanagi.", "§8Desaparece ao reescrever uma morte."]); } catch {}
    eq.setEquipment(EquipmentSlot.Offhand, totem);
    return true;
  } catch {
    izanagiOffhandBackup.delete(player.id);
    return false;
  }
}

function isPerfectSusanooItemId(typeId) {
  return PERFECT_SUSANOO_ID_SET.has(String(typeId || ""));
}

function isPerfectSusanooCombinationId(typeId) {
  const id = String(typeId || "");
  if (!id.startsWith("nz:modo_")) return false;
  return PERFECT_SUSANOO_COMBO_SUFFIXES.some(suffix => id.endsWith(suffix));
}

function removePerfectSusanooFromInventory(player) {
  try {
    const inventory = player.getComponent("minecraft:inventory") || player.getComponent("inventory");
    const container = inventory?.container;
    if (!container) return;
    for (let slot = 0; slot < container.size; slot++) {
      const item = container.getItem(slot);
      if (item && (isPerfectSusanooItemId(item.typeId) || isPerfectSusanooCombinationId(item.typeId))) {
        container.setItem(slot, undefined);
      }
    }
  } catch {}
}

function removeEquippedPerfectSusanoo(player) {
  const eq = getEquippable(player);
  if (!eq) return;
  try {
    const chest = eq.getEquipment(EquipmentSlot.Chest);
    if (chest && isPerfectSusanooItemId(chest.typeId)) {
      eq.setEquipment(EquipmentSlot.Chest, undefined);
    }
  } catch {}
  try {
    // As junções Bijuu + Susano'o aplicam internamente a Fase 5 pelo item da cabeça.
    const head = eq.getEquipment(EquipmentSlot.Head);
    if (head && isPerfectSusanooCombinationId(head.typeId)) {
      eq.setEquipment(EquipmentSlot.Head, undefined);
    }
  } catch {}
}

export function hasPerfectSusanooSeal(player) {
  try {
    if (!player.hasTag(IZANAGI_SUSANOO_SEAL_TAG)) return false;
    if (player.hasTag(IZANAGI_USED_TAG) || isIzanagiArmed(player) || izanagiPending.has(player.id) || izanagiDeathRecovery.has(player.name)) return true;
    // Saves antigos não registravam a ativação. Conserva a penalidade quando
    // existe aprendizado da técnica; finalizações de quem nunca a teve não selam.
    const legacyTags = ["learned_virtual_izanagi_raijin", "nz:jutsu_izanagi_raijin", "jutsu_izanagi_raijin", "learned_nz_jutsu_izanagi_raijin"];
    if (legacyTags.some(tag => player.hasTag(tag))) return true;
    const raw = player.getDynamicProperty("nzs_learned_final_jutsus_v81");
    if (typeof raw === "string" && raw) {
      let learned;
      try { learned = JSON.parse(raw); } catch { return true; }
      if (!Array.isArray(learned)) return true;
      if (learned.includes("izanagi_raijin")) return true;
    }
    player.removeTag(IZANAGI_SUSANOO_SEAL_TAG);
    return false;
  } catch { return true; }
}

export function enforcePerfectSusanooSeal(player) {
  try {
    if (!hasPerfectSusanooSeal(player)) return false;
  } catch { return false; }

  removeEquippedPerfectSusanoo(player);
  removePerfectSusanooFromInventory(player);

  for (const key of PERFECT_SUSANOO_KEYS) {
    try { player.removeTag(`modo_susanoo_${key}5_ativo`); } catch {}
    try { player.removeTag(`susanoo_${key}5_ativo`); } catch {}
  }
  return true;
}

export function sealPerfectSusanoo(player, notify = true) {
  try { player.addTag(IZANAGI_SUSANOO_SEAL_TAG); } catch {}
  enforcePerfectSusanooSeal(player);

  // Mantém também a limpeza por comando para slots/inventários de versões antigas.
  for (const key of PERFECT_SUSANOO_KEYS) {
    try { player.runCommandAsync(`clear @s nz:susanoo_${key}5 0 999`); } catch {}
  }

  if (notify) {
    try { player.sendMessage("§cSeu Susano'o Perfeito (Completo) foi perdido e selado pelo uso do Izanagi."); } catch {}
  }
}

function izanagiVisual(player) {
  let base;
  try { base = { x: player.location.x, y: player.location.y + 1, z: player.location.z }; }
  catch { return; }

  for (let step = 0; step < 12; step++) system.runTimeout(() => {
    if (!validEntity(player)) return;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI * 2 / 8 + step * .35;
      const r = .6 + step * .08;
      const q = {
        x: base.x + Math.cos(a) * r,
        y: base.y + (i % 3) * .35,
        z: base.z + Math.sin(a) * r
      };
      try { emitParticle(player.dimension, i % 2 ? "minecraft:totem_particle" : "nz:raio", q); } catch {}
    }
  }, step * 2);
  try { player.playSound("random.totem", { volume: 1.5, pitch: .8 }); } catch {}
}

export function consumeIzanagi(player, source = "fatal") {
  if (!validEntity(player)) return false;
  if (player.hasTag(FINALIZATION_DEATH_TAG) || (!isIzanagiArmed(player) && !izanagiPending.has(player.id))) return false;
  try { player.addTag(IZANAGI_USED_TAG); } catch {}

  try { player.removeTag(IZANAGI_ARMED_TAG); } catch {}
  try { player.setDynamicProperty(IZANAGI_UNTIL_PROP, 0); } catch {}
  izanagiPending.delete(player.id);

  sealPerfectSusanoo(player, false);
  restoreIzanagiOffhand(player);

  try {
    const health = player.getComponent("minecraft:health") || player.getComponent("health");
    const max = Math.max(1, Number(health?.effectiveMax ?? health?.defaultValue ?? 20));
    health?.setCurrentValue?.(max);
  } catch {}
  try { player.addEffect("instant_health", 2, { amplifier: 10, showParticles: false }); } catch {}
  try { player.addEffect("regeneration", 160, { amplifier: 2, showParticles: false }); } catch {}
  try { player.addEffect("resistance", 100, { amplifier: 4, showParticles: false }); } catch {}
  try { player.addEffect("fire_resistance", 100, { amplifier: 0, showParticles: false }); } catch {}

  izanagiVisual(player);
  try { player.sendMessage("§dIzanagi reescreveu sua morte e foi consumido."); } catch {}
  return true;
}

function disarmUnusedIzanagi(player, until) {
  if (!validEntity(player)) return;
  let current = 0, armed = false;
  try {
    current = Number(player.getDynamicProperty(IZANAGI_UNTIL_PROP)) || 0;
    armed = player.hasTag(IZANAGI_ARMED_TAG);
  } catch {}
  if (!armed || current !== until) return;

  try { player.removeTag(IZANAGI_ARMED_TAG); } catch {}
  try { player.setDynamicProperty(IZANAGI_UNTIL_PROP, 0); } catch {}
  restoreIzanagiOffhand(player);
  try { player.sendMessage("§7O Izanagi se dissipou sem ser consumido."); } catch {}
}

// Finalizações confirmadas e a morte automática do sistema de desmaio são
// mortes reais. Elas não podem ser reescritas pelo fallback de Izanagi, que
// normalmente restaura o jogador exatamente na posição em que ele morreu.
// A função também devolve com segurança o item que estava na mão secundária
// antes do totem temporário do Izanagi ser equipado.
export function prepareUnrewritableDeath(player) {
  if (!validEntity(player)) return false;
  const activeIzanagi = isIzanagiArmed(player) || izanagiPending.has(player.id) || izanagiOffhandBackup.has(player.id);
  try {
    player.addTag(FINALIZATION_DEATH_TAG);
    if (!player.hasTag(FINALIZATION_DEATH_TAG)) return false;
  } catch { return false; }
  fractionalDamage.delete(player.id);
  bypassNextDamage.delete(player.id);
  lastNativeHealth.delete(player.id);
  try { izanagiDeathRecovery.delete(player.name); } catch {}
  try { player.removeTag(IZANAGI_ARMED_TAG); } catch {}
  try { player.setDynamicProperty(IZANAGI_UNTIL_PROP, 0); } catch {}
  try { izanagiPending.delete(player.id); } catch {}
  try { restoreIzanagiOffhand(player); } catch {}
  if (activeIzanagi) try { player.addTag(IZANAGI_USED_TAG); sealPerfectSusanoo(player, false); } catch {}
  return true;
}

export function armIzanagiProtection(player, ticks = 2400) {
  if (!validEntity(player)) return false;

  if (isIzanagiArmed(player)) {
    try { player.removeTag(IZANAGI_ARMED_TAG); } catch {}
    restoreIzanagiOffhand(player);
  }

  const until = system.currentTick + Math.max(20, Math.floor(ticks));
  try {
    player.addTag(IZANAGI_ARMED_TAG);
    player.setDynamicProperty(IZANAGI_UNTIL_PROP, until);
  } catch {
    return false;
  }

  if (!equipIzanagiTotem(player)) {
    try { player.removeTag(IZANAGI_ARMED_TAG); } catch {}
    try { player.setDynamicProperty(IZANAGI_UNTIL_PROP, 0); } catch {}
    try { player.sendMessage("§cO Izanagi não pôde criar a proteção. Libere a mão secundária e tente novamente."); } catch {}
    return false;
  }

  try { player.addTag(IZANAGI_USED_TAG); } catch {}
  sealPerfectSusanoo(player, true);
  try { player.sendMessage(`§eIzanagi ativado: a próxima morte será reescrita por ${Math.ceil(ticks / 20)} segundos.`); } catch {}
  system.runTimeout(() => disarmUnusedIzanagi(player, until), ticks + 1);
  return true;
}

function tryConsumeFatalIzanagi(event, player) {
  if (!isIzanagiArmed(player)) return false;

  let current = 0, incoming = Math.max(0, Number(event.damage) || 0);
  try {
    const health = player.getComponent("minecraft:health") || player.getComponent("health");
    current = Math.max(0, Number(health?.currentValue) || 0);
    // A chamada direta já está na unidade nativa. Não converta duas vezes
    // ao decidir se o Izanagi deve proteger um golpe realmente fatal.
    if (!bypassNextDamage.has(player.id)) {
      const converted = nativeDamageFor(player, event.damage, event.damageSource);
      if (converted.effectiveMax > converted.nativeMax + .5) incoming = converted.nativeDamage;
    }
  } catch {}

  if (incoming + .001 < current) return false;
  event.cancel = true;
  if (izanagiPending.has(player.id)) return true;

  izanagiPending.add(player.id);
  try { player.removeTag(IZANAGI_ARMED_TAG); } catch {}
  try { player.setDynamicProperty(IZANAGI_UNTIL_PROP, 0); } catch {}
  system.run(() => consumeIzanagi(player, "before_hurt"));
  return true;
}

function snapshotDeathRecovery(player) {
  let location, dimensionId = "overworld", rotation, backup;
  try {
    location = { x: player.location.x, y: player.location.y, z: player.location.z };
    dimensionId = player.dimension.id;
    rotation = player.getRotation?.();
  } catch {}
  backup = izanagiOffhandBackup.get(player.id);
  izanagiDeathRecovery.set(player.name, {
    location,
    dimensionId,
    rotation,
    backup: backup ? cloneStack(backup) : undefined,
    created: system.currentTick
  });
}

function markForcedDeathForRecovery(player) {
  if(isProtectedDownedLife(player))return false;
  // O sistema de desmaio marcou uma morte definitiva. Nunca crie um snapshot
  // de retorno no local do cadáver para esse caso.
  try {
    if (player.hasTag(FINALIZATION_DEATH_TAG)) {
      izanagiDeathRecovery.delete(player.name);
      return false;
    }
  } catch {}
  if (!isIzanagiArmed(player)) return false;
  snapshotDeathRecovery(player);
  try { player.removeTag(IZANAGI_ARMED_TAG); } catch {}
  try { player.setDynamicProperty(IZANAGI_UNTIL_PROP, 0); } catch {}
  izanagiOffhandBackup.delete(player.id);
  sealPerfectSusanoo(player, false);
  return true;
}

function reapplyScaledDamage(player, amount, source, effectiveAmount, epoch) {
  const id = player.id;
  if (amount <= 0 || !canCorrectDamage(player, epoch)) return;
  try { queueEffectiveDamageIndicator(source?.damagingEntity,player,effectiveAmount); } catch {}
  bypassNextDamage.add(id);
  try {
    const options = { cause: "override" };
    if (source?.damagingEntity) options.damagingEntity = source.damagingEntity;
    player.applyDamage(amount, options);
  } catch {
    try {
      player.runCommandAsync(`damage @s ${Math.max(1, Math.floor(amount))} override`);
    } catch {}
  } finally {
    // Caso a API não dispare o evento recursivo esperado, não deixa bypass pendurado.
    system.runTimeout(() => bypassNextDamage.delete(id), 1);
  }
}

// Interceptação antes do dano evita morte instantânea quando a Vida efetiva é
// maior que o teto nativo. O evento é cancelado e reaplicado em escala segura.
try {
  const signal = world.beforeEvents?.entityHurt;
  if (signal?.subscribe) {
    signal.subscribe((event) => {
      const player = event.hurtEntity;
      if (player?.typeId !== 'minecraft:player' || !canCorrectDamage(player)) return;
      // v17.0.52: a Substituição cancela o dano antes da virtualização.
      if (liveDamageGuard("substitution",player)) return;
      // A vida de personagem Boss é controlada pelo runtime v150 para suportar
      // até 10 milhões sem corações nativos e sem dupla conversão de dano.
      if (player.hasTag?.("nzs_admin_boss_player")) return;

      // O contato físico de jogador será bloqueado no sensor e encaminhado
      // por safe_melee. Não agende outra reaplicação em motores com before-event.
      if (hasSafeHealthSensor(player) && event.damageSource?.damagingEntity?.typeId === "minecraft:player"
          && String(event.damageSource?.cause || "").replace(/_/g, "").toLowerCase() === "entityattack"
          && !isScriptedDamageActive(player, event.damageSource)) return;

      if (tryConsumeFatalIzanagi(event, player)) return;

      if (bypassNextDamage.has(player.id)) {
        bypassNextDamage.delete(player.id);
        return;
      }

      const cause = event.damageSource?.cause;
      if (shouldBypassVirtualization(cause)) return;
      if(!isScriptedDamageActive(player,event.damageSource)&&tryOcularDodge(player,event.damageSource)){event.cancel=true;return;}

      let converted;
      try { converted = nativeDamageFor(player, event.damage, event.damageSource); } catch { return; }
      if (converted.effectiveMax <= converted.nativeMax + 0.5) return;

      event.cancel = true;
      const previousRemainder = fractionalDamage.get(player.id) || 0;
      const accumulated = Math.max(0, converted.nativeDamage) + previousRemainder;
      const wholeDamage = Math.floor(accumulated);
      fractionalDamage.set(player.id, accumulated - wholeDamage);

      if (wholeDamage > 0) {
        const source = event.damageSource;
        const epoch = bodyEpoch(player);
        system.run(() => reapplyScaledDamage(player, wholeDamage, source, converted.effectiveDamage, epoch));
      }
    });
    beforeDamageInterceptionActive = true;
  }
} catch {}

// Fallback para versões da API 1.x sem entityHurt em beforeEvents.
// O totem real equipado pelo Izanagi impede o dano fatal comum; este evento
// detecta o consumo e também preserva a virtualização de Vida.
if (!beforeDamageInterceptionActive) {
  try {
    world.afterEvents.entityHurt.subscribe((event) => {
      const player = event.hurtEntity;
      if (player?.typeId !== 'minecraft:player' || !canCorrectDamage(player)) return;
      if (liveDamageGuard("substitution",player)) return;
      if (player.hasTag?.("nzs_admin_boss_player")) {confirmAdaptiveHit(player,event.damage);return;}
      // Dano já convertido por applyVirtualSafeDamage: não virtualizar duas vezes.
      if (bypassNextDamage.has(player.id)) {
        bypassNextDamage.delete(player.id);
        return;
      }

      if (isIzanagiArmed(player)) {
        system.run(() => {
          if (!validEntity(player) || !isIzanagiArmed(player)) return;
          const offhand = getOffhand(player);
          let current = 1;
          try {
            const health = player.getComponent("minecraft:health") || player.getComponent("health");
            current = Number(health?.currentValue) || 0;
          } catch {}
          if (!isIzanagiTotem(offhand) || current <= .5) consumeIzanagi(player, "after_hurt");
        });
      }

      if (shouldBypassVirtualization(event.damageSource?.cause)) {if(String(event.damageSource?.cause).toLowerCase()==='void')confirmAdaptiveHit(player,event.damage);return;}
      // API 1.x exposes ordinary native contacts only after damage. Correct a
      // living buffer immediately; never revive a dead player or roll script hits twice.
      if(!isScriptedDamageActive(player,event.damageSource)){
        const h=player.getComponent('minecraft:health');
        if(h?.currentValue>0&&event.damage>0&&tryOcularDodge(player,event.damageSource)){
          const restored=Math.min(h.effectiveMax??h.defaultValue,h.currentValue+event.damage);
          h.setCurrentValue(restored);lastNativeHealth.set(player.id,restored);return;
        }
      }

      confirmAdaptiveHit(player,event.damage);
      let converted;
      try { converted = nativeDamageFor(player, event.damage, event.damageSource); } catch { return; }
      if (converted.effectiveMax <= converted.nativeMax + 0.5) return;

      try { queueEffectiveDamageIndicator(event.damageSource?.damagingEntity,player,converted.effectiveDamage); } catch {}
      const raw = Math.max(0, Number(event.damage) || 0);
      const healBack = Math.max(0, raw - converted.nativeDamage);
      if (healBack <= 0) return;

      // v18.0.4: corrigir ainda dentro do after-event. Adiar um tick deixava o
      // motor concluir a morte quando o dano bruto zerava o buffer nativo.
      // Para um evento fatal, usamos a última vida observada antes do golpe e
      // só restauramos se o dano efetivo convertido NÃO era realmente letal.
      const epoch = bodyEpoch(player);
      const restoreNow = () => {
        try {
          if (!canCorrectDamage(player, epoch)) return true;
          const health = player.getComponent("minecraft:health") || player.getComponent("health");
          if (!health || typeof health.setCurrentValue !== "function") return;
          const max = Math.max(1, Number(health.effectiveMax ?? health.defaultValue ?? 20));
          const current = Math.max(0, Number(health.currentValue) || 0);
          const previous = Math.max(current, Number(lastNativeHealth.get(player.id)) || 0);
          const corrected = current > .001
            ? Math.min(max, current + healBack)
            : Math.min(max, previous - converted.nativeDamage);
          if (corrected <= .001) return true; // dano efetivo legítimo: deixa morrer
          traceDamage(player, 'ajuste_virtual', { raw, native:converted.nativeDamage, before:current, corrected });
          health.setCurrentValue(Math.max(.01, corrected));
          lastNativeHealth.set(player.id, Math.max(.01, corrected));
        } catch { return false; }
        return true;
      };
      if (!restoreNow()) system.run(restoreNow);
    });
  } catch {}
}

// Snapshot de um número por jogador/tick. Serve apenas ao fallback da API 1.x
// para distinguir "buffer nativo zerou" de "vida efetiva realmente zerou".
watchInterval("vida_nativa_snapshot", () => {
  for (const player of cachedPlayers()) {
    try {
      const health = player.getComponent("minecraft:health") || player.getComponent("health");
      if (health) lastNativeHealth.set(player.id, Math.max(0, Number(health.currentValue) || 0));
    } catch {}
  }
}, 1);

system.runInterval(() => {
  for (const player of cachedPlayers()) {
    try {
      if (player.hasTag(IZANAGI_SUSANOO_SEAL_TAG)) enforcePerfectSusanooSeal(player);
    } catch {}

    if (!isIzanagiArmed(player)) continue;
    const offhand = getOffhand(player);
    if (!isIzanagiTotem(offhand)) consumeIzanagi(player, "totem_watch");
  }
}, 10);

try {
  world.beforeEvents.chatSend?.subscribe((event) => {
    const player = event.sender;
    if (!player || !isIzanagiArmed(player)) return;
    const command = String(event.message || "").trim().toLowerCase();
    const own = String(player.name || "").toLowerCase();
    const isOwnKill = command === "/kill" || command === "/kill @s" ||
      command === `/kill ${own}` || command === `/kill "${own}"`;
    if (!isOwnKill) return;
    event.cancel = true;
    system.run(() => consumeIzanagi(player, "own_kill_command"));
  });
} catch {}

try {
  world.afterEvents.entityDie.subscribe((event) => {
    const player = event.deadEntity;
    if (!player || player.typeId !== "minecraft:player") return;
    markForcedDeathForRecovery(player);
  });
} catch {}

try {
  world.afterEvents.playerLeave.subscribe(({ playerId }) => {
    fractionalDamage.delete(playerId);
    bypassNextDamage.delete(playerId);
    lastNativeHealth.delete(playerId);
    izanagiPending.delete(playerId);
    izanagiOffhandBackup.delete(playerId);
  });
} catch {}

try {
  world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    fractionalDamage.delete(player.id);
    bypassNextDamage.delete(player.id);
    izanagiPending.delete(player.id);
    try {
      const health = player.getComponent("minecraft:health") || player.getComponent("health");
      lastNativeHealth.set(player.id, Math.max(0, Number(health?.currentValue) || 0));
    } catch {}

    let blockedByFinalization = false;
    try { blockedByFinalization = player.hasTag(FINALIZATION_DEATH_TAG); } catch {}
    if (blockedByFinalization) izanagiDeathRecovery.delete(player.name);
    const recovery = blockedByFinalization ? undefined : izanagiDeathRecovery.get(player.name);
    if (!initialSpawn && recovery && system.currentTick - recovery.created < 1200) {
      izanagiDeathRecovery.delete(player.name);
      system.runTimeout(() => {
        if (!validEntity(player)) return;
        try {
          if (recovery.location) {
            const dimension = world.getDimension(recovery.dimensionId || "overworld");
            player.teleport(recovery.location, {
              dimension,
              rotation: recovery.rotation || player.getRotation?.()
            });
          }
        } catch {}
        restoreIzanagiOffhand(player, recovery.backup);
        sealPerfectSusanoo(player, false);
        try {
          const health = player.getComponent("minecraft:health") || player.getComponent("health");
          const max = Math.max(1, Number(health?.effectiveMax ?? health?.defaultValue ?? 20));
          health?.setCurrentValue?.(max);
        } catch {}
        try { player.addEffect("regeneration", 160, { amplifier: 2, showParticles: false }); } catch {}
        try { player.addEffect("resistance", 100, { amplifier: 4, showParticles: false }); } catch {}
        izanagiVisual(player);
        try { player.sendMessage("§dIzanagi reescreveu a morte forçada após o renascimento."); } catch {}
      }, 1);
      return;
    }

    const offhand = getOffhand(player);
    if (isIzanagiTotem(offhand) && !isIzanagiArmed(player)) {
      try { getEquippable(player)?.setEquipment(EquipmentSlot.Offhand, undefined); } catch {}
    }
  });
} catch {}


// v18.1.2: migração automática dos personagens salvos durante a regressão
// v18.0.11+. Qualquer minecraft:health acima de 20.000 volta ao buffer fixo,
// preservando a porcentagem atual da barra efetiva.
system.runInterval(() => {
  for (const player of cachedPlayers()) {
    try {
      // Personagens Boss usam um buffer próprio. Não converter esse buffer
      // enquanto o modo Boss estiver ativo.
      if (!canCorrectDamage(player) || player.hasTag?.("nzs_admin_boss_player")) continue;
      const health = player.getComponent("minecraft:health") || player.getComponent("health");
      const oldMax = Math.max(1, Number(health?.effectiveMax ?? health?.defaultValue ?? 20));
      if (!health || oldMax <= SAFE_NATIVE_HEALTH_CAP + 0.5) continue;
      if (Number(health.currentValue) <= 0 || player.hasTag?.("desmaio:caido")) continue;
      // Preserva a porcentagem real ao trocar um máximo nativo inflado pelo
      // buffer fixo. Nenhuma faixa especial depende do valor absoluto do HP.
      const ratio = Math.max(0, Math.min(1, Number(health.currentValue) / oldMax));
      const eventValue = nativeHealthEventValue(SAFE_NATIVE_HEALTH_CAP);
      const epoch = bodyEpoch(player);
      if (typeof player.triggerEvent === "function") player.triggerEvent(`health.${eventValue}`);
      else player.runCommandAsync(`event entity @s health.${eventValue}`);
      system.runTimeout(() => {
        try {
          if (!canCorrectDamage(player, epoch)) return;
          const current = player.getComponent("minecraft:health") || player.getComponent("health");
          if (!current || Number(current.currentValue) <= 0 || player.hasTag?.("desmaio:caido")) return;
          current.setCurrentValue(Math.max(0, Math.min(SAFE_NATIVE_HEALTH_CAP, SAFE_NATIVE_HEALTH_CAP * ratio)));
        } catch {}
      }, 2);
    } catch {}
  }
}, 40);
