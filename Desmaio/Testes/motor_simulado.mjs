import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const entries = [
  'rp_v170_downed.js', 'rp_v18719_downed_bridge.js', 'rp_v131_safe_health.js',
  'rp_v17091_health_regen.js', 'rp_v1845_rescue_state.js', 'rp_v18711_control_lease.js',
  'rp_v1840_common.js', 'rp_v118_health_sync.js', 'rp_v17028_weekly_admin.js',
];
const root = new URL('../../', import.meta.url);
const base = new URL('Chinoike/Chinoike_Cumulativo.mcaddon', root);
const fixed = new URL('Desmaio/SWBR_18.11.83_Cumulativo.mcaddon', root);

function sources(url) {
  const extract = `
from io import BytesIO
from zipfile import ZipFile
import json,sys
with ZipFile(sys.argv[1]) as addon:
    names = addon.namelist()
    bp, = (x for x in names if x.startswith('SWBR_BP_v'))
    native, = (x for x in names if x.startswith('SWBR_Desmaio_Nativo_BP_v'))
    with ZipFile(BytesIO(addon.read(bp))) as common, ZipFile(BytesIO(addon.read(native))) as driver:
        result = {x: common.read('scripts/'+x).decode() for x in sys.argv[2:]}
        result['driver.js'] = driver.read('scripts/main.js').decode()
        entity = json.loads(common.read('entities/player.json'))['minecraft:entity']
        result['floor'] = entity['events']['swbr:floor_allow_death30']
        print(json.dumps(result))
`;
  return JSON.parse(execFileSync('python3', ['-c', extract, fileURLToPath(url), ...entries], { encoding: 'utf8' }));
}

const loaded = { anterior: sources(base), atual: sources(fixed) };

class Signal {
  callbacks = [];
  subscribe(fn) { this.callbacks.push(fn); return fn; }
  fire(event) { for (const fn of this.callbacks) fn(event); return event; }
}

function signals() {
  const result = {};
  return new Proxy(result, { get: (obj, key) => obj[key] ??= new Signal() });
}

class Form {
  title() { return this; }
  body() { return this; }
  button() { return this; }
}

const clockStart = 1_780_000_000_000;
const finalTag = 'nzs_finalization_death_v1834';
const resistanceStub = 0;

export async function engine({ original = false, save, time = save?.time ?? clockStart } = {}) {
  const files = loaded[original ? 'anterior' : 'atual'];
  const resetsGroup = files.floor.sequence?.[0].remove.component_groups.includes('swbr:real_death30');
  let tick = 0, nextJob = 0;
  const jobs = new Map(), players = new Map(), objectives = new Map();
  const worldProps = new Map(save?.worldProps);
  const audit = [], pendingAudit = new Set(), deaths = [], announcements = [], warnings = [];
  const before = signals(), after = signals(), commands = new Signal();
  const schedule = (fn, delay, repeat = 0) => {
    const key = ++nextJob;
    jobs.set(key, { fn, tick: tick + Math.max(1, delay), repeat });
    return key;
  };
  const system = {
    get currentTick() { return tick; },
    run: fn => schedule(fn, 1), runTimeout: (fn, n = 1) => schedule(fn, n),
    runInterval: (fn, n = 1) => schedule(fn, n, n), clearRun: id => jobs.delete(id),
    afterEvents: { scriptEventReceive: commands },
  };
  const dims = new Map();
  function getDimension(id) {
    id = String(id).replace(/^minecraft:/, '');
    if (!dims.has(id)) dims.set(id, { id: 'minecraft:' + id,
      getBlock: () => ({ isAir: false }), runCommandAsync: async () => ({ successCount: 1 }) });
    return dims.get(id);
  }
  const world = {
    beforeEvents: before, afterEvents: after, getDimension,
    getAbsoluteTime: () => tick, getAllPlayers: () => [...players.values()], getEntity: id => players.get(id),
    getDynamicProperty: key => worldProps.get(key),
    setDynamicProperty: (key, value) => value === undefined ? worldProps.delete(key) : worldProps.set(key, value),
    scoreboard: {
      getObjective: key => objectives.get(key),
      addObjective: key => { const scores = new Map(); const result = { getScore: id => scores.get(id), setScore: (id, n) => scores.set(id, n) };
        objectives.set(key, result); return result; },
    },
    sendMessage: msg => announcements.push(msg),
  };

  class Player {
    constructor(id, saved={}) {
      Object.assign(this, { id, name: id, typeId: 'minecraft:player', isValid: true, isSneaking: false,
        location: {x: 0, y: 64, z: 0}, hp: 20, hpMax: 20, hpMin: .000001, effective: 20,
        revision: 1, mark: 0, moving: true, floorMode: 'normal', realGroup: false,
        killMode: 'normal', denyZero: false, killCalls: 0, zeroCalls: 0, dead: false, hideDeathEvent: false }, saved);
      this.dimension = getDimension(saved.dimension ?? 'overworld');
      this.props = new Map(saved.props);
      this.tags = new Set(saved.tags);
      this.effects = new Map(saved.effects);
      this.messages = []; this.teleports = []; this.riders = new Set(); this.mounted = false;
      this.scoreboardIdentity = id;
      this.onScreenDisplay = { setActionBar: text => this.actionBar = text };
      this.inputPermissions = { isPermissionCategoryEnabled: () => this.moving,
        setPermissionCategory: (category, value) => this.moving = value };
      this.inputInfo = { getMovementVector: () => ({x: 0, y: 0}), getButtonState: () => 'Released' };
    }
    snapshot() {
      const names = ['location','hp','hpMax','hpMin','effective','revision','mark','moving','floorMode','realGroup',
        'killMode','denyZero','killCalls','zeroCalls','dead','hideDeathEvent','spawnPoint'];
      const data = Object.fromEntries(names.map(key => [key, this[key]]));
      return { ...data, location: {...this.location}, dimension: this.dimension.id, props: [...this.props],
        tags: [...this.tags], effects: [...this.effects] };
    }
    getDynamicProperty(key) {
      if (!this.isValid) throw Error('ator desconectado');
      return this.props.get(key);
    }
    setDynamicProperty(key, value) {
      if (!this.isValid) throw Error('ator desconectado');
      if (value === undefined) this.props.delete(key); else this.props.set(key, value);
    }
    hasTag(key) { return this.tags.has(key); }
    getTags() { return [...this.tags]; }
    addTag(key) { this.tags.add(key); return true; }
    removeTag(key) { return this.tags.delete(key); }
    getProperty() { return 0; }
    getGameMode() { return 'survival'; }
    getEffect(key) { return this.effects.get(key); }
    addEffect(key, duration, info) { this.effects.set(key, { duration, ...info }); }
    removeEffect(key) { return this.effects.delete(key); }
    sendMessage(msg) { this.messages.push(msg); }
    playAnimation() {}
    playSound() {}
    clearVelocity() {}
    getViewDirection() { return { x: 1, y: 0, z: 0 }; }
    getRotation() { return { x: 0, y: 0 }; }
    setSpawnPoint(point) { this.spawnPoint = { ...point, dimension: point.dimension.id }; }
    teleport(location, options={}) {
      this.location = {...location};
      this.dimension = options.dimension ?? this.dimension;
      this.teleports.push({ position: {...location}, dimension: this.dimension.id });
    }
    tryTeleport(location, options) { this.teleport(location, options); return true; }
    getComponent(key) {
      const p = this;
      if (key === 'minecraft:health' || key === 'health') return {
        get currentValue() { return p.hp; }, get effectiveMax() { return p.hpMax; },
        get effectiveMin() { return p.hpMin; }, get defaultValue() { return p.hpMax; },
        setCurrentValue(value) {
          if (value <= 0) { p.zeroCalls++; if (p.denyZero) return false; }
          p.writeHealth(value);
          if (p.hp <= 0) p.commitEngineDeath('script_health');
          return true;
        },
      };
      if (key === 'minecraft:mark_variant') return { value: this.mark };
      if (key === 'minecraft:type_family') return { hasTypeFamily: () => true };
      if (key === 'minecraft:equippable') return { getEquipment: () => undefined, setEquipment: () => true };
      if (key === 'minecraft:rideable' && this.mounted) return { getRiders: () => [...this.riders],
        addRider: rider => { this.riders.add(rider); return true; }, ejectRider: rider => this.riders.delete(rider) };
    }
    triggerEvent(name) {
      if (name.startsWith('swbr:downed_arm')) this.mark = name.includes('scaled') ? 18722 : 18721;
      if (['swbr:downed_disarm27','swbr:clear_fatal_v18723'].includes(name)) this.mark = 0;
      if (name === 'swbr:floor_allow_death30') {
        this.mark = 0;
        if (this.floorMode === 'stuck' || this.realGroup && !resetsGroup) return;
        system.run(() => {
          if (!this.isValid || this.dead) return;
          this.realGroup = true; this.hpMin = 0; this.hpMax = 20;
          if(this.hp > 1) this.writeHealth(1);
        });
      } else if (name === 'swbr:floor_restore30') {
        this.realGroup = false; this.hpMin = .000001; this.hpMax = 20;
      } else if (name.startsWith('health.')) {
        this.hpMin = .000001; this.hpMax = Number(name.slice(7)) + 20;
      } else if (name.startsWith('swbr:carry32_')) {
        this.mounted = name !== 'swbr:carry32_off';
        if (!this.mounted) this.riders.clear();
      }
    }
    runCommand(command) {
      if (command === 'kill @s') return { successCount: Number(this.kill()) };
      const match = /^scriptevent (\S+)(?: (.*))?$/.exec(command);
      if (match) system.run(() => commands.fire({ sourceEntity: this, id: match[1], message: match[2] || '' }));
      return { successCount: 1 };
    }
    async runCommandAsync(command) { return this.runCommand(command); }
    writeHealth(value) {
      const oldValue = this.hp;
      this.hp = Math.max(this.hpMin, Math.min(value, this.hpMax));
      if (this.hp !== oldValue) after.entityHealthChanged.fire({ entity: this, oldValue, newValue: this.hp });
    }
    heal(amount) {
      const event = before.entityHeal.fire({ healedEntity: this, healing: amount, cancel: false });
      if (!event.cancel && !this.dead) this.writeHealth(this.hp + event.healing);
      return !event.cancel;
    }
    applyDamage(amount, source = { cause:'override' }) {
      if (this.dead || !this.isValid) return false;
      const hurt = before.entityHurt.fire({ hurtEntity: this, damage: amount, damageSource: source, cancel: false });
      if (hurt.cancel) return false;
      this.writeHealth(this.hp - hurt.damage);
      after.entityHurt.fire({ hurtEntity: this, damage: hurt.damage, damageSource: source });
      if (this.hp <= 0) this.commitEngineDeath(source.cause);
      return true;
    }
    kill() {
      this.killCalls++;
      if (this.killMode === 'ignored') return true;
      if (this.killMode === 'reject') return false;
      return this.applyDamage(this.hp, { cause:'override', damagingEntity: this });
    }
    commitEngineDeath(cause) {
      if (this.dead) return;
      this.dead = true;
      if(this.invalidateAtDeath) this.isValid = false;
      deaths.push({ id: this.id, tick, cause });
      if (!this.hideDeathEvent) after.entityDie.fire({ deadEntity: this, damageSource: { cause } });
    }
  }

  class GameDate extends Date { static now() { return time; } }
  const context = vm.createContext({ Date: GameDate, console: { warn: msg => warnings.push(msg), log: () => {} } });
  const bpWorld = { ...world, beforeEvents: new Proxy(before, { get: (obj, key) => key === 'entityHurt' ? undefined : obj[key] }) };
  const api = { system, Player, InputPermissionCategory:{Movement:'movement'}, EntityComponentTypes:{Health:'minecraft:health'},
    EquipmentSlot:{Head:'Head', Offhand:'Offhand'}, InputButton:{Jump:'Jump', Sneak:'Sneak'}, ButtonState:{Pressed:'Pressed'}, ItemStack:class {} };
  const values = (p, key) => key === 'vida' ? p.effective : 0;
  const no = () => false, noop = () => {};
  const stubs = {
    'api1': {...api, world:bpWorld}, 'api2': {...api, world}, 'ui':{ActionFormData:Form,ModalFormData:Form},
    'swbr_perf_181152.js': { watchInterval: (label, fn, n) => system.runInterval(fn,n), registerMapSize:noop },
    'swbr_player_cache_181152.js': { cachedPlayers:world.getAllPlayers },
    'rp_v18714_carry_alignment.js': { carryAlignment: () => ({distance:0,height:0}) },
    'rp_v1871_damage_guards.js': { refreshDamageGuards:noop, liveDamageGuard:no },
    'rp_v18358_character_state.js': { characterRevision: p=>p.revision },
    'rp_v1873_form_session.js': { showSessionForm:async (form, actor, valid)=>({ selection:0, canceled:!valid() }) },
    'rp_v18345_safe_movement.js': { canOccupy:()=>true, teleportPlayerSafely:(p,dim,l)=>{p.teleport(l,{dimension:dim});return true;} },
    'rp_v1878_content_runtime.js': { syncNewContentVisuals:noop },
    'rp_v130_mode_multipliers.js': { getEffectiveAttribute:values },
    'rp_v18368_death_audit.js': { stageFinalizationAudit:(a,p)=>{audit.push(['finish',a.id,p.id]);pendingAudit.add(p.id);},
      stageDownedDeathAudit:p=>{audit.push(['timeout',p.id]);pendingAudit.add(p.id);},
      clearStagedDeathAudit:p=>pendingAudit.delete(p.id) },
    'rp_v18010_damage_origin.js': { isScriptedDamageActive:p=>p.hasTag('nzs_virtual_damage_v18408'),
      hasSafeHealthSensor:()=>true, isTrucoFurniture:no, applyMarkedDamage:(p,n,s)=>p.applyDamage(n,s) },
    'swbr23_adaptive.js': { adaptiveMultiplier:()=>1, confirmAdaptiveHit:noop, ADAPT_RESOLVED:'adaptive' },
    'susanoo_pilot_registry.js': { routeSusanooDamage:p=>p }, 'rp_v18731_dojutsu.js': { tryOcularDodge:no },
    'rp_v18347_visual_budget.js': { emitParticle:noop }, 'rp_v18727_damage_trace.js': { traceDamage:noop },
    'rp_v1840_policy.js': { fatigueFactors:()=>({regen:1,damage:1}), prop:(p,k,f)=>f },
    'rp_v17052_substitution.js': { trySubstituteDamage:no },
    'damage_indicator_bridge.js': { queueEffectiveDamageIndicator:noop, discardLastEffectiveDamageIndicator:noop },
    'rp_v18314_combat_config.js': { COMBAT_CONFIG:{MAX_PVP_DAMAGE:500000} },
    'rp_v96_combat_math.js': { resistanceEventFromDefense:()=>resistanceStub },
    'november_forms.js': { showExclusiveForm:async()=>({canceled:true}) },
    'rp_v17026_staff_permissions.js':{getStaffRole:()=>''}, 'rp_v17026_staff_permissions_core.js':{roleLevel:()=>0},
    'rp_v157_rank_status_caps.js':{getAdminAttributeValues:()=>({}),setAdminAttributeValue:noop},
  };
  const modules = new Map();
  function module(id) {
    if (modules.has(id)) return modules.get(id);
    let result;
    if (id in files) result = new vm.SourceTextModule(files[id], { context, identifier:id });
    else if (id in stubs) {
      const data=stubs[id]; result=new vm.SyntheticModule(Object.keys(data), function(){
        for(const [key,val] of Object.entries(data))this.setExport(key,val);
      }, {context,identifier:id});
    } else throw Error('Importação sem fixture: '+id);
    modules.set(id,result); return result;
  }
  const linker = (specifier, parent) => module(specifier === '@minecraft/server' ? parent.identifier === 'driver.js' ? 'api2' : 'api1'
    : specifier === '@minecraft/server-ui' ? 'ui' : specifier.split('/').at(-1));
  async function importModule(name) {
    const m=module(name);
    if(m.status==='unlinked')await m.link(linker);
    if(m.status==='linked')await m.evaluate();
    return m.namespace;
  }
  const downed = await importModule('rp_v170_downed.js');
  const bridge = await importModule('rp_v18719_downed_bridge.js');
  const heal = await importModule('rp_v1840_common.js');
  const healthSync = await importModule('rp_v118_health_sync.js');
  const travel = await importModule('rp_v1845_rescue_state.js');
  await importModule('driver.js');
  await importModule('rp_v17028_weekly_admin.js');

  async function advance(ticks=1, msPerTick=50) {
    for (let i=0;i<ticks;i++) {
      tick++; time+=msPerTick;
      for(const [id,job] of [...jobs]){
        if(!jobs.has(id)||job.tick>tick)continue;
        if(job.repeat)job.tick+=job.repeat;else jobs.delete(id);
        job.fn();
      }
      await Promise.resolve(); await Promise.resolve();
    }
  }
  function join(id, data=save?.players?.[id]) {
    const p=new Player(id,data); players.set(id,p);
    after.playerSpawn.fire({player:p,initialSpawn:true}); return p;
  }
  function disconnect(p) {
    p.isValid=false; players.delete(p.id);
    after.playerLeave.fire({playerId:p.id,playerName:p.name}); return p.snapshot();
  }
  function respawn(p, location={x:41,y:78,z:-61}, dimension='overworld') {
    if(p.spawnPoint){location=p.spawnPoint;dimension=p.spawnPoint.dimension;}
    p.dead=false; p.isValid=true; p.hpMax=20; p.hp=20; p.hpMin=.000001; p.realGroup=false; p.moving=true; p.effects.clear();
    p.location={x:location.x,y:location.y,z:location.z}; p.dimension=getDimension(dimension);
    after.playerSpawn.fire({player:p,initialSpawn:false});
  }
  return { tick:()=>tick, time:()=>time, world, before, after, commands, downed, bridge, heal, healthSync, travel,
    audit, pendingAudit, deaths, announcements, warnings, join, disconnect, respawn, advance, getDimension,
    save:()=>({time,worldProps:[...worldProps],players:Object.fromEntries([...players].map(([id,p])=>[id,p.snapshot()]))}),
    jumpWall:ms=>time+=ms, chat:(sender,message)=>before.chatSend.fire({sender,message,cancel:false}) };
}
