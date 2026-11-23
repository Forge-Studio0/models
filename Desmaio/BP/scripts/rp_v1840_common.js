import { emitParticle } from "./rp_v18347_visual_budget.js";
import { world, EquipmentSlot, ItemStack } from "@minecraft/server";
export function valid(e) {
  try { return !!e && (typeof e.isValid === "function" ? e.isValid() : e.isValid !== false); } catch { return false; }
}
export function tell(p, text) { try { p.sendMessage(text); } catch {} }
export function setProp(p, key, value) { try { if (p.getDynamicProperty(key) !== value) p.setDynamicProperty(key, value); return true; } catch { return false; } }
export function score(p, name) { try { return world.scoreboard.getObjective(name)?.getScore(p.scoreboardIdentity) ?? 0; } catch { return 0; } }
export function inventory(p) { try { return p.getComponent("minecraft:inventory")?.container; } catch {} }
export function equipped(p, slot = EquipmentSlot.Mainhand) { try { return p.getComponent("minecraft:equippable")?.getEquipment(slot)?.typeId || ""; } catch { return ""; } }
export function count(p, id) {
  const c = inventory(p); let total = 0;
  if (c) for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === id) total += c.getItem(i).amount;
  return total;
}
export function consume(p, id, amount = 1) {
  if (count(p, id) < amount) return false;
  const c = inventory(p); let left = amount;
  for (let i = 0; i < c.size && left > 0; i++) {
    const it = c.getItem(i); if (it?.typeId !== id) continue;
    const n = Math.min(left, it.amount); left -= n;
    if (it.amount === n) c.setItem(i, undefined); else { it.amount -= n; c.setItem(i, it); }
  }
  return left === 0;
}
export function give(p, id, amount = 1, once = false) {
  if (once && count(p, id)) return true;
  try { const rest = inventory(p)?.addItem(new ItemStack(id, amount)); if (rest) p.dimension.spawnItem(rest, p.location); return true; }
  catch { tell(p, `§cNão foi possível entregar ${id}.`); return false; }
}
export function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
export function sameArea(a, b, range) { try { return valid(a) && valid(b) && a.dimension.id === b.dimension.id && distance(a.location, b.location) <= range; } catch { return false; } }
export function health(p) {
  try { const h = p.getComponent("minecraft:health"); const max = Math.max(1, h.effectiveMax ?? h.defaultValue); return { h, max, current: h.currentValue, ratio: h.currentValue / max }; }
  catch { return { max: 1, current: 0, ratio: 0 }; }
}
export function heal(p, fraction) {
  if (p?.typeId === 'minecraft:player' && p.hasTag('nzs_finalization_death_v1834')) return;
  const s = health(p);
  if (s.h && s.current > 0) s.h.setCurrentValue(Math.min(s.max, s.current + s.max * fraction));
}
export function particle(dim, id, loc) { try { emitParticle(dim, id, loc); } catch {} }
export function safe(p) { try { return p.hasTag("nzs_safe_zone_active"); } catch { return false; } }
export function isNpc(e) {
  try { return /npc|ajudante|mercador|bijuu_.*npc|nzw:.*visual/.test(e.typeId) || e.hasTag("nzs_rp_npc") || e.hasTag("nzs_kage_assistant") || e.hasTag("nzs_no_combat"); }
  catch { return true; }
}
export function combatTarget(p, e) {
  if (!valid(e) || e.id === p.id || safe(p) || safe(e) || isNpc(e)) return false;
  try { return !!e.getComponent("minecraft:health") && !e.hasTag("desmaio:caido") && !e.hasTag("nzw_grabbed"); } catch { return false; }
}
export function viewTarget(p, range = 6, playersOnly = false) {
  try { return p.getEntitiesFromViewDirection({ maxDistance: range }).map(h => h.entity).find(e => e.id !== p.id && !isNpc(e) && (!playersOnly || e.typeId === "minecraft:player") && e.getComponent("minecraft:health")); } catch {}
}
export function action(p, text) { try { p.onScreenDisplay.setActionBar(text); } catch {} }
