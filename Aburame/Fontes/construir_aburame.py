#!/usr/bin/env python3
"""Build six Aburame visual replacements over the approved SWBR 18.11.68."""
from pathlib import Path
import argparse,copy,hashlib,io,json,math,re,zipfile
import numpy as np
from PIL import Image,ImageDraw
from scipy.ndimage import gaussian_filter

ROOT=Path(__file__).resolve().parents[1]
VERSION=[18,11,70];TEX=512;TILE=128
MODES={
 1:dict(id='nz:insetos_aburame_m',level=10,kind='comum',tier=1,name='Aburame_01_Insetos',path='models/entity/nz_insetos_aburame_m.json',gid='geometry.nz_insetos_aburame_m'),
 2:dict(id='nz:insetos_aburame_m2',level=10,kind='venenoso',tier=1,name='Aburame_02_Venenosos',path='models/entity/nz_insetos_aburame_m2.json',gid='geometry.nz_insetos_aburame_m2'),
 3:dict(id='nz:insetos_aburame_half',level=20,kind='comum',tier=2,name='Aburame_03_Imbuidos',path='models/entity/nz_insetos_aburame_half.geo.json',gid='geometry.nz_insetos_aburame_half'),
 4:dict(id='nz:insetos_aburame_half_poison',level=30,kind='venenoso',tier=2,name='Aburame_04_Venenosos_Imbuidos',path='models/entity/nz_insetos_aburame_half_poison.geo.json',gid='geometry.nz_insetos_aburame_half_poison'),
 5:dict(id='nz:insetos_aburame_full',level=40,kind='comum',tier=3,name='Aburame_05_Totalmente_Imbuido',path='models/entity/nz_insetos_aburame_full.geo.json',gid='geometry.nz_insetos_aburame_full'),
 6:dict(id='nz:insetos_aburame_full_poison',level=50,kind='venenoso',tier=3,name='Aburame_06_Venenoso_Totalmente_Imbuido',path='models/entity/nz_insetos_aburame_full_poison.geo.json',gid='geometry.nz_insetos_aburame_full_poison')}
NATIVE_GEOS=['models/entity/swbr39/custom.geo.json','models/entity/swbr39/custom_b.geo.json']
DRAW_GEO='models/entity/swbr_aburame_draw.geo.json'
SLOT_GEO='models/entity/swbr_aburame_slot.geo.json'
RC_FILE='render_controllers/swbr_aburame.json'
FX_FILE='animation_controllers/swbr_aburame.json'
PLAYER_FILE='entity/player.entity.json'
PERIODS={1:7.2,2:8.4,3:6.8,4:7.8,5:6.2,6:7.2}

def dump(data):return (json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode()
def sha(data):return hashlib.sha256(data).hexdigest()
def png(image):
    stream=io.BytesIO();image.save(stream,format='PNG');return stream.getvalue()
def put(pack,path,data):
    target=ROOT/'Integracao'/pack/path;target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data if isinstance(data,bytes) else dump(data))
def read_base(path):
    uuids={'82dafe0d-c36f-4665-9df0-371f6d8b2a55':'BP','ef513a51-2cb2-4cc5-b300-5ef44201c3f5':'RP'};result={}
    with zipfile.ZipFile(path) as outer:
        for name in outer.namelist():
            if not name.endswith('.mcpack'):continue
            with zipfile.ZipFile(io.BytesIO(outer.read(name))) as inner:
                manifest=json.loads(inner.read('manifest.json'));key=uuids.get(manifest['header']['uuid'])
                if key:result[key]=(name,{n:inner.read(n) for n in inner.namelist() if not n.endswith('/')})
    assert set(result)=={'BP','RP'}
    return result
def body_rig():
    return [dict(name='root',pivot=[0,0,0]),dict(name='waist',parent='root',pivot=[0,12,0]),
      dict(name='body',parent='waist',pivot=[0,24,0]),dict(name='head',parent='body',pivot=[0,24,0]),
      dict(name='rightArm',parent='body',pivot=[-5,22,0]),dict(name='leftArm',parent='body',pivot=[5,22,0]),
      dict(name='rightLeg',parent='root',pivot=[-1.9,12,0]),dict(name='leftLeg',parent='root',pivot=[1.9,12,0])]
LOCATORS={
 'body':{'swbr_aburame_peito':[0,19,-3.1],'swbr_aburame_costas':[0,21,3.1]},
 'rightArm':{'swbr_aburame_mao_d':[-6.2,13.2,-3.1],'swbr_aburame_antebraco_d':[-8.9,17.5,2.9],'swbr_aburame_ombro_d':[-6.3,23.3,-3.1]},
 'leftArm':{'swbr_aburame_mao_e':[6.2,13.2,-3.1],'swbr_aburame_antebraco_e':[8.9,17.5,2.9],'swbr_aburame_ombro_e':[6.3,23.3,-3.1]},
 'rightLeg':{'swbr_aburame_perna_d':[-2.4,6,-3.1]},'leftLeg':{'swbr_aburame_perna_e':[2.4,6,-3.1]},
 'head':{'swbr_aburame_cabeca':[0,29,-5.3]}}

def insect_stamp(width=11,height=15,color=(16,19,24,255)):
    im=Image.new('RGBA',(width,height));d=ImageDraw.Draw(im);cx=width/2;cy=height*.54
    d.ellipse([cx-width*.22,cy-height*.22,cx+width*.22,cy+height*.25],fill=color)
    d.ellipse([cx-width*.15,cy-height*.37,cx+width*.15,cy-height*.18],fill=color)
    for side in [-1,1]:
        for index in range(3):
            yy=cy+height*(index-1)*.13
            d.line([(cx+side*width*.12,yy),(cx+side*width*.38,yy+height*(index-1)*.12)],fill=color,width=1)
        d.line([(cx+side*width*.07,cy-height*.31),(cx+side*width*.24,cy-height*.47)],fill=color,width=1)
    d.line([(cx,cy-height*.14),(cx,cy+height*.18)],fill=(42,46,53,color[3]),width=1)
    return im

def swarm_tile(seed,tier,poison=False):
    rng=np.random.default_rng(seed);im=Image.new('RGBA',(TILE,TILE))
    count=({1:32,2:62,3:128} if not poison else {1:90,2:150,3:210})[tier]
    for i in range(count):
        # Empty gaps between actual organisms, never a filled smoke background.
        x,y=rng.normal(64,[23,26]);x=int(x);y=int(y)
        if not 9<=x<=118 or not 9<=y<=118:continue
        if poison:
            d=ImageDraw.Draw(im);rad=int(rng.choice([0,1,1]));value=int(rng.integers(24,64))
            d.ellipse((x-rad,y-rad,x+rad,y+rad),fill=(value,int(value*.55),int(value*1.30),int(rng.integers(180,246))))
        else:
            width=int(rng.integers(4,8));height=int(rng.integers(6,10));v=int(rng.integers(10,30))
            bug=insect_stamp(width,height,(v,v+2,v+5,255)).rotate(float(rng.uniform(0,360)),expand=True,resample=Image.Resampling.NEAREST)
            im.alpha_composite(bug,(x-bug.width//2,y-bug.height//2))
    a=np.array(im);a[:4,:,3]=0;a[-4:,:,3]=0;a[:,:4,3]=0;a[:,-4:,3]=0
    return Image.fromarray(a,'RGBA')

def poison_tile(seed,tier,index):
    rng=np.random.default_rng(seed);y,x=np.mgrid[0:TILE,0:TILE];v=y/(TILE-1)
    broad=gaussian_filter(rng.random((TILE,TILE)),8,mode='wrap');broad=(broad-broad.min())/(broad.max()-broad.min())
    fine=gaussian_filter(rng.random((TILE,TILE)),.55,mode='wrap')
    if tier==1:
        strength=np.clip((v-.06-broad*.20)/.28,0,1) if index<4 else np.ones_like(v)*.92
    elif tier==2:
        strength=np.clip((v-.02-broad*.15)/.22,0,1) if index<4 else np.clip((1-v)*.95+.10-broad*.30,0,1)
    else:strength=np.ones_like(v)*.98
    if index==7:strength=np.ones_like(v)*.97
    # Microscopic colonies read as a textured violet skin coating, not plates.
    grain=np.clip((fine-.30)/.4,0,1);holes=(rng.random((TILE,TILE))>.035).astype(float)
    alpha=np.clip(strength*(.78+.21*grain)*holes,0,1)
    red=42+grain*43+broad*8;green=25+grain*28;blue=61+grain*54+broad*7
    return Image.fromarray(np.dstack([red,green,blue,alpha*255]).astype(np.uint8),'RGBA')

def atlas(mode):
    spec=MODES[mode];tier=spec['tier'];im=Image.new('RGBA',(TEX,TEX))
    if spec['kind']=='comum':
        for i in range(1,16):im.paste(swarm_tile(78000+mode*100+i,tier),((i%4)*TILE,(i//4)*TILE))
        d=ImageDraw.Draw(im)
        for i,color in enumerate([(14,17,22,255),(19,22,28,255),(28,32,40,255),(34,38,46,255)]):
            u=i*32;d.ellipse((u+2,2,u+29,30),fill=color)
            d.arc((u+4,4,u+27,29),205,325,fill=(65,70,78,255),width=1)
            if i>=2:d.line((u+15,5,u+15,28),fill=(9,11,14,255),width=1)
        im.alpha_composite(insect_stamp(64,80,(11,13,17,255)),(0,36))
    else:
        for i in range(16):
            tile=poison_tile(91000+mode*100+i,tier,i) if i<8 else swarm_tile(92000+mode*100+i,tier,True)
            im.paste(tile,((i%4)*TILE,(i//4)*TILE))
    return im

def uv_rect(rect,all_faces=True):
    u,v,w,h=rect
    result={face:{'uv':[u,v],'uv_size':[w,h]} for face in ['north','south']}
    if all_faces:
        for face in ['east','west','up','down']:result[face]={'uv':[u,v],'uv_size':[w,h]}
    else:
        for face in ['east','west','up','down']:result[face]={'uv':[511,511],'uv_size':[1,1]}
    return result
def tile_rect(tile):return [(tile%4)*TILE+3,(tile//4)*TILE+3,TILE-6,TILE-6]
def cube(center,size,rect,rotation=None,pivot=None,all_faces=True):
    result={'origin':[round(center[i]-size[i]/2,6) for i in range(3)],'size':[round(v,6) for v in size],'uv':uv_rect(rect,all_faces)}
    if rotation is not None:result.update(rotation=rotation,pivot=pivot or center)
    return result
def euler_face(normal):
    if normal==[0,0,-1]:return [0,0,0]
    if normal==[0,0,1]:return [0,180,0]
    if normal==[-1,0,0]:return [0,90,0]
    if normal==[1,0,0]:return [0,-90,0]
    if normal==[0,1,0]:return [90,0,0]
    raise ValueError(normal)
def bug_sites(tier):
    result=[]
    for side in [-1,1]:
        arm='rightArm' if side<0 else 'leftArm'
        result += [(arm,[side*6.1,14.0,-2.43],[0,0,-1]),(arm,[side*6.6,17.2,-2.43],[0,0,-1]),
          (arm,[side*6.1,20.5,2.42],[0,0,1]),(arm,[side*8.37,16.0,0],[side,0,0]),
          (arm,[side*6.0,24.38,.3],[0,1,0]),('body',[side*2.4,22.0,2.42],[0,0,1])]
    if tier==1:
        # The first in-game recording read as scattered dust. Anchor extra
        # small beetles to front/back forearms, rather than enlarging the halo.
        for side in [-1,1]:
            arm='rightArm' if side<0 else 'leftArm'
            result += [(arm,[side*5.3,15.5,-2.46],[0,0,-1]),(arm,[side*6.7,14.7,2.46],[0,0,1])]
    if tier>=2:
        for side in [-1,1]:
            arm='rightArm' if side<0 else 'leftArm'
            result += [(arm,[side*6.2,22.2,-2.43],[0,0,-1]),(arm,[side*8.37,19.5,.6],[side,0,0]),
              ('body',[side*4.42,18.4,0],[side,0,0]),('body',[side*3.0,20.5,-2.45],[0,0,-1])]
    if tier==3:
        for side in [-1,1]:
            leg='rightLeg' if side<0 else 'leftLeg';arm='rightArm' if side<0 else 'leftArm'
            result += [('body',[side*2.5,16.0,-2.45],[0,0,-1]),('body',[side*1.8,17.8,2.43],[0,0,1]),
              (leg,[side*2,8.0,-2.4],[0,0,-1]),(leg,[side*2.1,3.7,2.4],[0,0,1]),(arm,[side*8.37,21.3,-.7],[side,0,0])]
    return result
def swarm_sites(tier):
    result=[]
    for side in [-1,1]:
        arm='rightArm' if side<0 else 'leftArm'
        result += [(arm,[side*8.8,14.2,-3.5],[2.2,2.5]),(arm,[side*9.4,19.6,2.5],[2.5,2.9])]
    if tier==1:
        for side in [-1,1]:
            # Compact, porous sleeve-to-forearm colonies; head/torso stay free.
            result.append(('rightArm' if side<0 else 'leftArm',[side*6.0,15.3,-2.8],[3.2,4.1]))
    if tier>=2:
        for side in [-1,1]:
            result += [('body',[side*8.6,23.4,.6],[3.4,3.5]),('body',[side*4.7,18.6,-3.5],[3.5,4.1]),('body',[side*2.6,21,3.8],[3.2,3.4])]
    if tier==3:
        for side in [-1,1]:
            arm='rightArm' if side<0 else 'leftArm';leg='rightLeg' if side<0 else 'leftLeg'
            result += [(arm,[side*11.2,17.4,-2.6],[5.7,5.0]),('body',[side*5.2,15.4,3.8],[4.7,4.9]),
              ('body',[side*7.5,21.2,-4.0],[4.8,5.4]),(leg,[side*4.7,8.0,-2.9],[3.7,4.6]),(leg,[side*4.3,3.2,2.8],[3.4,3.8])]
    return result

def model(mode,skin_geometry):
    spec=MODES[mode];tier=spec['tier'];rng=np.random.default_rng(23000+mode)
    bones=body_rig();animations={};roles=[];counts={};prefix=f'swbr_aburame{mode}_'
    def add_bone(name,parent,pivot,cubes=None,rotation=None):
        b={'name':prefix+name,'parent':parent,'pivot':pivot}
        if cubes is not None:b['cubes']=cubes
        if rotation is not None:b['rotation']=rotation
        bones.append(b);return b['name']
    if spec['kind']=='comum':
        roles=['solid_a','solid_b','swarm_a','swarm_b'];sites=bug_sites(tier);counts['besouros_3d']=len(sites)
        for i,(parent,pos,normal) in enumerate(sites):
            role='solid_a' if i%2==0 else 'solid_b';name=f'{role}_besouro_{i:02d}'
            rotation=euler_face(normal)
            if normal[2]:rotation[2]+=round(float(rng.uniform(-150,150)),3)
            # Body, head and a cutout with six legs/antennae; small wing cases
            # remain 3D pieces and animate independently of the abdomen.
            k=float(rng.uniform(.78,1.12))*(1.10 if mode==1 else 1);pos=[round(v,4) for v in pos]
            def shape(offset,size,rect):return cube([pos[j]+offset[j]*k for j in range(3)],[v*k for v in size],rect)
            core=[shape([0,0,0],[.30,.42,.18],[0,0,32,32]),shape([0,.28,0],[.20,.18,.16],[32,0,32,32]),
              shape([0,.05,.065],[.65,.80,.008],[0,36,64,80])]
            root=add_bone(name,parent,pos,core,rotation);angle=float(rng.uniform(0,360));speed=float(rng.uniform(35,64));flying=i%3==0
            hover=f'math.pow(math.sin(q.life_time*{speed:.3f}+{angle:.3f}),2)'
            lift=.55 if flying else .035
            tangent=[0,1,0] if abs(normal[1])<.5 else [1,0,0]
            animations[root]={'position':[f'{normal[j]*lift:.5f}*({hover})+{tangent[j]*.12:.5f}*math.sin(q.life_time*{speed*.8:.3f}+{angle:.3f})' for j in range(3)],
              'rotation':[0,0,f'5*math.sin(q.life_time*{speed*.6:.3f}+{angle:.3f})'],'scale':[1,1,1]}
            for side in [-1,1]:
                p=[pos[0]+side*.075*k,pos[1]-.02*k,pos[2]-.125*k]
                wing=add_bone(name+('_elytro_d' if side<0 else '_elytro_e'),root,p,[cube(p,[.135*k,.34*k,.035*k],[64 if side<0 else 96,0,32,32])])
                animations[wing]={'rotation':[0,f'{side}*{7 if flying else 1.5}*math.sin(q.life_time*{1500 if flying else 90}+{angle:.3f})*({hover})',0],'position':[0,0,0],'scale':[1,1,1]}
        sites=swarm_sites(tier);counts['agrupamentos_vazados']=len(sites)
        for i,(parent,pos,size) in enumerate(sites):
            role='swarm_a' if i%2==0 else 'swarm_b';pos=[round(v+float(rng.uniform(-.23,.23)),4) for v in pos]
            w,h=[v*(1.25 if tier==3 else 1) for v in size];cubes=[]
            for layer in range(3):
                center=[pos[0],pos[1]+float(rng.uniform(-.3,.3)),pos[2]+(layer-1)*.55]
                cubes.append(cube(center,[w,h,.008],tile_rect(1+(i*3+layer*5)%15),[round(float(rng.uniform(-13,13)),3),round(layer*60+float(rng.uniform(-12,12)),3),round(float(rng.uniform(-20,20)),3)],center,False))
            name=add_bone(f'{role}_grupo_{i:02d}',parent,pos,cubes)
            angle=float(rng.uniform(0,360));speed=float(rng.uniform(29,61));orbit=.23 if tier==1 else (.95 if tier==2 else 1.25)
            vertical=(f'0.6+1.4*math.sin(q.life_time*{speed*.7:.3f}+{angle:.3f})' if tier>=2 and parent.endswith('Arm') else f'{orbit*.7:.4f}*math.cos(q.life_time*{speed*.83:.3f}+{angle:.3f})')
            animations[name]={'position':[f'{orbit}*math.sin(q.life_time*{speed:.3f}+{angle:.3f})',vertical,f'{orbit*.8:.4f}*math.sin(q.life_time*{speed*.71:.3f}+{angle:.3f})'],
              'rotation':[f'3*math.sin(q.life_time*17+{angle:.3f})',f'5*math.cos(q.life_time*19+{angle:.3f})',f'4*math.sin(q.life_time*23+{angle:.3f})'],
              'scale':[f'1+0.09*math.sin(q.life_time*{speed*.55:.3f}+{angle:.3f})',f'1+0.08*math.cos(q.life_time*{speed*.61:.3f}+{angle:.3f})',1]}
    else:
        roles=['coat','crawl','micro'];reference={b['name']:b for b in skin_geometry['bones']}
        parts=['rightArm','leftArm']+(['body'] if tier>=2 else [])+(['rightLeg','leftLeg','head'] if tier==3 else [])
        for i,parent in enumerate(parts):
            source=reference[parent]['cubes'][0];lo=np.array(source['origin'],dtype=float);hi=lo+np.array(source['size'])
            if tier==1:hi[1]=19.0
            lo-=.30;hi+=.30
            c={'origin':[round(v,5) for v in lo],'size':[round(v,5) for v in hi-lo], 'uv':{}}
            tile=i%4 if parent.endswith('Arm') else 4+i%3
            for face in ['north','south','east','west']:c['uv'][face]={'uv':tile_rect(tile)[:2],'uv_size':tile_rect(tile)[2:]}
            for face in ['up','down']:
                rect=tile_rect(7) if face=='down' or tier==3 else [511,511,1,1]
                c['uv'][face]={'uv':rect[:2],'uv_size':rect[2:]}
            add_bone(f'coat_{parent}',parent,list(reference[parent]['pivot']),[c])
        counts['superficies_aderidas']=len(parts)
        crawl_sites=[]
        for side in [-1,1]:
            arm='rightArm' if side<0 else 'leftArm'
            crawl_sites += [(arm,[side*6.0,14.5,-2.37],[3.7,3.8]),(arm,[side*8.28,17,0],[3.5,3.7])]
            if tier>=2:crawl_sites.append(('body',[side*3.0,21.0,-2.40],[3.5,3.8]))
            if tier==3:
                crawl_sites += [('body',[side*2.0,16.0,2.30],[3.4,4.2]),('rightLeg' if side<0 else 'leftLeg',[side*2.0,6,-2.35],[3.5,4.1]),('head',[side*2.4,28,-4.35],[3.5,4.3])]
        counts['regioes_micro_rastejantes']=len(crawl_sites)
        for i,(parent,pos,size) in enumerate(crawl_sites):
            rotation=[0,90,0] if abs(pos[0])>8 else [0,0,0]
            name=add_bone(f'crawl_pontos_{i:02d}',parent,pos,[cube(pos,[*size,.006],tile_rect(8+i%8),rotation,pos,False)])
            angle=float(rng.uniform(0,360))
            # Only a fraction of a model unit, so coating stays attached.
            animations[name]={'position':[f'0.045*math.sin(q.life_time*47+{angle:.3f})',f'0.07*math.cos(q.life_time*53+{angle:.3f})',0],
              'rotation':[0,0,f'0.8*math.sin(q.life_time*31+{angle:.3f})'],'scale':[1,1,1]}
        micro_sites=[]
        for side in [-1,1]:
            arm='rightArm' if side<0 else 'leftArm'
            micro_sites += [(arm,[side*6.2,12.8,-3.1],[1.0,1.3]),(arm,[side*8.9,15.1,2.8],[1.2,1.5])]
            if tier>=2:micro_sites += [(arm,[side*8.8,19,-2.6],[1.7,1.8]),('body',[side*4.9,20.5,2.8],[1.8,2.2])]
            if tier==3:micro_sites += [('body',[side*4.8,16.0,-3.0],[2.2,2.4]),('rightLeg' if side<0 else 'leftLeg',[side*2.5,7,-2.9],[1.7,2.0])]
        counts['micro_agrupamentos']=len(micro_sites)
        for i,(parent,pos,size) in enumerate(micro_sites):
            cubes=[cube([pos[0],pos[1],pos[2]+(j-.5)*.16],[*size,.006],tile_rect(8+(i+j*3)%8),[0,j*90,round(float(rng.uniform(-14,14)),3)],pos,False) for j in range(2)]
            name=add_bone(f'micro_grupo_{i:02d}',parent,pos,cubes);angle=float(rng.uniform(0,360));speed=float(rng.uniform(35,58))
            animations[name]={'position':[f'0.12*math.sin(q.life_time*{speed:.3f}+{angle:.3f})',f'0.16*math.cos(q.life_time*{speed*.8:.3f}+{angle:.3f})',f'0.10*math.sin(q.life_time*{speed*.7:.3f}+{angle:.3f})'],
              'rotation':[0,f'2*math.sin(q.life_time*29+{angle:.3f})',0], 'scale':[f'1+0.05*math.sin(q.life_time*37+{angle:.3f})',f'1+0.04*math.cos(q.life_time*41+{angle:.3f})',1]}
    desc={'identifier':spec['gid'],'texture_width':TEX,'texture_height':TEX,'visible_bounds_width':4.5,'visible_bounds_height':4.5,'visible_bounds_offset':[0,1,0]}
    geometry={'format_version':'1.16.0','minecraft:geometry':[{'description':desc,'bones':bones}]}
    anim={'format_version':'1.8.0','animations':{f'animation.swbr.aburame{mode}.idle':{'loop':True,'animation_length':PERIODS[mode],'bones':animations}}}
    counts.update(bones=len(bones),cubos=sum(len(b.get('cubes',[])) for b in bones),passes=len(roles),roles=roles)
    return geometry,anim,counts

def layer_geometry(master,mode,role):
    g=copy.deepcopy(master['minecraft:geometry'][0]);g['description']['identifier']=f'geometry.swbr.aburame{mode}.{role}'
    g['bones']=[b for b in g['bones'] if not b['name'].startswith(f'swbr_aburame{mode}_') or b['name'].startswith(f'swbr_aburame{mode}_{role}_')]
    return g
def camera_program():
    stage='0'
    for i,spec in reversed(list(MODES.items())):stage=f"q.is_item_name_any('slot.armor.head',0,'{spec['id']}') ? {i} : ({stage})"
    return ["v.swbr_aburame_camera_ok = !v.swbr_view_first_person && !v.swbr39_ui && !v.swbr_view_map_face && !q.is_spectator && q.distance_from_camera > 2.8;",
      'v.swbr_aburame_fade = math.clamp((q.distance_from_camera - 2.8) / 0.2,0,1);',f'v.swbr_aburame_stage = {stage};',
      *[f'v.swbr_aburame_draw{i} = v.swbr_aburame_camera_ok && v.swbr_aburame_stage == {i};' for i in MODES]]
def locator_names(mode):
    tier=MODES[mode]['tier'];names=['mao_d','mao_e','antebraco_d','antebraco_e']
    if tier>=2:names+=['ombro_d','ombro_e','peito','costas']
    if tier==3:names+=['perna_d','perna_e']
    if mode==6:names+=['cabeca']
    return ['swbr_aburame_'+n for n in names]
def particle(mode):
    poison=MODES[mode]['kind']=='venenoso';tier=MODES[mode]['tier']
    size=(.007+.002*tier) if poison else (.018+.004*tier)
    max_size=(.012+.003*tier) if poison else (.026+.006*tier)
    age='math.clamp(v.particle_age/math.max(v.particle_lifetime,0.001),0,1)'
    return {'format_version':'1.10.0','particle_effect':{'description':{'identifier':f'swbr:aburame_{mode}','basic_render_parameters':{'material':'particles_blend','texture':f'textures/entity/swbr/aburame/particulas_{mode}'}},'components':{
      'minecraft:emitter_local_space':{'position':True,'rotation':True,'velocity':False},
      'minecraft:emitter_rate_steady':{'spawn_rate':2+tier,'max_particles':3 if tier<3 else 4},
      'minecraft:emitter_lifetime_looping':{'active_time':1,'sleep_time':0},
      'minecraft:emitter_shape_sphere':{'offset':[0,0,0],'radius':.025 if poison else .035,'surface_only':False,'direction':'outwards'},
      'minecraft:particle_lifetime_expression':{'max_lifetime':f'math.random(0.18,{.23+.04*tier:.2f})' if poison else f'math.random(0.24,{.30+.05*tier:.2f})'},
      'minecraft:particle_initial_speed':.018 if poison else .035,
      'minecraft:particle_motion_dynamic':{'linear_acceleration':[.008,.025,-.006],'linear_drag_coefficient':.8},
      'minecraft:particle_initial_spin':{'rotation':'math.random(0,360)','rotation_rate':'math.random(-60,60)'},
      'minecraft:particle_appearance_billboard':{'size':[f'{size:.5f}+{max_size-size:.5f}*({age})']*2,'facing_camera_mode':'lookat_xyz',
        'uv':{'texture_width':128,'texture_height':512,'flipbook':{'base_UV':[0,0],'size_UV':[128,128],'step_UV':[0,128],'frames_per_second':10,'max_frame':3,'stretch_to_lifetime':True}}},
      'minecraft:particle_appearance_tinting':{'color':[1,1,1,f'math.clamp(v.particle_age/0.04,0,1)*math.pow(1-({age}),0.7)']},
      'minecraft:particle_appearance_lighting':{}}}}
def particle_sheet(mode):
    im=Image.new('RGBA',(128,512));poison=MODES[mode]['kind']=='venenoso'
    for i in range(4):
        frame=Image.new('RGBA',(128,128))
        if poison:
            d=ImageDraw.Draw(frame);rng=np.random.default_rng(mode*500+i)
            for j in range(5):
                x,y=[int(v) for v in rng.integers(34,94,2)];d.ellipse((x-3,y-3,x+3,y+3),fill=(35+j*3,18+j,49+j*4,235))
        else:frame.alpha_composite(insect_stamp(44,60).rotate(i*15-22,expand=True),(36,29))
        im.paste(frame,(0,i*128))
    return im

def build(base):
    packs=read_base(base);bp=packs['BP'][1];rp=packs['RP'][1]
    assert json.loads(bp['manifest.json'])['header']['version']==[18,11,68]
    skin=json.loads(rp[NATIVE_GEOS[0]])['minecraft:geometry'][0]
    player=json.loads(rp[PLAYER_FILE]);d=player['minecraft:client_entity']['description']
    assert not any(k.startswith('swbr_aburame') for k in d['geometry'])
    d['materials'].update(swbr_aburame_solid='entity_alphatest',swbr_aburame_translucent='entity_alphablend')
    rc={};draw=[];stats={};states={'default':{'transitions':[{f'modo{i}':f'v.swbr_aburame_draw{i}'} for i in MODES]}}
    for i,spec in MODES.items():
        geo,anim,counts=model(i,skin);stats[str(i)]=counts
        put('RP',spec['path'],geo);put('RP',f'animations/swbr_aburame_{i}.json',anim)
        tex=f'textures/entity/swbr/aburame/modo_{i}';put('RP',tex+'.png',png(atlas(i)))
        d['textures'][f'swbr_aburame{i}']=tex;d['animations'][f'swbr_aburame{i}_idle']=f'animation.swbr.aburame{i}.idle'
        d['scripts']['animate'].append({f'swbr_aburame{i}_idle':f'v.swbr_aburame_draw{i}'})
        d['particle_effects'][f'swbr_aburame{i}_insetos']=f'swbr:aburame_{i}'
        for role in counts['roles']:
            part=layer_geometry(geo,i,role);draw.append(part);alias=f'swbr_aburame{i}_{role}'
            d['geometry'][alias]=part['description']['identifier'];controller=f'controller.render.swbr.aburame{i}.{role}'
            d['render_controllers'].append({controller:f'v.swbr_aburame_draw{i}'})
            material='solid' if role.startswith('solid') else 'translucent'
            alpha='v.swbr_aburame_fade'
            if role.startswith('swarm'):alpha=f'(0.86+0.10*math.sin(q.life_time*29+{i*47+(0 if role.endswith("a") else 117)}))*v.swbr_aburame_fade'
            if role=='coat':alpha=f'(0.93+0.025*math.sin(q.life_time*23+{i*53}))*v.swbr_aburame_fade'
            rc[controller]={'geometry':'Geometry.'+alias,'materials':[{'*':'Material.swbr_aburame_'+material}],'textures':['Texture.swbr_aburame'+str(i)],'color':{'r':1,'g':1,'b':1,'a':alpha}}
        states[f'modo{i}']={'particle_effects':[{'effect':f'swbr_aburame{i}_insetos','locator':loc} for loc in locator_names(i)],'transitions':[{'default':f'!v.swbr_aburame_draw{i}'}]}
        put('RP',f'particles/swbr_aburame_{i}.json',particle(i));put('RP',f'textures/entity/swbr/aburame/particulas_{i}.png',png(particle_sheet(i)))
        stem=spec['id'].replace(':','_')
        for path in [f'attachables/{stem}.json',f'attachables/{stem}.player.json']:
            if path not in rp:continue
            old=json.loads(rp[path])['minecraft:attachable']['description']
            desc={'identifier':old['identifier'],'materials':{'default':'entity_alphablend'},'textures':{'default':tex},'geometry':{'default':'geometry.swbr.aburame.slot'},'render_controllers':['controller.render.swbr.aburame.slot']}
            if 'item' in old:desc['item']=old['item']
            put('RP',path,{'format_version':'1.10.0','minecraft:attachable':{'description':desc}})
    d['animations']['swbr_aburame_fx']='controller.animation.swbr.aburame.fx';d['scripts']['animate'].append('swbr_aburame_fx')
    d['scripts']['pre_animation'].extend(camera_program());put('RP',PLAYER_FILE,player)
    put('RP',DRAW_GEO,{'format_version':'1.16.0','minecraft:geometry':draw})
    put('RP',SLOT_GEO,{'format_version':'1.16.0','minecraft:geometry':[{'description':{'identifier':'geometry.swbr.aburame.slot','texture_width':TEX,'texture_height':TEX},'bones':[{'name':'root','pivot':[0,0,0]}]}]})
    rc['controller.render.swbr.aburame.slot']={'geometry':'Geometry.default','materials':[{'*':'Material.default'}],'textures':['Texture.default']}
    put('RP',RC_FILE,{'format_version':'1.8.0','render_controllers':rc})
    put('RP',FX_FILE,{'format_version':'1.10.0','animation_controllers':{'controller.animation.swbr.aburame.fx':{'initial_state':'default','states':states}}})
    for path in NATIVE_GEOS:
        data=json.loads(rp[path]);bones={b['name']:b for b in data['minecraft:geometry'][0]['bones']}
        for bone,locators in LOCATORS.items():bones[bone].setdefault('locators',{}).update(locators)
        put('RP',path,data)
    for pack,data in [('BP',bp),('RP',rp)]:
        manifest=json.loads(data['manifest.json']);manifest['header']['version']=VERSION
        manifest['header']['name']=re.sub(r'18\.11\.\d+','18.11.70',manifest['header']['name']).split(' · ')[0]+' · Aburame'
        manifest['header']['description']='SWBR 18.11.70 | Primeiro modo Aburame refinado após comparação com Shino; Iburi e sistemas preservados'
        for module in manifest['modules']:module['version']=VERSION
        for dep in manifest.get('dependencies',[]):
            if dep.get('uuid') in [json.loads(bp['manifest.json'])['header']['uuid'],json.loads(rp['manifest.json'])['header']['uuid']]:dep['version']=VERSION
        put(pack,'manifest.json',manifest)
    entries={}
    for pack in ['BP','RP']:
        files={p.relative_to(ROOT/'Integracao'/pack).as_posix():sha(p.read_bytes()) for p in sorted((ROOT/'Integracao'/pack).rglob('*')) if p.is_file()}
        entries[pack]={'original_entry':packs[pack][0],'updated_entry':f'SWBR_{pack}_v18.11.70_ABURAME.mcpack','files':files}
    original={}
    for i,spec in MODES.items():
        path=spec['path'] if spec['path'] in rp else MODES[3 if i==4 else 5]['path']
        g=json.loads(rp[path])['minecraft:geometry'][0]
        original[str(i)]={'bones':len(g['bones']),'cubos':sum(len(b.get('cubes',[])) for b in g['bones'])}
    manifest={'clan':'Aburame','base_filename':base.name,'base_sha256':sha(base.read_bytes()),'base_version':[18,11,68],'version':VERSION,'packs':entries,'removed_files':[],
      'modes':{str(i):spec for i,spec in MODES.items()},'modelos_anteriores':original,'modelos_novos':stats}
    (ROOT/'Integracao_Manifesto.json').write_bytes(dump(manifest));print(json.dumps({'version':VERSION,'models':stats,'overlay':{k:len(v['files']) for k,v in entries.items()}},ensure_ascii=False,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('base',type=Path);args=parser.parse_args();build(args.base)
