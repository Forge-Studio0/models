import assert from 'node:assert/strict';
import test from 'node:test';
import { engine } from './motor_simulado.mjs';

const DOWN = 'desmaio:caido';
const FINAL = 'nzs_finalization_death_v1834';
const CLOCK = 'nzs_downed_state_v26';
const ATTEMPT = 'swbr_death_attempt44';
const deadline = p => JSON.parse(p.getDynamicProperty(CLOCK)).expiresAt;
const floor = .000001;

async function setup(options) {
  const e = await engine(options);
  const p = e.join('alvo');
  const a = e.join('socorrista', {location:{x:-1,y:64,z:0}});
  await e.advance(10);
  return {e,p,a};
}

function alive(p, e) {
  assert.ok(p.hp > 0 && !p.dead && p.moving);
  assert.ok(!p.hasTag(DOWN) && !p.hasTag(FINAL) && !p.hasTag('desmaio:carregado'));
  assert.equal(p.getDynamicProperty(CLOCK), undefined);
  assert.equal(p.getDynamicProperty(ATTEMPT), undefined);
  assert.equal(e.travel.actionFor(p), undefined);
  assert.equal(p.hpMin, floor);
}

function oneDeath(e, p) {
  assert.equal(e.deaths.filter(row => row.id === p.id).length, 1);
  assert.ok(p.dead && !p.hasTag(DOWN));
  assert.equal(p.getDynamicProperty(CLOCK), undefined);
}

test('reproduz a volta ao desmaio da 18.11.82 com o ajuste virtual após a morte', async () => {
  const {e,p}=await setup({original:true});
  p.effective = 1_000;
  e.downed.enterDowned(p, undefined, 1);
  await e.advance(82);
  assert.equal(e.deaths.length,0);
  assert.ok(p.killCalls>0);
  assert.ok(p.hasTag(DOWN));
  assert.ok(p.messages.filter(msg=>msg.includes('Você desmaiou')).length>=2);
});

test('dano fatal e danos consecutivos criam apenas um desmaio e um prazo', async () => {
  const {e,p}=await setup();
  assert.equal(p.applyDamage(60,{cause:'fall'}),false);
  assert.equal(p.applyDamage(80,{cause:'fall'}),false);
  await e.advance(5);
  assert.ok(p.hasTag(DOWN) && p.hp===1 && !p.moving);
  const end = deadline(p);
  p.applyDamage(60,{cause:'fall'});
  await e.advance(30);
  assert.equal(deadline(p),end);
  assert.equal(e.deaths.length,0);
  assert.equal(p.messages.filter(msg=>msg.includes('Você desmaiou')).length,1);
});

test('dois socorristas disputam a mesma reserva e só um reviver é concluído', async () => {
  const {e,p,a}=await setup();
  const b=e.join('outro',{location:{x:-1,y:64,z:0}});
  p.addEffect('resistance',10000,{amplifier:4});
  e.downed.enterDowned(p);
  e.chat(a,'!reviver alvo'); e.chat(b,'!reviver alvo');
  await e.advance(203);
  alive(p,e);
  assert.equal(p.hp,2);
  assert.equal(p.getEffect('resistance').amplifier,4);
  assert.equal(p.messages.filter(x=>x.includes('foi revivido por')).length,1);
  assert.equal(a.hasTag('desmaio:revivendo'),false);
  assert.equal(b.hasTag('desmaio:revivendo'),false);
  assert.equal(e.downed.wakePlayer(p),false);
  p.applyDamage(.5,{cause:'fall'});
  assert.equal(p.hp,1.5);
  await e.advance(2_400);
  assert.equal(e.deaths.length,0);
});

test('dois minutos fora do transporte, morte única com vida virtual e respawn', async () => {
  const {e,p}=await setup();
  p.effective=45_000;
  p.hpMax=20_000;
  p.hp=20_000;
  p.realGroup=true; // Um grupo anterior de morte ainda aparece como instalado.
  e.downed.enterDowned(p);
  await e.advance(2_399);
  assert.equal(e.deaths.length,0);
  assert.equal(p.killCalls,0);
  await e.advance(20);
  oneDeath(e,p);
  assert.equal(p.killCalls,1);
  assert.equal(p.zeroCalls,0);
  e.respawn(p,{x:9,y:80,z:12});
  await e.advance(25);
  alive(p,e);
  assert.deepEqual(p.location,{x:9,y:80,z:12});
  assert.equal(p.teleports.length,0);
  assert.equal(p.hp,20_000);
  assert.equal(e.deaths.length,1);
});

test('finalização pelo painel usa a animação existente e confirma morte uma vez', async () => {
  const {e,p,a}=await setup();
  e.downed.enterDowned(p);
  e.chat(a,'!finalizar alvo');
  e.chat(a,'!finalizar alvo');
  await e.advance(13);
  assert.equal(e.deaths.length,0);
  assert.ok(a.hasTag('swbr_finalizing44'));
  assert.equal(e.downed.wakePlayer(p),true); // Um jutsu permitido pode salvar antes do golpe confirmado.
  await e.advance(10);
  alive(p,e);
  assert.ok(!a.hasTag('swbr_finalizing44'));
  e.downed.enterDowned(p);
  e.chat(a,'!finalizar alvo');
  await e.advance(30);
  oneDeath(e,p);
  assert.equal(p.killCalls,1);
  assert.deepEqual(e.audit,[['finish',a.id,p.id]]);
  assert.equal(e.announcements.length,1);
  assert.equal(e.downed.wakePlayer(p),false);
  e.respawn(p);
  await e.advance(20);
  alive(p,e);
  assert.equal(e.announcements.length,1);
});

test('se a confirmação entityDie não chega, o respawn confirma sem repetir a morte', async () => {
  const {e,p}=await setup();
  p.hideDeathEvent=true;
  e.downed.enterDowned(p,undefined,1);
  await e.advance(30);
  oneDeath(e,p);
  assert.equal(p.killCalls,1);
  assert.ok(p.hasTag(FINAL));
  e.respawn(p,{x:80,y:64,z:3},'nether');
  await e.advance(25);
  alive(p,e);
  assert.equal(p.dimension.id,'minecraft:nether');
  assert.deepEqual(p.location,{x:80,y:64,z:3});
  assert.equal(e.deaths.length,1);
});

test('o spawn de vila configurado mantém a prioridade e seu próprio teleporte', async () => {
  const e=await engine();
  e.world.setDynamicProperty('nzs_village_spawn_v17028_folha',JSON.stringify({x:123,y:73,z:-33,dimension:'overworld'}));
  const p=e.join('vila',{tags:['Folha']});
  await e.advance(10);
  e.downed.enterDowned(p,undefined,1);
  await e.advance(20);
  oneDeath(e,p);
  assert.equal(p.teleports.length,0);
  e.respawn(p);
  await e.advance(15);
  alive(p,e);
  assert.deepEqual(p.location,{x:123.5,y:73.05,z:-32.5});
  assert.equal(p.teleports.length,1);
});

test('ao atingir o prazo, reviver e finalização antiga não tomam o lugar da morte automática', async () => {
  const {e,p,a}=await setup();
  e.downed.enterDowned(p,undefined,210);
  e.chat(a,'!reviver alvo');
  await e.advance(200);
  e.jumpWall(deadline(p)-e.time()-50);
  await e.advance(1);
  assert.equal(e.downed.wakePlayer(p),false);
  assert.equal(e.downed.keepPlayerDowned(p,240),false);
  e.chat(a,'!finalizar alvo');
  await e.advance(25);
  oneDeath(e,p);
  assert.deepEqual(e.audit,[['timeout',p.id]]);
  assert.equal(p.messages.some(x=>x.includes('foi revivido')),false);
});

test('carregar pausa, soltar retoma o prazo e duas pessoas não podem carregar o mesmo alvo', async () => {
  const {e,p,a}=await setup();
  const b=e.join('outro',{location:{x:-1,y:64,z:0}});
  e.downed.enterDowned(p,undefined,100);
  e.chat(a,'!carregar alvo'); e.chat(b,'!carregar alvo');
  await e.advance(4);
  const remaining=JSON.parse(p.getDynamicProperty(CLOCK)).remainingMs;
  assert.ok(a.riders.has(p) && b.riders.size===0 && p.hasTag('desmaio:carregado'));
  e.jumpWall(180_000);
  await e.advance(20);
  assert.equal(e.deaths.length,0);
  assert.equal(JSON.parse(p.getDynamicProperty(CLOCK)).remainingMs,remaining);
  e.chat(a,'!soltar');
  await e.advance(2);
  assert.ok(!p.hasTag('desmaio:carregado') && !a.hasTag('desmaio:carregando') && a.riders.size===0);
  assert.equal(deadline(p)-e.time(),remaining-50);
  await e.advance(120);
  oneDeath(e,p);
});

test('o prazo persiste desconectado e um carregador ausente libera o transporte', async () => {
  const {e,p,a}=await setup();
  e.downed.enterDowned(p,undefined,80);
  e.chat(a,'!carregar alvo');
  await e.advance(5);
  const saved=e.disconnect(p);
  assert.equal(a.riders.size,0);
  assert.ok(!a.hasTag('desmaio:carregando'));
  e.jumpWall(5_000);
  const returned=e.join(p.id,saved);
  await e.advance(15);
  oneDeath(e,returned);
  e.respawn(returned);
  await e.advance(15);
  alive(returned,e);
});

test('reiniciar o servidor preserva o prazo e o expira se já passou offline', async () => {
  const {e,p}=await setup();
  e.downed.enterDowned(p,undefined,100);
  const end=deadline(p),saved=e.save();
  const next=await engine({save:saved,time:saved.time+2_000});
  const returned=next.join(p.id);
  assert.ok(returned.hasTag(DOWN));
  assert.equal(deadline(returned),end);
  next.jumpWall(4_000);
  await next.advance(15);
  oneDeath(next,returned);
});

test('reconectar durante a morte continua a autorização sem reenfileirar kill', async () => {
  const {e,p}=await setup();
  p.killMode='ignored';
  e.downed.enterDowned(p,undefined,1);
  for(let i=0;i<15&&!p.killCalls;i++)await e.advance();
  assert.equal(p.killCalls,1);
  assert.ok(p.hasTag(FINAL) && !p.hasTag(DOWN));
  const saved=e.disconnect(p);
  const returned=e.join(p.id,saved);
  await e.advance(20);
  oneDeath(e,returned);
  assert.equal(returned.killCalls,1);
  assert.equal(returned.zeroCalls,1);
  const state=e.save();
  const next=await engine({save:state});
  const spawned=next.join(p.id,{...state.players[p.id],hp:20,hpMin:floor,dead:false});
  await next.advance(20);
  alive(spawned,next);
  assert.equal(next.deaths.length,0);
});

test('escritas de cura e reaplicações da ponte respeitam a morte pendente', async () => {
  const {e,p}=await setup();
  p.killMode='ignored';
  e.downed.enterDowned(p,undefined,1);
  for(let i=0;i<15&&!p.killCalls;i++)await e.advance();
  assert.equal(p.killCalls,1);
  assert.ok(p.hasTag(FINAL));
  assert.equal(p.heal(7),false);
  e.heal.heal(p,.5);
  e.healthSync.fillHealthToMax(p);
  e.healthSync.queueHealthSync(p,250,{force:true});
  e.commands.fire({sourceEntity:p,id:'swbr:desmaio_force_v18719',message:'force'});
  await e.advance(2);
  assert.equal(p.hp,1);
  assert.equal(p.killCalls,1);
  await e.advance(25);
  oneDeath(e,p);
  assert.equal(p.zeroCalls,1);
  e.respawn(p);
  await e.advance(10);
  alive(p,e);
  p.applyDamage(4,{cause:'fall'});
  assert.equal(p.hp,16);
  assert.equal(p.heal(4),true);
  assert.equal(p.hp,20);
});

test('motor que recusa as duas operações ou mantém o mínimo termina sem ciclo de desmaio', async () => {
  for(const stuckFloor of [false,true]){
    const {e,p}=await setup();
    p.killMode='reject'; p.denyZero=true;
    if(stuckFloor)p.floorMode='stuck';
    e.downed.enterDowned(p,undefined,1);
    await e.advance(100);
    alive(p,e);
    assert.equal(p.killCalls,stuckFloor?0:1);
    assert.equal(p.zeroCalls,stuckFloor?0:1);
    assert.equal(e.deaths.length,0);
    assert.equal(e.pendingAudit.size,0);
    assert.equal(p.messages.filter(msg=>msg.includes('Você desmaiou')).length,1);
    assert.equal(p.messages.filter(msg=>msg.includes('motor não confirmou')).length,1);
  }
});

test('cinco ciclos completos preservam cura, nova queda, morte e novos golpes', async () => {
  const {e,p}=await setup();
  for(let i=1;i<=5;i++){
    assert.equal(e.downed.enterDowned(p,undefined,8),true);
    assert.equal(e.downed.wakePlayer(p),true);
    assert.equal(e.downed.wakePlayer(p),false);
    p.applyDamage(.5,{cause:'fall'});
    assert.equal(p.hp,1.5);
    assert.equal(p.applyDamage(10,{cause:'fall'}),false);
    await e.advance(5);
    assert.ok(p.hasTag(DOWN));
    e.jumpWall(121_000);
    await e.advance(15);
    assert.equal(e.deaths.length,i);
    e.respawn(p);
    await e.advance(20);
    alive(p,e);
    assert.equal(p.killCalls,i);
  }
});

test('uma reserva de dano da vida anterior não volta após reviver', async () => {
  const {e,p}=await setup();
  assert.equal(p.applyDamage(80,{cause:'fall'}),false);
  assert.equal(e.downed.enterDowned(p),true);
  assert.equal(e.downed.wakePlayer(p),true);
  await e.advance(20);
  alive(p,e);
  assert.equal(p.hp,2);
  assert.equal(e.deaths.length,0);
});

test('finalização pelo próprio carregador libera o assento e mata uma vez', async () => {
  const {e,p,a}=await setup();
  e.downed.enterDowned(p);
  e.chat(a,'!carregar alvo');
  await e.advance(4);
  assert.ok(a.riders.has(p));
  e.chat(a,'!finalizar alvo');
  await e.advance(30);
  oneDeath(e,p);
  assert.equal(a.riders.size,0);
  assert.equal(e.travel.actionFor(a),undefined);
  assert.ok(!a.hasTag('desmaio:carregando') && !a.hasTag('swbr_finalizing44') && a.moving);
  assert.equal(p.killCalls,1);
});

test('reiniciar com um transporte salvo solta o corpo e retoma o tempo restante', async () => {
  const {e,p,a}=await setup();
  e.downed.enterDowned(p,undefined,100);
  e.chat(a,'!carregar alvo');
  await e.advance(4);
  const remaining=JSON.parse(p.getDynamicProperty(CLOCK)).remainingMs;
  const saved=e.save();
  const next=await engine({save:saved,time:saved.time+180_000});
  const returned=next.join(p.id);
  const carrier=next.join(a.id);
  assert.ok(!returned.hasTag('desmaio:carregado') && !carrier.hasTag('desmaio:carregando'));
  assert.equal(deadline(returned)-next.time(),remaining);
  await next.advance(140);
  oneDeath(next,returned);
});

test('a morte é confirmada mesmo quando a entidade do evento já está inválida', async () => {
  const {e,p}=await setup();
  p.invalidateAtDeath=true;
  e.downed.enterDowned(p,undefined,1);
  await e.advance(20);
  assert.equal(e.deaths.length,1);
  assert.equal(JSON.parse(e.world.getDynamicProperty('swbr_final_death83_'+p.id)).confirmed,true);
  e.respawn(p);
  await e.advance(20);
  alive(p,e);
});

test('tarefas de vila de um spawn anterior não teleportam um corpo caído nem duplicam a viagem', async () => {
  const e=await engine();
  e.world.setDynamicProperty('nzs_village_spawn_v17028_folha',JSON.stringify({x:110,y:65,z:-33,dimension:'overworld'}));
  const p=e.join('vila',{tags:['Folha']});
  e.respawn(p);
  e.downed.enterDowned(p);
  await e.advance(12);
  assert.equal(p.teleports.length,0);
  assert.ok(e.downed.wakePlayer(p));
  e.respawn(p); e.respawn(p);
  await e.advance(20);
  assert.equal(p.teleports.length,1);
  alive(p,e);
});

test('a viagem autorizada do carregador mantém o vínculo e a pausa entre dimensões', async () => {
  const {e,p,a}=await setup();
  e.downed.enterDowned(p,undefined,100);
  e.chat(a,'!carregar alvo');
  await e.advance(4);
  const remaining=JSON.parse(p.getDynamicProperty(CLOCK)).remainingMs;
  assert.equal(e.travel.teleportCarryParty(a,e.getDimension('nether'),{x:31,y:70,z:4},{}),true);
  e.after.playerDimensionChange.fire({player:a});
  e.after.playerDimensionChange.fire({player:p});
  await e.advance(12);
  assert.equal(p.dimension.id,'minecraft:nether');
  assert.ok(a.riders.has(p) && p.hasTag('desmaio:carregado'));
  assert.equal(JSON.parse(p.getDynamicProperty(CLOCK)).remainingMs,remaining);
  e.chat(a,'!soltar');
  await e.advance(120);
  oneDeath(e,p);
});
