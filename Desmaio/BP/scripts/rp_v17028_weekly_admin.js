import {showExclusiveForm} from "./november_forms.js";
import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { getStaffRole } from "./rp_v17026_staff_permissions.js";
import { roleLevel } from "./rp_v17026_staff_permissions_core.js";
import { getAdminAttributeValues, setAdminAttributeValue } from "./rp_v157_rank_status_caps.js";

export const VILLAGE_SPAWN_DEFS=Object.freeze([
 {tag:"Folha",label:"Konoha / Folha"},{tag:"Areia",label:"Sunagakure / Areia"},{tag:"Nuvem",label:"Kumogakure / Nuvem"},
 {tag:"Redemoinho",label:"Uzushiogakure / Redemoinho"},{tag:"Nevoa",label:"Kirigakure / Névoa"},{tag:"Pedra",label:"Iwagakure / Pedra"},
 {tag:"Madeira",label:"Vila da Madeira"},{tag:"Gelo",label:"Vila do Gelo"},{tag:"Chuva",label:"Amegakure / Chuva"},
 {tag:"Som",label:"Otogakure / Som"},
 {tag:"Paz",label:"Vila da Paz"},
 {tag:"EntidadeLP",label:"Vila Entidade LP"},
 {tag:"Neve",label:"Vila da Neve"}
]);
const PREFIX="nzs_village_spawn_v17028_";
function roleOK(p,min){try{return roleLevel(getStaffRole(p))>=min}catch{return false}}
function dimKey(id){const s=String(id||"minecraft:overworld");return s.replace(/^minecraft:/,"")}
function dimFromKey(id){try{return world.getDimension(dimKey(id))}catch{try{return world.getDimension("overworld")}catch{return undefined}}}
function pkey(tag){return PREFIX+String(tag).toLowerCase()}
function getSpawn(tag){try{const raw=world.getDynamicProperty(pkey(tag));if(!raw)return undefined;const v=JSON.parse(String(raw));if(!Number.isFinite(v?.x)||!Number.isFinite(v?.y)||!Number.isFinite(v?.z))return undefined;return{x:Number(v.x),y:Number(v.y),z:Number(v.z),dimension:String(v.dimension||"overworld")}}catch{return undefined}}
function setSpawn(tag,data){try{world.setDynamicProperty(pkey(tag),data?JSON.stringify(data):undefined);return true}catch{return false}}
function villageOf(p){for(const d of VILLAGE_SPAWN_DEFS)try{if(p.hasTag(d.tag))return d}catch{}return undefined}
function applySpawnPoint(p,spawn){const dim=dimFromKey(spawn.dimension);if(!dim)return false;try{p.setSpawnPoint({dimension:dim,x:Math.floor(spawn.x),y:Math.floor(spawn.y),z:Math.floor(spawn.z)});return true}catch{}try{p.runCommandAsync(`execute in ${dimKey(spawn.dimension)} run spawnpoint @s ${Math.floor(spawn.x)} ${Math.floor(spawn.y)} ${Math.floor(spawn.z)}`);return true}catch{return false}}
export function syncVillageSpawnForPlayer(p,{teleport=false}={}){const village=villageOf(p);if(!village)return false;const spawn=getSpawn(village.tag);if(!spawn)return false;applySpawnPoint(p,spawn);if(teleport){const dim=dimFromKey(spawn.dimension);if(dim)try{p.teleport({x:spawn.x+.5,y:spawn.y+.05,z:spawn.z+.5},{dimension:dim})}catch{}}return true}
function fmtSpawn(s){return s?`§a${Math.floor(s.x)} ${Math.floor(s.y)} ${Math.floor(s.z)} §7(${dimKey(s.dimension)})`:"§cNÃO CONFIGURADO"}
function editVillageSpawn(admin,def){if(!roleOK(admin,4)){admin.sendMessage("§cSomente Gerente e Dono podem configurar spawns de vila.");return}const current=getSpawn(def.tag);const f=new ActionFormData().title(`§2Spawn — ${def.label}`).body(`§fAtual: ${fmtSpawn(current)}\n\n§7Ao setar uma vila no jogador, este ponto vira o respawn dele. A troca de dimensão/teleporte acontece após a morte, sem forçar teleporte ao entrar no servidor.`).button("§aUsar minha posição atual").button("§eDigitar coordenadas").button("§cRemover spawn").button("§7Voltar");showExclusiveForm(f,admin).then(r=>{if(r.canceled||r.selection===3)return openVillageSpawnAdminMenu(admin);if(r.selection===0){const l=admin.location;setSpawn(def.tag,{x:Math.floor(l.x),y:Math.floor(l.y),z:Math.floor(l.z),dimension:dimKey(admin.dimension.id)});for(const p of world.getAllPlayers())syncVillageSpawnForPlayer(p);admin.sendMessage(`§aSpawn de ${def.label} salvo na sua posição.`);return editVillageSpawn(admin,def)}if(r.selection===1){const c=getSpawn(def.tag)||{x:0,y:80,z:0,dimension:"overworld"};const m=new ModalFormData().title(`§2Coordenadas — ${def.label}`).textField("X",String(c.x),String(c.x)).textField("Y",String(c.y),String(c.y)).textField("Z",String(c.z),String(c.z)).textField("Dimensão: overworld, nether ou the_end",String(c.dimension),String(c.dimension));showExclusiveForm(m,admin).then(x=>{if(x.canceled)return editVillageSpawn(admin,def);const [xr,yr,zr,dr]=x.formValues||[];const xv=Number(xr),yv=Number(yr),zv=Number(zr),dk=dimKey(dr);if(![xv,yv,zv].every(Number.isFinite)||!["overworld","nether","the_end"].includes(dk)){admin.sendMessage("§cCoordenadas/dimensão inválidas.");return editVillageSpawn(admin,def)}setSpawn(def.tag,{x:xv,y:yv,z:zv,dimension:dk});for(const p of world.getAllPlayers())syncVillageSpawnForPlayer(p);admin.sendMessage(`§aSpawn de ${def.label} atualizado.`);editVillageSpawn(admin,def)}).catch(()=>{})}if(r.selection===2){setSpawn(def.tag,undefined);admin.sendMessage(`§eSpawn de ${def.label} removido.`);openVillageSpawnAdminMenu(admin)}}).catch(()=>{})}
export function openVillageSpawnAdminMenu(admin){if(!roleOK(admin,4)){admin.sendMessage("§cSomente Gerente e Dono podem configurar spawns de vila.");return}const f=new ActionFormData().title("§2Spawns das Vilas").body("§7Configuração exclusiva de Gerente/Dono. Cada jogador passa a renascer na vila correspondente à tag definida pelo painel.");for(const d of VILLAGE_SPAWN_DEFS)f.button(`${d.label}\n${fmtSpawn(getSpawn(d.tag))}`);f.button("§7Fechar");showExclusiveForm(f,admin).then(r=>{if(r.canceled||r.selection>=VILLAGE_SPAWN_DEFS.length)return;editVillageSpawn(admin,VILLAGE_SPAWN_DEFS[r.selection])}).catch(()=>{})}

const ATTRS=[['vida','Vida'],['forca','Força'],['defesa','Defesa'],['ninjutsu','Ninjutsu'],['chakra','Chakra Máximo'],['stamina','Stamina Máxima']];
export function openAdminAttributeMenu(admin,target){if(!roleOK(admin,3)){admin.sendMessage("§cSomente Admin, Gerente e Dono podem definir atributos.");return}const v=getAdminAttributeValues(target);const f=new ModalFormData().title(`§6Atributos — ${target.name}`);for(const [key,label] of ATTRS)f.textField(label,String(v[key]??0),String(v[key]??0));showExclusiveForm(f,admin).then(r=>{if(r.canceled)return;const vals=r.formValues||[];for(let i=0;i<ATTRS.length;i++){const n=Number(vals[i]);if(Number.isFinite(n))setAdminAttributeValue(target,ATTRS[i][0],n)}const out=getAdminAttributeValues(target);admin.sendMessage(`§aAtributos de ${target.name} atualizados. §cVida ${out.vida} §6Força ${out.forca} §bDefesa ${out.defesa} §dNinjutsu ${out.ninjutsu} §3Chakra ${out.chakra} §aStamina ${out.stamina}`);target.sendMessage("§eSeus atributos foram ajustados pela administração.")}).catch(()=>{})}

const spawnJobs = new Map();
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  const id = player.id, token = {};
  spawnJobs.set(id, token);
  system.runTimeout(() => {
    if (spawnJobs.get(id) !== token) return;
    spawnJobs.delete(id);
    try {
      const valid = typeof player.isValid === 'function' ? player.isValid() : player.isValid !== false;
      if (!valid || !(player.getComponent('minecraft:health')?.currentValue > 0)) return;
      const canTeleport = !initialSpawn && !player.hasTag('desmaio:caido') && !player.hasTag('nzs_finalization_death_v1834');
      syncVillageSpawnForPlayer(player, {teleport:canTeleport});
    } catch {}
  }, 8);
});
world.afterEvents.playerLeave.subscribe(({playerId}) => spawnJobs.delete(playerId));
