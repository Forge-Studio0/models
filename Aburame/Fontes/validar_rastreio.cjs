/* Exercise the shipped tracker interval with stubbed Bedrock services. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const {modes} = JSON.parse(fs.readFileSync(path.join(root, 'Integracao_Manifesto.json')));
const script = fs.readFileSync(path.join(root, 'Integracao/BP/scripts/swbr32_tracking.js'), 'utf8');
const tracker = script.replace(/^import .*\n/gm, '').replace(/^export (?=(?:async )?function )/gm, '');

const items = Object.values(modes).map(mode => mode.id);
const trackingModes = {
    insects: {range: 640, items},
    smell: {range: 3200, items: ['nz:olho_inozuka']},
    byaku: {range: 256, items: ['nz:byakugan']},
};
const events = [];
const intervals = new Map();
const system = {currentTick: 10, runInterval: (callback, ticks) => intervals.set(ticks, callback)};
const subscribe = () => {};
const world = {afterEvents: {playerLeave: {subscribe}, playerSpawn: {subscribe}}, beforeEvents: {chatSend: {subscribe}}};
let head;
const player = {
    id: 'player', typeId: 'minecraft:player', dimension: {id: 'overworld'}, location: {x: 0, y: 64, z: 0},
    hasTag: () => false,
    getComponent: key => key === 'minecraft:health' ? {currentValue: 20} : {
        getEquipment: slot => slot === 'Head' && head ? {typeId: head} : undefined,
    },
    spawnParticle: (id, location, molang) => events.push({id, location, variables: molang.values}),
};
const target = {
    ...player, id: 'target', location: {x: 10, y: 64, z: 0},
};
const context = vm.createContext({
    world, system, console, onlinePlayers: () => [player], EquipmentSlot: {Head: 'Head'},
    clearTrackingOverlay() {}, setTrackingOverlay() {}, characterRevision: () => 1,
    TRACKING_MODES: trackingModes,
    trackingDistance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
    MolangVariableMap: class {
        constructor() { this.values = {}; }
        setFloat(key, value) { this.values[key] = value; }
    },
});
const setSession = vm.runInContext(tracker + '\n; (id, session) => sessions.set(id, session);', context);
const visuals = intervals.get(5);
assert.equal(typeof visuals, 'function');

function tick(kind, equipped, destination, visual = true) {
    head = equipped;
    setSession(player.id, {kind, target: destination, pref: {visual}});
    events.length = 0;
    system.currentTick += 5;
    visuals();
    return events;
}

for (const id of items) {
    assert.equal(tick('insects', id, undefined).length, 0, id);
    const route = tick('insects', id, target);
    assert.equal(route.length, 5, id);
    route.forEach((event, index) => {
        assert.equal(event.id, 'swbr:track_insect32');
        assert.equal(event.location.x, 2 * (index + 1));
        assert.equal(event.location.z, 0);
        assert.equal(event.variables['variable.track_w'], .03);
        assert.equal(event.variables['variable.track_b'], 1);
    });
}
assert.equal(tick('insects', null, target).length, 0, 'equipamento removido');
assert.equal(tick('insects', items[0], target, false).length, 0, 'visual desativado');
assert.equal(tick('insects', items[0], {...target, dimension: {id: 'nether'}}).length, 0, 'dimensão diferente');
assert.equal(tick('insects', items[0], {...target, location: {x: 641, y: 64, z: 0}}).length, 0, 'fora do alcance');
const scent = tick('smell', 'nz:olho_inozuka', target);
assert.equal(scent.length, 8);
assert(scent.every(event => event.id === 'swbr:track_scent32'));
assert.equal(tick('byaku', 'nz:byakugan', target).length, 0);
console.log('18 cenários de rastreio aprovados no script entregue.');
