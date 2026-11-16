#!/usr/bin/env python3
"""Build original, volumetric Bedrock wings and self-contained Blockbench projects.

Coordinates are authored in Blockbench space: Y up, +Z behind the player.
Bedrock export mirrors X and the X/Y Euler angles, as Blockbench's codec does.
"""
from __future__ import annotations
import argparse, base64, io, json, math, shutil, uuid, zipfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.ndimage import distance_transform_edt

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent if ROOT.name=='Ferramentas' else ROOT / 'Asas_3D_Fonte'
BP = PROJECT / 'Asas_3D_BP'
RP = PROJECT / 'Asas_3D_RP'
GRID = 0.625
TEX = 512
SX, SY, U0, V0, YTOP = 8.35, 6.9, 256, 8, 66.5
NAMESPACE = uuid.UUID('62c767fc-0211-420b-b6c7-8d17114e04dd')

# Traced by eye from the two supplied references; coordinates are model units.
OUTLINES = {
 'azuis': {
  'superior': [(2,21),(3.3,25),(4.8,28),(4.4,32.6),(6.4,31.2),(6.3,36.5),(8.8,40.5),(8.5,44.7),(10.4,42.5),(11.6,48.7),(13.2,51),(13.6,54.6),(15.2,52.5),(16.2,57.5),(18,59),(18.6,61.8),(20.7,60.8),(24.8,64),(24,60.2),(26,60.9),(25.5,56.8),(27,55.4),(26.5,51.8),(27.2,49.3),(26,46.3),(26.6,43.1),(25.4,41.4),(25.4,38),(23.6,33.4),(21.7,30.2),(18.8,27.1),(15.1,24.8),(10.4,23.2),(6.1,21.5)],
  'inferior': [(2,19.4),(5,21.3),(9.8,21.3),(13,20.3),(16.6,18),(18.9,15.6),(19.5,12.3),(18.7,11.2),(20.8,9.9),(19.8,7.8),(17.9,6.3),(19.8,4.9),(21.6,4),(22.7,1.8),(24.8,.4),(23.7,-1.3),(20.6,-1.2),(18.7,.4),(17.8,-.1),(15.4,2.5),(13.7,2.8),(11.4,5.9),(10.1,5.6),(8.1,9.1),(7.1,8.3),(5.4,11.6),(3.2,14.8)],
 },
 'rosas': {
  'superior': [(2,21.2),(3.9,27.2),(7,34.5),(10.5,42.7),(14.2,50.3),(18.5,57),(21.6,60.7),(24.1,64.8),(25.2,65.2),(24.4,61.1),(26.6,63.1),(26,58.9),(27.2,58.2),(26.9,53.6),(25.7,50.6),(26,47.9),(24.4,43.8),(24.6,41.4),(22.1,36.1),(19.4,31.9),(16.3,28.2),(12.1,24.9),(7.3,22.5)],
  'inferior': [(2,19.2),(5.1,20.2),(9.5,19.7),(13.6,18.4),(16.9,16.8),(18.8,14.2),(18.5,12.4),(20.6,11.9),(20.5,9.4),(22.3,6.8),(22.3,4.8),(24.2,2.2),(25.9,-2.1),(23.5,-.3),(23.5,-2.4),(20.4,.7),(19.1,1),(17.2,4.3),(15.7,3.7),(13.7,6.9),(12.4,5.6),(10.2,9.8),(8.7,8.4),(6.3,12.8),(4.6,12.6),(3,16.2)],
 }
}

def uid(label): return str(uuid.UUID(bytes=uuid.uuid5(NAMESPACE, label).bytes,version=4))
def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def uvpt(x,y): return (U0+x*SX, V0+(YTOP-y)*SY)
def inside(x,y,poly):
    flag = False
    for (ax,ay),(bx,by) in zip(poly, poly[1:]+poly[:1]):
        if (ay>y)!=(by>y) and x < (bx-ax)*(y-ay)/(by-ay)+ax: flag=not flag
    return flag
def bezier(p0,p1,p2,p3,n=28):
    t=np.linspace(0,1,n)[:,None]
    return (1-t)**3*np.array(p0)+3*(1-t)**2*t*np.array(p1)+3*(1-t)*t*t*np.array(p2)+t**3*np.array(p3)
def flame_path(cx,cy,length,width,lean=.32,down=False):
    # One sweeping, pointed tongue, with a small inward hook near the foot.
    angle=math.atan2(-1 if down else 1,lean)
    d=np.array([math.cos(angle),math.sin(angle)]); p=np.array([-d[1],d[0]])
    b=np.array([cx,cy]); tip=b+d*length+p*.22*width
    a=bezier(b-p*width*.65,b+d*length*.45-p*width*1.18,tip-d*length*.2-p*width*.12,tip)
    z=bezier(tip,tip-d*length*.64+p*width*.28,b+d*length*.45+p*width*.96,b+p*width*.5)
    return np.concatenate([a,z])

BLUE_MOTIFS = {
 'superior': [(7.4,29.2,1.45),(10,34.9,1.7),(10.9,40,1.3),(13.7,44.1,1.7),(15.3,50.4,1.45),(18,55.6,1.75),(21.4,59,1.25),(22.7,53,1.7),(23.4,46.2,1.6),(21,40.7,2.0),(20,34,1.65),(16.2,31,1.8),(14.8,38,1.45)],
 'inferior': [(6.2,16.7,1.1),(10.1,17.7,1.6),(14.9,14.3,1.55),(15.3,10.5,1.45),(10.8,11.6,1.25),(15,5.9,1.0),(20,2.5,.85)]
}
GOLD_MOTIFS = {
 'superior': [(5.8,27.8,8.0,.85,.29),(8.9,34,10.2,1.3,.31),(12.8,42.4,10.4,1.45,.40),(17.3,51,9.2,1.3,.42),(21.9,55.1,8.0,1.12,.28),(21.2,45.8,9,1.35,.39),(18.2,37.8,9,1.45,.50),(13.1,30.2,8.9,1.75,.57),(20.5,35,7.2,.88,.29),(9.1,28.1,6.8,.80,.12)],
 'inferior': [(5.0,18,7.8,1.15,.55),(9.1,17.6,9.2,1.25,.73),(13.4,15.6,11.2,1.35,.67),(16.1,11.9,11.4,1.2,.68),(18.6,7.4,8.6,.9,.66),(8.1,14.9,7.4,.75,.29)]
}

def spiral(cx,cy,r,flip=False):
    a=np.linspace(0,math.pi*1.72,24)
    rad=np.linspace(r,r*.15,len(a))
    points=np.c_[cx+np.cos(a)*rad, cy+np.sin(a)*rad*1.25]
    # A curving rising tongue joins the vortex without a polygonal arrowhead.
    tail=bezier([cx-r*.4,cy+r*2.8],[cx+r*.7,cy+r*1.9],[cx+r*1.4,cy+r*.65],points[0],n=12)
    return np.concatenate([tail,points[1:]])

def make_texture(kind):
    yy,xx=np.mgrid[0:TEX,0:TEX]
    X=(xx-U0)/SX; Y=YTOP-(yy-V0)/SY; A=np.abs(X)
    wave=(np.sin(A*.92+Y*.28+1.5*np.sin(Y*.21)) + .58*np.sin(A*1.81-Y*.38+np.sin(A*.61))+.33*np.cos(A*3.1+Y*.65))/1.91
    rng=np.random.default_rng(814 if kind=='azuis' else 156)
    noise=rng.normal(0,1.3,xx.shape)
    if kind=='azuis':
        t=np.clip(.42+.52*wave,0,1)
        c0=np.array([1,49,163]);c1=np.array([0,186,237]);c2=np.array([73,225,244])
        rgb=c0+(c1-c0)*t[:,:,None]
        rgb+=np.clip(wave-.52,0,1)[:,:,None]*(c2-c1)*1.7
    else:
        t=np.clip(.51+.2*wave,0,1)
        rgb=np.array([216,47,202])+(np.array([255,169,233])-np.array([216,47,202]))*t[:,:,None]
        rgb+=np.sin(A*.52+Y*.15)[:,:,None]*np.array([0,5,3])
    rgb=np.uint8(np.clip(rgb+noise[:,:,None],0,255))
    image=Image.fromarray(np.dstack([rgb,np.full(xx.shape,255,np.uint8)]),'RGBA')
    mask=Image.new('L',(TEX,TEX));d=ImageDraw.Draw(mask)
    for poly in OUTLINES[kind].values():
        for side in [-1,1]:d.polygon([uvpt(side*x,y) for x,y in poly],fill=255)
    dist=distance_transform_edt(np.asarray(mask)>0)
    edge=np.exp(-dist/4.2)
    col=np.array([4,96,226]) if kind=='azuis' else np.array([255,205,255])
    a=np.asarray(image).copy();a[:,:,:3]=np.uint8(a[:,:,:3]*(1-edge[:,:,None]*.75)+col*edge[:,:,None]*.75)
    image=Image.fromarray(a)
    glow=Image.new('RGBA',(TEX,TEX));gd=ImageDraw.Draw(glow)
    detail=Image.new('RGBA',(TEX,TEX));dd=ImageDraw.Draw(detail)
    for wing in ['superior','inferior']:
        for side in [-1,1]:
            if kind=='azuis':
                # Larger interlocking tongues are the underlying flame field;
                # the curls below are only their tips, rather than isolated dots.
                rng2=np.random.default_rng(104 if wing=='superior' else 205)
                for j in range(46 if wing=='superior' else 18):
                    cx=float(rng2.uniform(4,26));cy=float(rng2.uniform(25,59) if wing=='superior' else rng2.uniform(1,19))
                    if not inside(cx,cy,OUTLINES[kind][wing]):continue
                    ln=float(rng2.uniform(4.5,10));w=float(rng2.uniform(.35,1.15))
                    path=flame_path(cx,cy,ln,w,float(rng2.uniform(-.2,.5)),wing=='inferior')
                    pix=[uvpt(side*x,y) for x,y in path]
                    gd.polygon(pix,fill=(0,181,244,70))
                    dd.polygon(pix,fill=(0,160+int(rng2.integers(0,45)),236,100))
                for idx,(cx,cy,r) in enumerate(BLUE_MOTIFS[wing]):
                    path=spiral(cx,cy,r)
                    pix=[uvpt(side*x,y) for x,y in path]
                    gd.line(pix,fill=(0,215,251,156),width=max(5,int(r*8)),joint='curve')
                    dd.line(pix,fill=(0,180+idx%3*10,240,160),width=max(3,int(r*4.5)),joint='curve')
                    dd.line(pix,fill=(30,204,240,170),width=max(1,int(r*1.5)),joint='curve')
                    path=flame_path(cx-r*.45,cy-r*1.4,r*3.5,r*.34,.17)
                    dd.polygon([uvpt(side*x,y) for x,y in path],fill=(0,190,242,95))
            else:
                for idx,(cx,cy,ln,w,lean) in enumerate(GOLD_MOTIFS[wing]):
                    w*=1.63
                    path=flame_path(cx,cy,ln,w,lean,wing=='inferior')
                    gd.polygon([uvpt(side*x,y) for x,y in path],fill=(255,242,148,235))
                    dd.polygon([uvpt(side*x,y) for x,y in path],fill=(255,242,145,245))
                    path=flame_path(cx+.10,cy+(-.5 if wing=='inferior' else .5),ln*.87,w*.66,lean,wing=='inferior')
                    dd.polygon([uvpt(side*x,y) for x,y in path],fill=(255,255,205,255))
    image=Image.alpha_composite(image,glow.filter(ImageFilter.GaussianBlur(3.1)))
    image=Image.alpha_composite(image,detail)
    # Bright inset rim follows the asymmetric tongues of the reference, not a rectangle.
    rim=Image.new('RGBA',(TEX,TEX));rd=ImageDraw.Draw(rim)
    for poly in OUTLINES[kind].values():
        for side in [-1,1]:
            pts=[uvpt(side*x,y) for x,y in poly];pts.append(pts[0])
            rd.line(pts,fill=(4,153,244,115) if kind=='azuis' else (255,237,255,230),width=3,joint='curve')
    image=Image.alpha_composite(image,rim)
    image.putalpha(mask)
    # Utility swatches used by the genuinely three-dimensional ribs and rims.
    palette=([(5,84,205,255),(2,127,226,255),(1,183,236,255),(50,217,248,255),(105,237,255,255),(13,153,245,88),(4,80,195,255),(2,118,219,255)] if kind=='azuis' else [(222,73,208,255),(247,117,226,255),(255,214,245,255),(255,243,152,255),(255,255,215,255),(255,181,245,78),(236,79,221,255),(255,166,231,255)])
    d=ImageDraw.Draw(image)
    for i,color in enumerate(palette):d.rectangle([i*16,496,i*16+15,511],fill=color)
    return image

def swatch(index): return {'uv':[index*16+3,499,index*16+12,508],'texture':0}
def cube(name,lo,hi,faces=None,rot=None,origin=None):
    c={'name':name,'type':'cube','from':[round(float(v),5) for v in lo], 'to':[round(float(v),5) for v in hi], 'autouv':0,'box_uv':False,'color':0,'shade':True,'mirror_uv':False,'uv_offset':[0,0],'inflate':0,'rotation':rot or [0,0,0],'origin':origin or [0,0,0], 'faces': faces or {f:swatch(2) for f in ['north','south','east','west','up','down']},'uuid':uid(name)}
    return c
def mapped_faces(x0,y0,x1,y1,shade):
    u0,v1=uvpt(x0,y0);u1,v0=uvpt(x1,y1)
    return {'north':{'uv':[u0,v0,u1,v1],'texture':0},'south':{'uv':[u1,v0,u0,v1],'texture':0},**{f:swatch(shade) for f in ['east','west','up','down']}}

def field_for(kind,wing):
    poly=OUTLINES[kind][wing]
    xs=np.arange(0,28,GRID);ys=np.arange(-3,66,GRID)
    mask=np.array([[inside(float(x+GRID/2),float(y+GRID/2),poly) for x in xs] for y in ys])
    d=distance_transform_edt(mask)*GRID
    tiers=np.where(d<.9,0,np.where(d<1.85,1,np.where(d<3.2,2,3)))
    tiers[~mask]=-1
    return xs,ys,tiers

def rectangles(tiers):
    a=tiers.copy();h,w=a.shape;out=[]
    for iy in range(h):
        for ix in range(w):
            val=a[iy,ix]
            if val<0: continue
            end=ix+1
            while end<w and a[iy,end]==val:end+=1
            bottom=iy+1
            while bottom<h and np.all(a[bottom,ix:end]==val):bottom+=1
            out.append((ix,iy,end,bottom,int(val)));a[iy:bottom,ix:end]=-1
    return out

def add_ribbon(elements, group, name, pts, width, depth, tier_at, side, palette, surface=1):
    for i,(a,b) in enumerate(zip(pts[:-1],pts[1:])):
        a=np.array(a);b=np.array(b);mid=(a+b)/2
        tier=tier_at(*mid)
        if tier<1:continue
        delta=b-a;length=np.linalg.norm(delta)
        if length<.06: continue
        half=DEPTHS[tier]/2
        z=3.8+surface*(half+.045+depth/2)
        pos=[side*float(mid[0]),float(mid[1]),z]
        angle=math.degrees(math.atan2(delta[1],side*delta[0]))
        size=[length+.12,width,depth]
        c=cube(name+f'_{i}',[pos[j]-size[j]/2 for j in range(3)],[pos[j]+size[j]/2 for j in range(3)],{f:swatch(palette) for f in ['north','south','east','west','up','down']},[0,0,round(angle,3)],pos)
        elements.append(c);group['children'].append(c['uuid'])

DEPTHS=[.65,1.35,2.15,2.9]

def make_model(kind,image):
    elements=[]
    def group(name,pivot,parent=None,rotation=None):
        return {'name':name,'origin':pivot,'rotation':rotation or [0,0,0],'color':0,'uuid':uid(kind+'_'+name),'export':True,'isOpen':False,'children':[]}
    waist=group('waist',[0,12,0]);body=group('body',[0,24,0]);waist['children'].append(body)
    core=group('asas_nucleo',[0,20,2]);body['children'].append(core)
    # A discreet energy root intersects the skin's outer back by 0.05 units.
    for idx,(lo,hi) in enumerate([([-2.1,17.1,1.95],[2.1,22.4,3.5]),([-3.25,18.6,2.25],[3.25,21.5,3.85])]):
        c=cube(f'{kind}_nucleo_{idx}',lo,hi,{f:swatch(2) for f in ['north','south','east','west','up','down']});elements.append(c);core['children'].append(c['uuid'])
    stats={}
    for wing in ['superior','inferior']:
        xs,ys,tiers=field_for(kind,wing)
        rects=rectangles(tiers)
        def tier_at(x,y):
            ix=int(math.floor(x/GRID));iy=int(math.floor((y+3)/GRID))
            return int(tiers[iy,ix]) if 0<=ix<len(xs) and 0<=iy<len(ys) else -1
        for side in [-1,1]:
            label='esquerda' if side<0 else 'direita'
            name=f'asa_{wing}_{label}'
            grp=group(name,[side*2.7,20.5,2.7],rotation=[0,-side*(8 if wing=='superior' else 11),0]);body['children'].append(grp)
            ribs=group(name+'_relevo',[side*2.7,20.5,2.7]);grp['children'].append(ribs)
            halo=group(name+'_halo',[side*2.7,20.5,2.7]);grp['children'].append(halo)
            for j,(ix,iy,ex,ey,tier) in enumerate(rects):
                x0=xs[ix];x1=xs[ex-1]+GRID;y0=ys[iy];y1=ys[ey-1]+GRID
                lo,hi=sorted([side*x0,side*x1]);dep=DEPTHS[tier]
                c=cube(f'{kind}_{name}_volume_{j}',[lo,y0,3.8-dep/2],[hi,y1,3.8+dep/2],mapped_faces(lo,y0,hi,y1,min(3,tier)))
                elements.append(c);grp['children'].append(c['uuid'])
            if kind=='azuis':
                for j,(cx,cy,r) in enumerate(BLUE_MOTIFS[wing]):
                    path=spiral(cx,cy,r);pts=path[np.linspace(0,len(path)-1,15).astype(int)]
                    for surface in [-1,1]:add_ribbon(elements,ribs,f'{kind}_{name}_redemoinho_{j}_{surface}',pts,.13+r*.05,.17,tier_at,side,2,surface)
            else:
                for j,(cx,cy,ln,w,lean) in enumerate(GOLD_MOTIFS[wing]):
                    sign=-1 if wing=='inferior' else 1
                    d=np.array([lean,sign]);d=d/np.linalg.norm(d)
                    pts=bezier([cx,cy],np.array([cx,cy])+d*ln*.3+[-w*.3,0],np.array([cx,cy])+d*ln*.7+[w*.25,0],np.array([cx,cy])+d*ln*.92,n=7)
                    for surface in [-1,1]:add_ribbon(elements,ribs,f'{kind}_{name}_filamento_{j}_{surface}',pts,w*.29,.25,tier_at,side,4,surface)
            # Outer contour rim: translucent little solid prisms, never a whole flat billboard.
            poly=OUTLINES[kind][wing]
            for j,(a,b) in enumerate(zip(poly,poly[1:]+poly[:1])):
                if min(a[0],b[0])<4.5:continue
                a=np.array(a);b=np.array(b);mid=(a+b)/2;delta=b-a;length=np.linalg.norm(delta)
                if length>7:continue
                pos=[side*float(mid[0]),float(mid[1]),3.8]
                c=cube(f'{kind}_{name}_borda_{j}',[pos[0]-length/2,pos[1]-.16,pos[2]-.42],[pos[0]+length/2,pos[1]+.16,pos[2]+.42],{f:swatch(5) for f in ['north','south','east','west','up','down']},[0,0,math.degrees(math.atan2(delta[1],side*delta[0]))],pos)
                elements.append(c);halo['children'].append(c['uuid'])
            stats[name]={'cubos_volume':len(rects),'cubos_relevo':len(ribs['children']),'cubos_halo':len(halo['children'])}
    raw=io.BytesIO();image.save(raw,format='PNG')
    model={'meta':{'format_version':'4.10','model_format':'bedrock','box_uv':False},'name':'Asas_Azuis' if kind=='azuis' else 'Asas_Rosas','model_identifier':f'asas_teste.chamas_{kind}','visible_box':[7,7,2], 'variable_placeholders':'','resolution':{'width':512,'height':512},'elements':elements,'outliner':[waist],'textures':[{'name':f'chamas_{kind}.png','id':'0','uuid':uid(kind+'_texture'),'width':512,'height':512,'uv_width':512,'uv_height':512,'mode':'bitmap','render_mode':'default','particle':False,'visible':True,'saved':True,'internal':True,'source':'data:image/png;base64,'+base64.b64encode(raw.getvalue()).decode()}],'animations':[],'animation_variable_placeholders':'','display':{}}
    return model,stats

def export_geo(model):
    by_id={c['uuid']:c for c in model['elements']};bones=[]
    def visit(g,parent=None):
        p=g['origin'];r=g['rotation']
        bone={'name':g['name'],'pivot':[-p[0],p[1],p[2]]}
        if parent:bone['parent']=parent
        if any(r):bone['rotation']=[-r[0],-r[1],r[2]]
        cubes=[]
        for child in g['children']:
            if isinstance(child,dict):continue
            el=by_id[child];a=el['from'];b=el['to'];p=el['origin'];r=el['rotation']
            c={'origin':[-b[0],a[1],a[2]],'size':[round(b[i]-a[i],5) for i in range(3)],'uv':{}}
            if any(r):c.update({'pivot':[-p[0],p[1],p[2]],'rotation':[-r[0],-r[1],r[2]]})
            for face,f in el['faces'].items():
                u0,v0,u1,v1=f['uv']
                if face in ['up','down']:u0,v0,u1,v1=u1,v1,u0,v0
                c['uv'][face]={'uv':[round(u0,5),round(v0,5)],'uv_size':[round(u1-u0,5),round(v1-v0,5)]}
            cubes.append(c)
        if cubes:bone['cubes']=cubes
        bones.append(bone)
        for child in g['children']:
            if isinstance(child,dict):visit(child,g['name'])
    for g in model['outliner']:visit(g)
    return {'format_version':'1.12.0','minecraft:geometry':[{'description':{'identifier':'geometry.'+model['model_identifier'],'texture_width':512,'texture_height':512,'visible_bounds_width':7,'visible_bounds_height':7,'visible_bounds_offset':[0,2,0]},'bones':bones}]}

def archive_dir(folder,target,exclude=()):
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(folder.rglob('*')):
            if p.is_file() and not any(p.resolve().is_relative_to(Path(x).resolve()) for x in exclude):z.write(p,p.relative_to(folder).as_posix())

def make_packs():
    PROJECT.mkdir(parents=True,exist_ok=True)
    for directory in [BP,RP,PROJECT/'Modelos_Blockbench',PROJECT/'Ferramentas',PROJECT/'Previews']:
        directory.mkdir(parents=True,exist_ok=True)
    for pack,label,kind in [(BP,'Comportamentos','data'),(RP,'Recursos','resources')]:
        manifest={'format_version':2,'header':{'name':f'Asas 3D Teste | {label}','description':'Duas asas espirituais 3D: chamas azuis e asas rosas com amarelo. Versão estática 1.0.0.','uuid':uid(kind+'_header'),'version':[1,0,0],'min_engine_version':[1,21,0]},'modules':[{'type':kind,'uuid':uid(kind+'_module'),'version':[1,0,0]}],'metadata':{'authors':['Asas 3D Teste'],'product_type':'addon'}}
        if kind=='data':manifest['dependencies']=[{'uuid':uid('resources_header'),'version':[1,0,0]}]
        write_json(pack/'manifest.json',manifest)
    summaries={}
    icons=[]
    for kind,display,file in [('azuis','Asas de Chamas Azuis','Asas_Azuis.bbmodel'),('rosas','Asas Espirituais Rosas','Asas_Rosas.bbmodel')]:
        image=make_texture(kind)
        texpath=RP/f'textures/entity/asas_teste/chamas_{kind}.png';texpath.parent.mkdir(parents=True,exist_ok=True);image.save(texpath)
        model,stats=make_model(kind,image);write_json(PROJECT/'Modelos_Blockbench'/file,model)
        geo=export_geo(model);write_json(RP/f'models/entity/chamas_{kind}.geo.json',geo)
        identifier=f'asas_teste:chamas_{kind}'
        write_json(BP/f'items/chamas_{kind}.json',{'format_version':'1.21.0','minecraft:item':{'description':{'identifier':identifier,'menu_category':{'category':'equipment','group':'itemGroup.name.chestplate'}},'components':{'minecraft:icon':{'textures':{'default':f'asas_teste_chamas_{kind}'}},'minecraft:display_name':{'value':f'item.{identifier}.name'},'minecraft:wearable':{'slot':'slot.armor.chest','protection':0,'dispensable':True},'minecraft:tags':{'tags':['minecraft:is_armor']}}}})
        write_json(RP/f'attachables/chamas_{kind}.json',{'format_version':'1.10.0','minecraft:attachable':{'description':{'identifier':identifier,'materials':{'default':'entity_alphatest','aura':'entity_alphablend'},'textures':{'default':f'textures/entity/asas_teste/chamas_{kind}'},'geometry':{'default':f'geometry.asas_teste.chamas_{kind}'},'render_controllers':['controller.render.asas_teste.static']}}})
        # Hand-drawn atlas crop is only the inventory icon, never the worn geometry.
        icon=image.crop((22,7,491,482));icon.thumbnail((60,60),Image.Resampling.LANCZOS)
        canvas=Image.new('RGBA',(64,64));canvas.alpha_composite(icon,((64-icon.width)//2,(64-icon.height)//2))
        iconpath=RP/f'textures/items/chamas_{kind}.png';iconpath.parent.mkdir(parents=True,exist_ok=True);canvas.save(iconpath);icons.append(canvas)
        summaries[kind]={'elementos':len(model['elements']),'bones':len(geo['minecraft:geometry'][0]['bones']),'asas':stats}
    write_json(RP/'render_controllers/asas_teste.render_controllers.json',{'format_version':'1.8.0','render_controllers':{'controller.render.asas_teste.static':{'geometry':'Geometry.default','materials':[{'*':'Material.default'},{'*_halo':'Material.aura'}],'textures':['Texture.default']}}})
    write_json(RP/'textures/item_texture.json',{'resource_pack_name':'asas_teste','texture_name':'atlas.items','texture_data':{f'asas_teste_chamas_{k}':{'textures':f'textures/items/chamas_{k}'} for k in ['azuis','rosas']}})
    write_json(RP/'texts/languages.json',['pt_BR','en_US','pt_PT'])
    for locale in ['pt_BR','en_US','pt_PT']:
        p=RP/f'texts/{locale}.lang';p.parent.mkdir(parents=True,exist_ok=True)
        p.write_text('item.asas_teste:chamas_azuis.name=Asas de Chamas Azuis\nitem.asas_teste:chamas_rosas.name=Asas Espirituais Rosas\n',encoding='utf-8')
    packicon=Image.new('RGBA',(256,256),(17,23,46,255))
    for i,img in enumerate(icons):packicon.alpha_composite(img.resize((120,120),Image.Resampling.NEAREST),(6+i*124,66))
    for pack in [BP,RP]:packicon.save(pack/'pack_icon.png')
    write_json(PROJECT/'Estatisticas_Modelos.json',summaries)
    if Path(__file__).resolve()!=(PROJECT/'Ferramentas/build_wings.py').resolve():shutil.copy2(__file__,PROJECT/'Ferramentas/build_wings.py')
    (PROJECT/'Ferramentas/requirements.txt').write_text('numpy>=1.24\nPillow>=9.2\nscipy>=1.10\njsonschema>=4.18\n',encoding='utf-8')
    return summaries

def package(target):
    target.mkdir(parents=True,exist_ok=True)
    addon=target/'Asas_3D_Teste_Bedrock.mcaddon'
    with zipfile.ZipFile(addon,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for pack in [BP,RP]:
            buffer=io.BytesIO();archive_dir(pack,buffer);z.writestr(pack.name+'.mcpack',buffer.getvalue())
    for p in (PROJECT/'Modelos_Blockbench').glob('*.bbmodel'):shutil.copy2(p,target/p.name)
    archive_dir(PROJECT,target/'Asas_3D_Fontes_Completos.zip',exclude=[target])
    return addon

if __name__=='__main__':
    args=argparse.ArgumentParser();args.add_argument('--package',type=Path);options=args.parse_args()
    print(json.dumps(make_packs(),ensure_ascii=False,indent=2))
    if options.package:print(package(options.package))
