"""Replace the idle tracking particles with subtle markers on a valid route."""

TRACK_SCRIPT = 'scripts/swbr32_tracking.js'
TRACK_PARTICLE = 'particles/swbr32_track_insect.json'
TRACK_TEXTURE = 'textures/particle/swbr32/insect.png'

OLD_MARKERS = """   const eye=p.getHeadLocation(),view=p.getViewDirection();
   const d=hasTarget?trackingDistance(p.location,t.location):0;
   if(system.currentTick-(s.lastTrailTick??-100)<5)continue;
   s.lastTrailTick=system.currentTick;
   const dx=hasTarget?(t.location.x-p.location.x)/Math.max(.01,d):view.x,dz=hasTarget?(t.location.z-p.location.z)/Math.max(.01,d):view.z;
   if(s.kind==='insects')for(let i=0;i<5;i++){
    const a=system.currentTick*.12+i*Math.PI*.4,r=.7+i*.19;
    particle(p,'swbr:track_insect32',{x:p.location.x+dx*(1+i*.4)+Math.cos(a)*r,y:eye.y-.15+Math.sin(a*1.3)*.24,z:p.location.z+dz*(1+i*.4)+Math.sin(a)*r},[.11,.075],[.7,.85,1,1],budget);
   }
   if(hasTarget&&s.kind!=='byaku')for(let i=1;i<=8;i++){
    const step=Math.min(d,18)*i/8;
    const at={x:p.location.x+dx*step,y:p.location.y+.4+Math.sin(system.currentTick*.08+i)*.12,z:p.location.z+dz*step};
    particle(p,s.kind==='smell'?'swbr:track_scent32':'swbr:track_dot32',at,s.kind==='smell'?[.17,.17]:[.025,.025],s.kind==='smell'?[.9,.8,.85,.45]:[.35,.7,1,.8],budget);
   }"""

NEW_MARKERS = """   if (!hasTarget || !availableTracking(p).includes(s.kind)) continue;
   const d = trackingDistance(p.location, t.location);
   if (d <= .01 || d > TRACKING_MODES[s.kind].range || system.currentTick - (s.lastTrailTick ?? -100) < 5) continue;
   s.lastTrailTick = system.currentTick;
   const dx = (t.location.x - p.location.x) / d;
   const dz = (t.location.z - p.location.z) / d;
   if (s.kind === 'insects') {
    const reach = Math.min(d, 18);
    for (let i = 1; i <= 5; i++) {
     const step = reach * i / 5;
     const at = {
      x: p.location.x + dx * step,
      y: p.location.y + (t.location.y - p.location.y) * (step / d) + .74 + Math.sin(system.currentTick * .08 + i) * .09,
      z: p.location.z + dz * step
     };
     particle(p, 'swbr:track_insect32', at, [.03, .038], [1, 1, 1, .86], budget);
    }
   } else {
    for (let i = 1; i <= 8; i++) {
     const step = Math.min(d, 18) * i / 8;
     const at = {
      x: p.location.x + dx * step,
      y: p.location.y + .4 + Math.sin(system.currentTick * .08 + i) * .12,
      z: p.location.z + dz * step
     };
     particle(p, 'swbr:track_scent32', at, [.17, .17], [.9, .8, .85, .45], budget);
    }
   }"""


def patch_tracking(source):
    source = source.decode('utf-8')
    if source.count(OLD_MARKERS) != 1:
        raise ValueError('O bloco original de partículas de rastreio não corresponde à base.')
    # Keep targeting, settings, overlays and HUD in the original script.
    return source.replace(OLD_MARKERS, NEW_MARKERS).encode('utf-8')


def patch_tracking_particle(data):
    components = data['particle_effect']['components']
    components['minecraft:particle_lifetime_expression']['max_lifetime'] = .23
    components['minecraft:particle_appearance_billboard']['size'] = [
        'math.clamp(v.track_w ?? 0.03,0,0.034) * (0.93+0.07*math.sin(v.particle_age*3600))',
        'math.clamp(v.track_h ?? 0.038,0,0.042)',
    ]
    components['minecraft:particle_appearance_tinting']['color'] = [1, 1, 1, 'math.clamp(v.track_a ?? 0.86,0,0.90)']
    return data
