#!/usr/bin/env python3
"""Rebuild the v1.1 volumetric wings, using the included painted atlases.

Authoring space: Blockbench Y up, +Z behind Steve/Alex. The Bedrock codec
mirrors X and X/Y Euler angles on export. No player entity is overridden.
"""
from __future__ import annotations
import argparse, base64, io, json, math, shutil, uuid, zipfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter, label, map_coordinates, binary_fill_holes, binary_closing, binary_dilation

ROOT=Path(__file__).resolve().parent
PROJECT=ROOT.parent if ROOT.name=='Ferramentas' else ROOT/'Asas_3D_Fonte'
BP=PROJECT/'Asas_3D_BP';RP=PROJECT/'Asas_3D_RP'
TEX=1024
GRID=.4
NAMESPACE=uuid.UUID('62c767fc-0211-420b-b6c7-8d17114e04dd')
VERSION=[1,1,0]
ASSETS=ROOT/'Arte'
FIELDS={}

def uid(label):return str(uuid.UUID(bytes=uuid.uuid5(NAMESPACE,label).bytes,version=4))
def write_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def largest(mask):
    ids,n=label(mask)
    if n==0:raise ValueError('Missing wing silhouette')
    sizes=np.bincount(ids.ravel());sizes[0]=0
    return ids==int(sizes.argmax())

def make_texture(kind):
    # Resampling and chart placement are UV preparation, not procedural painting.
    # The original artwork remains in Arte/ so rebuilding needs no image service.
    art=Image.open(ASSETS/f'chamas_{kind}_base.png').convert('RGBA').resize((992,992),Image.Resampling.LANCZOS)
    image=Image.new('RGBA',(TEX,TEX));image.paste(art,(16,0))
    rgba=np.array(image);a=rgba[:,:,3].astype(float)/255
    a=gaussian_filter(a,1.15)
    fields={};cut=int(992*(.590 if kind=='azuis' else .622))
    right=np.indices(a.shape)[1]>518
    for wing in ['superior','inferior']:
        region=right.copy()
        if wing=='superior':region[cut:,:]=False
        else:region[:cut+4,:]=False
        solid=largest(binary_closing((a>.69)&region,iterations=1))
        solid=binary_fill_holes(solid)
        # Glow is a narrow, genuine volumetric fringe following the same contour.
        halo=(a>.06)&region&binary_dilation(solid,iterations=4)&~solid
        ys,xs=np.where(solid)
        root_pixel=float(cut if wing=='superior' else cut+4)
        root_y=22.5 if wing=='superior' else 20.8
        height=(32.5 if kind=='azuis' else 28.8) if wing=='superior' else 20.0
        sy=(root_pixel-float(ys.min()))/height if wing=='superior' else (float(ys.max())-root_pixel)/height
        sx=(496-20)/(26.5-1.2 if kind=='azuis' else 27.2-1.2)
        fields[wing]={'mask':solid,'halo':halo,'sx':sx,'sy':sy,'root_pixel':root_pixel,'root_y':root_y,'top':root_y+height if wing=='superior' else root_y}
    # Eliminate isolated generator specks and the center star outside the wings.
    clean=np.zeros(a.shape,bool)
    for f in fields.values():clean|=f['mask']|f['halo']
    rgba[:,:,3]=np.where(clean,rgba[:,:,3],0)
    rgba[:,:,3]=np.where(clean&(rgba[:,:,3]>200),255,rgba[:,:,3])
    image=Image.fromarray(rgba,'RGBA')
    rgb=gaussian_filter(rgba[:,:,:3].astype(float),sigma=(5,5,0))
    if kind=='azuis':energy=np.clip((rgb[:,:,1]-.30*rgb[:,:,2]-22)/125,0,1)
    else:energy=np.clip((rgb[:,:,1]-rgb[:,:,2]+38)/115,0,1)
    fields['image']=image;fields['rgb']=rgb;fields['energy']=energy;fields['palette']={}
    FIELDS[kind]=fields
    return image

def source_uv(field,x,y):
    return 512+(np.abs(x)-1.2)*field['sx'],field['root_pixel']+(field['root_y']-y)*field['sy']

def swatch(kind,rgb,alpha=255):
    fields=FIELDS[kind]
    color=tuple(int(np.clip(round(float(v)/16)*16,0,255)) for v in rgb)+(alpha,)
    palette=fields['palette']
    if color not in palette:
        index=len(palette);assert index<2048,'Side palette overflow'
        col=index%256;row=index//256
        ImageDraw.Draw(fields['image']).rectangle((col*4,992+row*4,col*4+3,995+row*4),fill=color)
        palette[color]=[col*4+1,993+row*4,col*4+3,995+row*4]
    return {'uv':palette[color].copy(),'texture':0}

def cube(name,lo,hi,faces,rotation=None,pivot=None):
    return {'name':name,'type':'cube','from':[round(float(v),5) for v in lo],'to':[round(float(v),5) for v in hi],'autouv':0,'box_uv':False,'color':0,'shade':True,'mirror_uv':False,'uv_offset':[0,0],'inflate':0,'rotation':rotation or [0,0,0],'origin':pivot or [0,0,0],'faces':faces,'uuid':uid(name)}

def faces_at(kind,field,x0,y0,x1,y1,alpha=255):
    u0,v1=source_uv(field,x0,y0);u1,v0=source_uv(field,x1,y1)
    um,vm=source_uv(field,(x0+x1)/2,(y0+y1)/2)
    rgb=FIELDS[kind]['rgb'][int(np.clip(vm,0,991)),int(np.clip(um,0,1023))]*.96
    side=swatch(kind,rgb,alpha)
    return {'north':{'uv':[u0,v0,u1,v1],'texture':0},'south':{'uv':[u1,v0,u0,v1],'texture':0},**{f:dict(side) for f in ['east','west','up','down']}}

def rectangles(values):
    a=values.copy();h,w=a.shape;out=[]
    for iy in range(h):
        for ix in range(w):
            value=a[iy,ix]
            if value<0:continue
            ex=ix+1
            while ex<w and a[iy,ex]==value:ex+=1
            ey=iy+1
            while ey<h and np.all(a[ey,ix:ex]==value):ey+=1
            out.append((ix,iy,ex,ey,int(value)));a[iy:ey,ix:ex]=-1
    return out

def make_model(kind,image):
    fields=FIELDS[kind];elements=[];stats={}
    def group(name,pivot,rotation=None):return {'name':name,'origin':pivot,'rotation':rotation or [0,0,0],'color':0,'uuid':uid(kind+'_'+name),'export':True,'isOpen':False,'children':[]}
    waist=group('waist',[0,12,0]);body=group('body',[0,24,0]);waist['children'].append(body)
    core=group('asas_nucleo',[0,21.4,2.8]);body['children'].append(core)
    root_color=[5,117,224] if kind=='azuis' else [255,177,231]
    root_faces={f:swatch(kind,root_color) for f in ['north','south','east','west','up','down']}
    # Rounded, compact connector against the skin, instead of the old crossbar.
    for j,(x,zdepth,height) in enumerate([(1.6,1.2,4.4),(1.2,2.1,5.0),(.75,2.65,5.4)]):
        c=cube(f'{kind}_raiz_{j}',[-x,21.1-height/2,1.95],[x,21.1+height/2,1.95+zdepth],root_faces)
        elements.append(c);core['children'].append(c['uuid'])
    for wing in ['superior','inferior']:
        field=fields[wing]
        xs=np.arange(.8,29.2,GRID);ys=np.arange(0,56.4,GRID)
        xx,yy=np.meshgrid(xs+GRID/2,ys+GRID/2);uu,vv=source_uv(field,xx,yy)
        mask=map_coordinates(field['mask'].astype(float),[vv,uu],order=1,mode='constant')>.48
        mask=largest(mask)
        distance=distance_transform_edt(mask)*GRID
        # A full central volume and two narrow bevels keep the painted surface
        # continuous. Thin bevels avoid the concentric, terraced slabs of v1.
        depth=np.where(distance<.75,.64,np.where(distance<1.30,1.12,1.60))
        tier=np.rint(depth/.16).astype(int);tier[~mask]=-1
        energy=map_coordinates(fields['energy'],[vv,uu],order=1,mode='constant')
        relief=(energy>.40)&(distance>.9)
        relief_key=np.where(relief,tier,-1)
        halo=(map_coordinates(field['halo'].astype(float),[vv,uu],order=1,mode='constant')>.15)&~mask
        main_rects=rectangles(tier);relief_rects=rectangles(relief_key);halo_rects=rectangles(np.where(halo,0,-1))
        def bounds(rect,side):
            ix,iy,ex,ey,key=rect
            lo,hi=sorted((side*float(xs[ix]),side*float(xs[ex-1]+GRID)))
            return lo,float(ys[iy]),hi,float(ys[ey-1]+GRID),key
        for side in [-1,1]:
            start_element=len(elements)
            direction='esquerda' if side<0 else 'direita';name=f'asa_{wing}_{direction}'
            yaw=(9 if kind=='azuis' else 7) if wing=='superior' else 11
            pivot=[side*1.5,21.6,3.6]
            grp=group(name,pivot,[0,-side*yaw,0]);body['children'].append(grp)
            raised=group(name+'_relevo',pivot);grp['children'].append(raised)
            aura=group(name+'_halo',pivot);grp['children'].append(aura)
            for j,r in enumerate(main_rects):
                x0,y0,x1,y1,t=bounds(r,side);d=t*.16
                c=cube(f'{kind}_{name}_corpo_{j}',[x0,y0,4.25-d/2],[x1,y1,4.25+d/2],faces_at(kind,field,x0,y0,x1,y1))
                elements.append(c);grp['children'].append(c['uuid'])
            # Broad energy currents are raised on both faces using the SAME UVs.
            # Their organic shapes come from the painted currents, not stamped ribs.
            for j,r in enumerate(relief_rects):
                x0,y0,x1,y1,t=bounds(r,side);h=.16;d=t*.16
                for surface in [-1,1]:
                    z=4.25+surface*(d/2+h/2-.015)
                    c=cube(f'{kind}_{name}_energia_{j}_{surface}',[x0,y0,z-h/2],[x1,y1,z+h/2],faces_at(kind,field,x0,y0,x1,y1))
                    elements.append(c);raised['children'].append(c['uuid'])
            for j,r in enumerate(halo_rects):
                x0,y0,x1,y1,_=bounds(r,side)
                c=cube(f'{kind}_{name}_aura_{j}',[x0,y0,4.10],[x1,y1,4.40],faces_at(kind,field,x0,y0,x1,y1,88))
                elements.append(c);aura['children'].append(c['uuid'])
            if wing=='superior':
                # Raise the upper lobes as a whole, while keeping all texture
                # charts attached to their solid pieces and the rearward yaw.
                for c in elements[start_element:]:
                    c['rotation']=[0,0,side*(7.0 if kind=='azuis' else 5.0)]
                    c['origin']=[side*1.5,21.6,4.25]
            stats[name]={'cubos_volume':len(main_rects),'cubos_relevo':len(raised['children']),'cubos_halo':len(halo_rects),'passo_contorno':GRID,'espessura_corpo_maxima':round(float(depth.max()),3)}
    raw=io.BytesIO();image.save(raw,format='PNG')
    model={'meta':{'format_version':'4.10','model_format':'bedrock','box_uv':False},'name':'Asas_Azuis' if kind=='azuis' else 'Asas_Rosas','model_identifier':f'asas_teste.chamas_{kind}','visible_box':[7,7,2],'variable_placeholders':'','resolution':{'width':TEX,'height':TEX},'elements':elements,'outliner':[waist],'textures':[{'name':f'chamas_{kind}.png','id':'0','uuid':uid(kind+'_texture'),'width':TEX,'height':TEX,'uv_width':TEX,'uv_height':TEX,'mode':'bitmap','render_mode':'default','particle':False,'visible':True,'saved':True,'internal':True,'source':'data:image/png;base64,'+base64.b64encode(raw.getvalue()).decode()}],'animations':[],'animation_variable_placeholders':'','display':{}}
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
    return {'format_version':'1.12.0','minecraft:geometry':[{'description':{'identifier':'geometry.'+model['model_identifier'],'texture_width':TEX,'texture_height':TEX,'visible_bounds_width':7,'visible_bounds_height':7,'visible_bounds_offset':[0,2,0]},'bones':bones}]}

def archive_dir(folder,target,exclude=()):
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(folder.rglob('*')):
            if p.is_file() and not any(p.resolve().is_relative_to(Path(x).resolve()) for x in exclude):z.write(p,p.relative_to(folder).as_posix())

def make_packs():
    PROJECT.mkdir(parents=True,exist_ok=True)
    for directory in [BP,RP,PROJECT/'Modelos_Blockbench',PROJECT/'Ferramentas',PROJECT/'Previews']:
        directory.mkdir(parents=True,exist_ok=True)
    for pack,label,kind in [(BP,'Comportamentos','data'),(RP,'Recursos','resources')]:
        manifest={'format_version':2,'header':{'name':f'Asas 3D Teste | {label}','description':'Duas asas espirituais 3D: chamas azuis e asas rosas com amarelo. Versão estática 1.1.0 — silhuetas e texturas refeitas.','uuid':uid(kind+'_header'),'version':VERSION,'min_engine_version':[1,21,0]},'modules':[{'type':kind,'uuid':uid(kind+'_module'),'version':VERSION}],'metadata':{'authors':['Asas 3D Teste'],'product_type':'addon'}}
        if kind=='data':manifest['dependencies']=[{'uuid':uid('resources_header'),'version':VERSION}]
        write_json(pack/'manifest.json',manifest)
    summaries={}
    icons=[]
    for kind,display,file in [('azuis','Asas de Chamas Azuis','Asas_Azuis.bbmodel'),('rosas','Asas Espirituais Rosas','Asas_Rosas.bbmodel')]:
        image=make_texture(kind)
        texpath=RP/f'textures/entity/asas_teste/chamas_{kind}.png';texpath.parent.mkdir(parents=True,exist_ok=True);image.save(texpath)
        model,stats=make_model(kind,image);image.save(texpath);write_json(PROJECT/'Modelos_Blockbench'/file,model)
        geo=export_geo(model);write_json(RP/f'models/entity/chamas_{kind}.geo.json',geo)
        identifier=f'asas_teste:chamas_{kind}'
        write_json(BP/f'items/chamas_{kind}.json',{'format_version':'1.21.0','minecraft:item':{'description':{'identifier':identifier,'menu_category':{'category':'equipment','group':'itemGroup.name.chestplate'}},'components':{'minecraft:icon':{'textures':{'default':f'asas_teste_chamas_{kind}'}},'minecraft:display_name':{'value':f'item.{identifier}.name'},'minecraft:wearable':{'slot':'slot.armor.chest','protection':0,'dispensable':True},'minecraft:tags':{'tags':['minecraft:is_armor']}}}})
        write_json(RP/f'attachables/chamas_{kind}.json',{'format_version':'1.10.0','minecraft:attachable':{'description':{'identifier':identifier,'materials':{'default':'entity_alphatest','aura':'entity_alphablend'},'textures':{'default':f'textures/entity/asas_teste/chamas_{kind}'},'geometry':{'default':f'geometry.asas_teste.chamas_{kind}'},'render_controllers':['controller.render.asas_teste.static']}}})
        # Hand-drawn atlas crop is only the inventory icon, never the worn geometry.
        icon=image.crop((0,0,1024,992))
        icon.paste(icon.transpose(Image.Transpose.FLIP_LEFT_RIGHT).crop((0,0,512,992)),(0,0))
        icon.thumbnail((60,60),Image.Resampling.LANCZOS)
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
    archive_dir(PROJECT,target/'Asas_3D_Fontes_Completos.zip',exclude=[target,PROJECT/'Asas_3D_Teste_Bedrock.mcaddon',PROJECT/'Asas_3D_Fontes_Completos.zip'])
    return addon

if __name__=='__main__':
    args=argparse.ArgumentParser();args.add_argument('--package',type=Path);options=args.parse_args()
    print(json.dumps(make_packs(),ensure_ascii=False,indent=2))
    if options.package:print(package(options.package))
