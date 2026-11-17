#!/usr/bin/env python3
"""Generate the three Iburi smoke transformations and a version-specific overlay.

Usage: python Fontes/construir_iburi.py ORIGINAL.mcaddon
No rendering, previews, game physics or combat attributes are changed here.
"""
from pathlib import Path
import argparse,copy,hashlib,io,json,math,re,zipfile
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT=Path(__file__).resolve().parents[1]
VERSION=[18,11,68]
PERIODS={1:6.8,2:6.2,3:5.6}
TEX=512;TILE=128;PHASES=6
GEO_PATHS={1:'models/entity/nz_modo_iburi1.json',2:'models/entity/nz_modo_iburi2.json',3:'models/entity/nz_modo_iburi3l.geo.json'}
NATIVE_GEOS=['models/entity/swbr39/custom.geo.json','models/entity/swbr39/custom_b.geo.json']
SLOT_GEO='models/entity/swbr_iburi_slot.geo.json'
DRAW_GEO='models/entity/swbr_iburi_draw.geo.json'
REGISTRY='scripts/modos/rp_v17058_official_modes.js'
LEGACY_HIDE_SCRIPTS=[
 "variable.swbr_iburi_total = query.is_item_name_any('slot.armor.head',0,'nz:modo_iburi3');",
 'v.swbr_v18733_full_body = v.swbr_v18733_full_body || variable.swbr_iburi_total;',
 'v.swbr_v18733_hair = v.swbr_v18733_hair || variable.swbr_iburi_total;'
]
PLAYER_SCRIPTS=[
 "v.swbr_iburi_camera_ok = !v.swbr_view_first_person && !v.swbr39_ui && !v.swbr_view_map_face && !q.is_spectator && q.distance_from_camera > 2.8;",
 "v.swbr_iburi_fade = math.clamp((q.distance_from_camera - 2.8) / 0.2,0,1);",
 "v.swbr_iburi_stage = q.is_item_name_any('slot.armor.head',0,'nz:modo_iburi3') ? 3 : (q.is_item_name_any('slot.armor.head',0,'nz:modo_iburi2') ? 2 : (q.is_item_name_any('slot.armor.head',0,'nz:modo_iburi1') ? 1 : 0));",
 *[f'v.swbr_iburi_draw{i} = v.swbr_iburi_camera_ok && v.swbr_iburi_stage == {i};' for i in [1,2,3]]
]

def read_base(base):
    """Find the original SWBR packs by UUID, including the existing Iburi build."""
    result={};uuids={'82dafe0d-c36f-4665-9df0-371f6d8b2a55':'BP','ef513a51-2cb2-4cc5-b300-5ef44201c3f5':'RP'}
    with zipfile.ZipFile(base) as outer:
        for name in outer.namelist():
            if not name.endswith('.mcpack'):continue
            with zipfile.ZipFile(io.BytesIO(outer.read(name))) as inner:
                manifest=json.loads(inner.read('manifest.json'));pack=uuids.get(manifest['header']['uuid'])
                if pack:
                    assert pack not in result
                    result[pack]=(name,{n:inner.read(n) for n in inner.namelist() if not n.endswith('/')})
    assert set(result)=={'BP','RP'}
    return result

def dump(data):return (json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode()
def png_bytes(image):
    out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()
def put(pack,path,data):
    p=ROOT/'Integracao'/pack/path;p.parent.mkdir(parents=True,exist_ok=True)
    p.write_bytes(data if isinstance(data,bytes) else dump(data))

def cloud_tile(seed,stage):
    rng=np.random.default_rng(seed);y,x=np.mgrid[-1:1:complex(TILE),-1:1:complex(TILE)]
    body=np.zeros_like(x)
    for i in range(12):
        cx,cy=rng.normal(0,.24,2);sx,sy=rng.uniform(.19,.40,2)
        if i==0:cx=cy=0;sx=.38;sy=.34
        body=np.maximum(body,rng.uniform(.72,1.05)*np.exp(-.5*((x-cx)**2/sx**2+(y-cy)**2/sy**2)))
    noise=np.zeros_like(x)
    for sigma,weight in [(2.5,.18),(6,.40),(14,.42)]:
        layer=gaussian_filter(rng.normal(size=x.shape),sigma)
        layer/=max(float(layer.std()),1e-8);noise+=layer*weight
    value=np.clip((body-.075)/.78,0,1)
    feather=np.clip((1-np.maximum(abs(x),abs(y)))/.16,0,1)
    opacity={1:.76,2:.82,3:.88}[stage]
    alpha=np.clip((value**.62)*(1+noise*.06)*feather*opacity,0,opacity)
    alpha[alpha<.012]=0
    grey=np.clip(198-{1:74,2:88,3:96}[stage]*value+noise*6,92,202)
    rgba=np.dstack([grey,grey,grey,alpha*255]).astype(np.uint8)
    rgba[:3,:,3]=0;rgba[-3:,:,3]=0;rgba[:,:3,3]=0;rgba[:,-3:,3]=0
    return Image.fromarray(rgba,'RGBA')

def atlas(stage):
    im=Image.new('RGBA',(TEX,TEX))
    for i in range(16):im.paste(cloud_tile(45000+stage*200+i,stage),((i%4)*TILE,(i//4)*TILE))
    return im

def placements(stage):
    result=[]
    def add(parent,pos,size,kind):result.append((parent,pos,size,kind))
    for side in [-1,1]:
        arm='rightArm' if side<0 else 'leftArm'
        leg='rightLeg' if side<0 else 'leftLeg'
        # Surface clouds: front z<-2, back z>2, outer arm x>8.
        # The previous centers sat inside opaque arms/torso and disappeared.
        add(arm,[side*5.8,23.2,-2.6],[4.0,3.9],'ombro')
        add(arm,[side*8.0,17.8,-1.7],[3.8,3.4],'antebraco')
        add(arm,[side*5.8,15.0,-2.8],[3.3,3.5],'antebraco')
        add('body',[side*2.4,21.7,3.7],[3.6,3.6],'escapula')
        add('body',[side*4.3,22.4,3.2],[3.6,3.4],'ombro')
        add('body',[side*4.6,18.8,-1.8],[3.0,4.1],'flanco')
        if stage>=2:
            add(arm,[side*8.2,21.0,1.4],[4.9,4.5],'braco')
            add(arm,[side*6.2,17.0,2.9],[4.6,4.7],'braco')
            add(arm,[side*6.2,13.3,-2.6],[4.4,4.3],'mao')
            add('body',[side*2.8,20.3,-3.3],[4.0,4.7],'peito')
            add('body',[side*4.9,15.3,.4],[3.8,4.8],'flanco')
            add(leg,[side*2.0,9.3,-2.8],[4.3,4.3],'perna')
            add(leg,[side*2.6,4.4,2.6],[4.0,3.9],'perna')
            add(leg,[side*3.1,3.2,-2.1],[3.7,3.6],'perna')
        if stage==3:
            add(arm,[side*5.7,20.3,-3.3],[5.4,5.7],'braco')
            for yy in [21.5,17.6,13.6]:add('body',[side*2.0,yy,-3.4],[5.3,5.4],'nucleo')
            for yy in [20.2,15.3]:add('body',[side*2.0,yy,3.7],[5.3,5.7],'nucleo')
            for yy in [8.2,3.8]:add(leg,[side*2.2,yy,-3.0],[5.0,5.0],'perna')
            add('head',[side*4.9,28.5,0],[4.7,6.0,8.0],'cabeca')
    add('body',[0,22.0,3.7],[3.6,3.5],'costas')
    if stage==3:
        add('head',[0,28.4,-4.9],[8.2,7.5,3.5],'cabeca')
        add('head',[0,28.5,4.9],[8.2,7.5,3.5],'cabeca')
        add('head',[0,32.2,0],[8.4,3.8,7.5],'cabeca')
    return result

def cycle(stage,phase):return f'math.mod(query.life_time / {PERIODS[stage]} + {phase/PHASES:.6f}, 1.0)'
def alpha_expr(stage,phase):
    c=cycle(stage,phase)
    return f'math.min(math.clamp(({c}) / 0.17,0,1),math.clamp((1-({c})) / 0.43,0,1))'

def make_geometry(stage):
    rng=np.random.default_rng(8810+stage)
    # Match SWBR's geometry.swbr39.custom skeleton, including independent legs.
    bones=[{'name':'root','pivot':[0,0,0]},{'name':'waist','parent':'root','pivot':[0,12,0]},
      {'name':'body','parent':'waist','pivot':[0,24,0],'locators':{'iburi_torso':[0,19.5,-3.4],'iburi_costas':[0,22,3.7]}},
      {'name':'head','parent':'body','pivot':[0,24,0],'locators':{'iburi_cabeca':[0,31.6,-5.8]}},
      {'name':'rightArm','parent':'body','pivot':[-5,22,0],'locators':{'iburi_braco_d':[-8.6,17.5,2.9],'iburi_ombro_d':[-6.5,23.5,-3.4]}},
      {'name':'leftArm','parent':'body','pivot':[5,22,0],'locators':{'iburi_braco_e':[8.6,17.5,2.9],'iburi_ombro_e':[6.5,23.5,-3.4]}},
      {'name':'rightLeg','parent':'root','pivot':[-1.9,12,0],'locators':{'iburi_perna_d':[-2.6,6.4,-2.8]}},
      {'name':'leftLeg','parent':'root','pivot':[1.9,12,0],'locators':{'iburi_perna_e':[2.6,6.4,-2.8]}}]
    anim_bones={};groups=placements(stage)
    for i,(parent,pos,size,kind) in enumerate(groups):
        # A persistent six-sided volume remains visible when a wisp fades out.
        core_name=f'swbr_iburi{stage}_core_{kind}_{i:02d}'
        tile=(i*3+stage)%16;u=(tile%4)*TILE;v=(tile//4)*TILE
        w,h=size[0]*.96,size[1]*.94;d=size[2] if len(size)>2 else min(w,h)*(.92 if stage==3 else .78)
        core={'origin':[round(pos[0]-w/2,5),round(pos[1]-h/2,5),round(pos[2]-d/2,5)],
          'size':[round(w,5),round(h,5),round(d,5)],'pivot':pos,
          'rotation':[round(float(rng.uniform(-14,14)),3),round(float(rng.uniform(-28,28)),3),round(float(rng.uniform(-15,15)),3)],
          'uv':{face:{'uv':[u,v],'uv_size':[TILE,TILE]} for face in ['north','south','east','west','up','down']}}
        bones.append({'name':core_name,'parent':parent,'pivot':pos,'cubes':[core]})
        angle=float(rng.uniform(0,360))
        anim_bones[core_name]={
          'position':[f'0.16*math.sin(query.life_time*24+{angle:.3f})',f'0.23*math.sin(query.life_time*31+{angle:.3f})',f'0.15*math.cos(query.life_time*27+{angle:.3f})'],
          'scale':[f'1.0+0.045*math.sin(query.life_time*37+{angle:.3f})',f'1.0+0.055*math.cos(query.life_time*29+{angle:.3f})',f'1.0+0.045*math.sin(query.life_time*33+{angle:.3f})'],
          'rotation':[f'2*math.sin(query.life_time*19+{angle:.3f})',f'4*math.sin(query.life_time*23+{angle:.3f})',f'3*math.cos(query.life_time*26+{angle:.3f})']}
        phase=i%PHASES;name=f'swbr_iburi{stage}_p{phase}_{kind}_{i:02d}'
        cubes=[]
        for layer in range(2):
            tile=(i*5+layer*7+stage)%16;u=(tile%4)*TILE;v=(tile//4)*TILE
            w=size[0]*float(rng.uniform(.86,1.10));h=size[1]*float(rng.uniform(.88,1.12))
            z=pos[2]+(layer-.5)*.44;center=[pos[0]+float(rng.uniform(-.25,.25)),pos[1]+float(rng.uniform(-.3,.3)),z]
            uv={'north':{'uv':[u,v],'uv_size':[TILE,TILE]},'south':{'uv':[u+TILE,v],'uv_size':[-TILE,TILE]}}
            for f in ['east','west','up','down']:uv[f]={'uv':[u,v],'uv_size':[1,1]}
            cubes.append({'origin':[round(center[0]-w/2,5),round(center[1]-h/2,5),round(z-.0125,5)],'size':[round(w,5),round(h,5),.025],
              'pivot':[round(a,5) for a in center],'rotation':[round(float(rng.uniform(-16,16)),3),round(layer*90+float(rng.uniform(-12,12)),3),round(float(rng.uniform(-13,13)),3)],'uv':uv})
        bones.append({'name':name,'parent':parent,'pivot':pos,'cubes':cubes})
        c=cycle(stage,phase);angle=float(rng.uniform(0,360));speed=float(rng.uniform(22,39));lift={1:2.4,2:3.0,3:2.8}[stage]
        anim_bones[name]={
          'position':[f'0.35*math.sin(query.life_time*{speed:.3f}+{angle:.3f})',f'{lift}*(({c})-0.18)',f'0.28*math.cos(query.life_time*{speed*.8:.3f}+{angle:.3f})'],
          'scale':[f'0.79+0.40*({c})',f'0.82+0.44*({c})',f'0.80+0.34*({c})'],
          'rotation':[f'3*math.sin(query.life_time*{speed*.7:.3f}+{angle:.3f})',f'6*math.sin(query.life_time*{speed*.6:.3f}+{angle:.3f})',f'4*math.cos(query.life_time*{speed*.9:.3f}+{angle:.3f})']}
    description={'identifier':f'geometry.nz_modo_iburi{stage}','texture_width':TEX,'texture_height':TEX,'visible_bounds_width':4,'visible_bounds_height':4.5,'visible_bounds_offset':[0,1,0]}
    geometry={'format_version':'1.16.0','minecraft:geometry':[{'description':description,'bones':bones}]}
    anim={'format_version':'1.8.0','animations':{f'animation.nz_modo_iburi{stage}.idle':{'loop':True,'animation_length':PERIODS[stage],'bones':anim_bones}}}
    return geometry,anim,{'nuvens':len(groups),'volumes_persistentes':len(groups),'laminas_difusas':len(groups)*2,'cubos':len(groups)*3,'passes':PHASES+1,'duracao_ciclo':PERIODS[stage]}

def particle_locators(stage):
    locators=['iburi_ombro_d','iburi_braco_e','iburi_costas','iburi_ombro_e','iburi_braco_d','iburi_torso']
    if stage>=2:locators+=['iburi_perna_d','iburi_perna_e']
    if stage==3:locators+=['iburi_cabeca']
    return locators

def make_controller():
    # Runs on the player, whose first-person/UI flags SWBR already maintains.
    states={'default':{'transitions':[{f'fumaca{i}':f'v.swbr_iburi_draw{i}'} for i in [1,2,3]]}}
    for stage in [1,2,3]:
        states[f'fumaca{stage}']={'particle_effects':[{'effect':f'swbr_iburi{stage}_fumaca','locator':'swbr_'+loc} for loc in particle_locators(stage)],
          'transitions':[{'default':f'!v.swbr_iburi_draw{stage}'}]}
    return {'initial_state':'default','states':states}

def draw_geometry(geometry,stage,label):
    """Each pass gets its own mesh; no repeated mesh with conflicting masks."""
    result=copy.deepcopy(geometry['minecraft:geometry'][0])
    result['description']['identifier']=f'geometry.swbr.iburi{stage}.{label}'
    result['bones']=[b for b in result['bones'] if not b.get('cubes') or b['name'].startswith(f'swbr_iburi{stage}_{label}_')]
    for bone in result['bones']:bone.pop('locators',None)
    return result

def render_controller(stage,phase=None):
    label='core' if phase is None else f'p{phase}'
    opacity=f'{ {1:.88,2:.92,3:.96}[stage]} * v.swbr_iburi_fade' if phase is None else f'({alpha_expr(stage,phase)}) * v.swbr_iburi_fade'
    return {'geometry':f'Geometry.swbr_iburi{stage}_{label}','materials':[{'*':'Material.swbr_iburi_smoke'}],'textures':[f'Texture.swbr_iburi{stage}'],
      'color':{'r':1,'g':1,'b':1,'a':opacity}}

def particle(stage):
    start={1:.06,2:.08,3:.10}[stage];growth={1:.09,2:.11,3:.12}[stage]
    age='math.clamp(variable.particle_age / math.max(variable.particle_lifetime,0.001),0,1)'
    return {'format_version':'1.10.0','particle_effect':{'description':{'identifier':f'swbr:iburi_transformacao_{stage}','basic_render_parameters':{'material':'particles_blend','texture':'textures/entity/swbr/iburi/particulas'}},'components':{
      'minecraft:emitter_local_space':{'position':True,'rotation':True,'velocity':False},
      'minecraft:emitter_rate_steady':{'spawn_rate':3 if stage==1 else 4,'max_particles':2 if stage==1 else 3},
      'minecraft:emitter_lifetime_looping':{'active_time':1,'sleep_time':0},
      'minecraft:emitter_shape_sphere':{'offset':[0,0,0],'radius':.055,'surface_only':False,'direction':'outwards'},
      'minecraft:particle_lifetime_expression':{'max_lifetime':f'math.random(0.30,{.30+stage*.05:.2f})'},
      'minecraft:particle_initial_speed':.04,
      'minecraft:particle_motion_dynamic':{'linear_acceleration':[.025,.22,-.016],'linear_drag_coefficient':.2},
      'minecraft:particle_initial_spin':{'rotation':'math.random(0,360)','rotation_rate':'math.random(-18,18)'},
      'minecraft:particle_appearance_billboard':{'size':[f'{start}+{growth}*({age})',f'{start}+{growth}*({age})'],'facing_camera_mode':'lookat_xyz','uv':{'texture_width':128,'texture_height':512,'flipbook':{'base_UV':[0,0],'size_UV':[128,128],'step_UV':[0,128],'frames_per_second':4,'max_frame':3,'stretch_to_lifetime':True}}},
      'minecraft:particle_appearance_tinting':{'color':[1,1,1,f'0.60*math.clamp(variable.particle_age/0.06,0,1)*math.pow(1-({age}),1.30)']},
      'minecraft:particle_appearance_lighting':{}}}}

def build(base,compatible_bases=None):
    ROOT.mkdir(exist_ok=True,parents=True);summary={}
    base_packs=read_base(base);bp=base_packs['BP'][1];rp=base_packs['RP'][1];rc={};draw_geometries=[]
    player=json.loads(rp['entity/player.entity.json']);desc=player['minecraft:client_entity']['description']
    desc['geometry']={k:v for k,v in desc['geometry'].items() if not k.startswith('swbr_iburi')}
    desc['materials']['swbr_iburi_smoke']='entity_alphablend'
    desc['animations']['swbr_iburi_fx']='controller.animation.swbr.iburi.fx'
    animate=desc['scripts']['animate']
    animate[:]=[a for a in animate if not (isinstance(a,str) and a.startswith('swbr_iburi')) and not (isinstance(a,dict) and any(k.startswith('swbr_iburi') for k in a))]
    desc['render_controllers'][:]=[r for r in desc['render_controllers'] if not any(k.startswith('controller.render.swbr.iburi') for k in ([r] if isinstance(r,str) else r))]
    for stage in [1,2,3]:
        geo,anim,stats=make_geometry(stage);summary[str(stage)]=stats
        put('RP',GEO_PATHS[stage],geo)
        put('RP',f'animations/nz_modo_iburi{stage}.idle.json',anim)
        tex=f'textures/entity/swbr/iburi/fumaca{stage}'
        put('RP',tex+'.png',png_bytes(atlas(stage)))
        controllers=[f'controller.render.swbr.iburi{stage}.core']+[f'controller.render.swbr.iburi{stage}.p{p}' for p in range(PHASES)]
        for label in ['core']+[f'p{p}' for p in range(PHASES)]:
            part=draw_geometry(geo,stage,label);draw_geometries.append(part)
            desc['geometry'][f'swbr_iburi{stage}_{label}']=part['description']['identifier']
        desc['textures'][f'swbr_iburi{stage}']=tex
        desc['animations'][f'swbr_iburi{stage}_idle']=f'animation.nz_modo_iburi{stage}.idle'
        desc.setdefault('particle_effects',{})[f'swbr_iburi{stage}_fumaca']=f'swbr:iburi_transformacao_{stage}'
        animate.append({f'swbr_iburi{stage}_idle':f'v.swbr_iburi_draw{stage}'})
        desc['render_controllers'].extend({controller:f'v.swbr_iburi_draw{stage}'} for controller in controllers)
        # The wearable is still the existing head-slot item. It no longer
        # carries a body-sized mesh or emits particles from an item context.
        put('RP',f'attachables/nz_modo_iburi{stage}.json',{'format_version':'1.10.0','minecraft:attachable':{'description':{
          'identifier':f'nz:modo_iburi{stage}','materials':{'default':'entity_alphablend'},'textures':{'default':tex},
          'geometry':{'default':'geometry.swbr.iburi.slot'},'render_controllers':['controller.render.swbr.iburi.slot']}}})
        put('RP',f'particles/swbr_iburi_transformacao_{stage}.json',particle(stage))
        rc[controllers[0]]=render_controller(stage)
        for phase in range(PHASES):
            rc[f'controller.render.swbr.iburi{stage}.p{phase}']=render_controller(stage,phase)
    animate.append('swbr_iburi_fx')
    rc['controller.render.swbr.iburi.slot']={'geometry':'Geometry.default','materials':[{'*':'Material.default'}],'textures':['Texture.default']}
    put('RP',SLOT_GEO,{'format_version':'1.16.0','minecraft:geometry':[{'description':{'identifier':'geometry.swbr.iburi.slot','texture_width':TEX,'texture_height':TEX},'bones':[{'name':'root','pivot':[0,0,0]}]}]})
    put('RP',DRAW_GEO,{'format_version':'1.16.0','minecraft:geometry':draw_geometries})
    put('RP','render_controllers/swbr_iburi_transformacoes.json',{'format_version':'1.8.0','render_controllers':rc})
    put('RP','animation_controllers/swbr_iburi_fumaca.json',{'format_version':'1.10.0','animation_controllers':{'controller.animation.swbr.iburi.fx':make_controller()}})
    # Dedicated locators on the normal player rig make particle attachment
    # independent of which extra smoke geometry is being rendered.
    locator_rig=make_geometry(3)[0]['minecraft:geometry'][0]['bones']
    for path in NATIVE_GEOS:
        data=json.loads(rp[path])
        native={b['name']:b for b in data['minecraft:geometry'][0]['bones']}
        for bone in locator_rig:
            if not bone.get('locators'):continue
            target=native[bone['name']].setdefault('locators',{})
            for name,position in bone['locators'].items():target['swbr_'+name]=position
        put('RP',path,data)
    sheet=Image.new('RGBA',(128,512))
    for i in range(4):sheet.paste(cloud_tile(99001+i,2),(0,128*i))
    put('RP','textures/entity/swbr/iburi/particulas.png',png_bytes(sheet))
    scripts=desc['scripts']['pre_animation']
    assert any('v.swbr_v18733_full_body =' in s for s in scripts)
    # Roll back only the three Iburi-only hide hooks introduced in 18.11.65.
    scripts[:]=[s for s in scripts if s not in LEGACY_HIDE_SCRIPTS and not s.startswith('v.swbr_iburi_')]
    assert not any('swbr_iburi_total' in s for s in scripts)
    scripts.extend(PLAYER_SCRIPTS)
    put('RP','entity/player.entity.json',player)
    registry=bp[REGISTRY].decode()
    labels={1:'Iburi — Fumaça I',2:'Iburi — Fumaça II',3:'Iburi — Fumaça Total'}
    for stage,name in labels.items():
        pattern=r'(id: "nz:modo_iburi'+str(stage)+r'",[\s\S]*?nome: )"[^"\n]+"'
        registry,count=re.subn(pattern,lambda m:m.group(1)+json.dumps(name,ensure_ascii=False),registry,count=1);assert count==1
    put('BP',REGISTRY,registry.encode())
    for path,content in rp.items():
        if not path.startswith('texts/') or not path.endswith('.lang') or b'item.nz:modo_iburi' not in content:continue
        if Path(path).stem in ['en_US','us_EN']:names={1:'Iburi — Smoke I',2:'Iburi — Smoke II',3:'Iburi — Total Smoke'}
        elif Path(path).stem.startswith('es_'):names={1:'Iburi — Humo I',2:'Iburi — Humo II',3:'Iburi — Humo Total'}
        else:names=labels
        text=content.decode('utf-8')
        text,count=re.subn(r'(?m)^(item\.nz:modo_iburi([123])(?:\.name)?=)[^\r\n]*',lambda m:m.group(1)+names[int(m.group(2))],text)
        assert count==6
        put('RP',path,text.encode('utf-8'))
    for pack,data in [('BP',bp),('RP',rp)]:
        m=json.loads(data['manifest.json']);m['header']['version']=VERSION
        m['header']['name']=re.sub(r'18\.11\.\d+','18.11.68',m['header']['name']).split(' · Iburi')[0]+' · Iburi'
        m['header']['description']='Shinobi World BR 18.11.68 | Iburi: nuvens externas à pele, estágios distintos e malhas independentes por camada'
        for module in m['modules']:module['version']=VERSION
        for dep in m.get('dependencies',[]):
            if dep.get('uuid') in ['82dafe0d-c36f-4665-9df0-371f6d8b2a55','ef513a51-2cb2-4cc5-b300-5ef44201c3f5']:dep['version']=VERSION
        put(pack,'manifest.json',m)
    entries={}
    for pack in ['BP','RP']:
        files={}
        for p in (ROOT/'Integracao'/pack).rglob('*'):
            if p.is_file():files[p.relative_to(ROOT/'Integracao'/pack).as_posix()]=hashlib.sha256(p.read_bytes()).hexdigest()
        entries[pack]={'original_entry':base_packs[pack][0],'updated_entry':f'SWBR_{pack}_v18.11.68_IBURI.mcpack','files':files}
    base_version=json.loads(bp['manifest.json'])['header']['version']
    compatible=[]
    for compatible_base in compatible_bases or []:
        extra=read_base(compatible_base)
        compatible.append({'base_filename':compatible_base.name,'base_sha256':hashlib.sha256(compatible_base.read_bytes()).hexdigest(),
          'base_version':json.loads(extra['BP'][1]['manifest.json'])['header']['version'],'pack_entries':{p:extra[p][0] for p in extra}})
    manifest={'clan':'Iburi','base_filename':base.name,'base_sha256':hashlib.sha256(base.read_bytes()).hexdigest(),'base_version':base_version,'compatible_bases':compatible,'version':VERSION,'packs':entries,'removed_files':[],
      'protected_items':['nz:modo_iburi1','nz:modo_iburi2','nz:modo_iburi3','nz:jutsu_iburi_fumaca'],'levels':[10,15,25],'models':summary}
    (ROOT/'Integracao_Manifesto.json').write_bytes(dump(manifest))
    print(json.dumps({'modified_files':{k:len(v['files']) for k,v in entries.items()},'models':summary},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('base',type=Path);parser.add_argument('--compatible-base',type=Path,action='append');args=parser.parse_args();build(args.base,args.compatible_base)
