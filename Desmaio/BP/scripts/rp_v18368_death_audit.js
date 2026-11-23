import { world, system, Player } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { getStaffRole } from "./rp_v17026_staff_permissions.js";
import { canUseStaffPanelAction } from "./rp_v17026_staff_panel_core.js";
import { characterRevision } from "./rp_v18358_character_state.js";
import { createAuditArchive, auditText, auditDate } from "./rp_v18368_audit_archive.js";
import { showAuditPages, cancelAuditQuery } from "./rp_v18368_audit_forms.js";

const archive = createAuditArchive("nzs_death_archive_v18368");
const staged = new Map(), seen = new Map();
const message = (p, text) => { try { p.sendMessage(text); } catch {} };
const canView = p => { try { return p instanceof Player && canUseStaffPanelAction(getStaffRole(p), "death_logs"); } catch { return false; } };
function identity(p) {
  let rp = "", surname = "";
  try { rp = auditText(p.getDynamicProperty("nzs_roleplay_name"), 24); } catch {}
  try { surname = auditText(p.getDynamicProperty("nzs_roleplay_surname") || p.getDynamicProperty("rp_clan"), 32); } catch {}
  if (rp && surname && !rp.toLowerCase().endsWith(` ${surname.toLowerCase()}`)) rp = `${rp} ${surname}`;
  return { tag: auditText(p.name, 48), rp: rp || "Sem nome RP" };
}
function place(p) {
  try { const l = p.location; return { d: auditText(p.dimension.id, 48).replace(/^minecraft:/, ""), x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) }; }
  catch { return { d: "indisponível" }; }
}
function stage(victim, killer, kind) {
  try {
    staged.set(victim.id, { revision: characterRevision(victim), tick: system.currentTick, victim: identity(victim), killer: killer ? identity(killer) : undefined, kind, ...place(victim) });
  } catch {}
}
export function stageFinalizationAudit(finisher, victim) { stage(victim, finisher, "finalizacao"); }
export function stageDownedDeathAudit(victim) { stage(victim, undefined, "sem_socorro"); }
export function clearStagedDeathAudit(victim) { staged.delete(victim.id); }
// Chamado apenas em entityDie, depois de resolver o agressor real. Desmaio,
// confirmação cancelada e reanimação não produzem uma morte no histórico.
export function recordPlayerDeath(victim, killer, damageSource) {
  try {
    if (!(victim instanceof Player)) return;
    const revision = characterRevision(victim), key = `${revision}:${system.currentTick}`;
    if (seen.get(victim.id)?.key === key) return;
    const candidate = staged.get(victim.id);
    staged.delete(victim.id);
    const context = candidate && candidate.revision === revision && system.currentTick >= candidate.tick && system.currentTick - candidate.tick <= 40 ? candidate : undefined;
    const author = context?.killer || (killer instanceof Player && killer.id !== victim.id ? identity(killer) : undefined);
    let source = damageSource?.damagingEntity;
    try { if (!(source instanceof Player)) source = source?.getComponent("minecraft:projectile")?.owner; } catch {}
    const attribution = context?.killer ? "finalizador" : author ? source?.id === killer?.id ? "dano" : "ultimo_agressor" : "ambiente";
    const entry = { t: Date.now(), kind: context?.kind || "morte", victim: context?.victim || identity(victim), killer: author,
      attribution, cause: auditText(damageSource?.cause || "unknown", 48), ...(context ? { d: context.d, x: context.x, y: context.y, z: context.z } : place(victim)) };
    if (archive.append(entry, true)) seen.set(victim.id, { key, tick: system.currentTick });
  } catch (error) { console.warn(`[DeathLog] ${String(error)}`); }
}
function person(data) { return data ? `§f${data.rp} §7(@${data.tag})` : "§7Ambiente / autor não identificado"; }
function eventLine(e) {
  const label = e.kind === "finalizacao" ? "§4Finalização" : e.kind === "sem_socorro" ? "§6Morte sem socorro" : "§cMorte";
  return `${label} §8• ${auditDate(e.t)}\n§7${e.kind === "finalizacao" ? "Finalizador" : e.attribution === "ultimo_agressor" ? "Último agressor registrado" : "Autor"}: ${person(e.killer)}\n§7Alvo: ${person(e.victim)}\n§8${e.d}${Number.isFinite(e.x) ? ` • X${e.x} Y${e.y} Z${e.z}` : ""}${e.kind === "morte" ? ` • ${e.cause}` : ""}`;
}
function openRecords(p, query = "", onlyFinalizations = false) {
  const needle = auditText(query, 48).toLowerCase();
  return showAuditPages(p, archive, { title: "§4§lMortes e Finalizações", description: `§fBusca: §e${query || "todos os jogadores"}\n§fTipo: §e${onlyFinalizations ? "somente finalizações" : "mortes e finalizações"}`,
    canView, matches: e => !!e.victim?.tag && Number.isFinite(e.t) && (!onlyFinalizations || e.kind === "finalizacao") && (!needle || String(e.killer?.tag || "").toLowerCase().includes(needle) || String(e.victim.tag).toLowerCase().includes(needle)),
    format: eventLine, search: () => openSearch(p, onlyFinalizations), back: () => openDeathLogAdminMenu(p) });
}
function openSearch(p, onlyFinalizations = false) {
  if (!canView(p)) return;
  cancelAuditQuery(p);
  new ModalFormData().title("§4Pesquisar gamertag").textField("Gamertag do autor ou alvo (inclusive offline)", "Nome ou parte do nome", "").show(p).then(answer => {
    if (!canView(p)) return;
    if (answer.canceled) return openDeathLogAdminMenu(p);
    openRecords(p, auditText(answer.formValues?.[0], 48), onlyFinalizations);
  }).catch(() => {});
}
export function openDeathLogAdminMenu(p) {
  if (!canView(p)) return message(p, "§cSomente a staff e auditores podem consultar as mortes.");
  cancelAuditQuery(p);
  new ActionFormData().title("§4§lMortes / Finalizações")
    .body("§fNome de RP e gamertag de quem finalizou e do alvo.\n§7Histórico de todos os dias registrados, preservado após reiniciar o servidor.\n§7Os nomes de RP são os da ocorrência.\n§8Datas em UTC−3; registros começam nesta atualização.")
    .button("§cMortes e finalizações").button("§4Somente finalizações").button("§bPesquisar gamertag").button("§dPesquisar gamertag — finalizações").button("§7Fechar").show(p).then(answer => {
      if (answer.canceled || !canView(p)) return;
      if (answer.selection === 0) openRecords(p);
      if (answer.selection === 1) openRecords(p, "", true);
      if (answer.selection === 2) openSearch(p);
      if (answer.selection === 3) openSearch(p, true);
    }).catch(() => {});
}
world.beforeEvents.chatSend?.subscribe(ev => {
  const text = String(ev.message || "").trim(), parts = text.split(/\s+/), command = parts.shift()?.toLowerCase();
  if (command !== "!logmortes" && command !== "!logfinalizacoes") return;
  ev.cancel = true;
  system.run(() => { if (!canView(ev.sender)) return message(ev.sender, "§cAcesso restrito à staff e auditores."); if (parts.length) openRecords(ev.sender, parts.join(" "), command === "!logfinalizacoes"); else if (command === "!logfinalizacoes") openRecords(ev.sender, "", true); else openDeathLogAdminMenu(ev.sender); });
});
system.runInterval(() => {
  for (const [id, value] of staged) if (system.currentTick - value.tick > 40) staged.delete(id);
  for (const [id, value] of seen) if (system.currentTick - value.tick > 200) seen.delete(id);
}, 40);
