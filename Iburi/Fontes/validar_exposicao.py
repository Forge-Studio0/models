#!/usr/bin/env python3
"""Sample textured smoke faces against the opaque SWBR player in its rest pose.

This is an orthographic occlusion/coverage check, not a Bedrock renderer. It
uses actual cube transforms, atlas alpha and player boxes with a 0.25-unit
clothing margin. No previews are generated. Optional baseline compares v67.
"""
from pathlib import Path
import argparse,hashlib,io,json,math,zipfile
import numpy as np
from PIL import Image
from construir_iburi import GEO_PATHS,NATIVE_GEOS,read_base

ROOT=Path(__file__).resolve().parents[1]
RP=ROOT/'Integracao/RP'
VIEWS={'frente':(0,1,2,1),'costas':(0,-1,2,-1),'lado_direito':(2,-1,0,-1),'lado_esquerdo':(2,1,0,1)}
# Supersample densely enough to fill projected texels of the largest cube.
RESOLUTION=8;WIDTH=256;HEIGHT=320;MIN_X=-16;MIN_Y=-4;SAMPLES=96

def checksum(data):return hashlib.sha256(data).hexdigest()
def rotation_matrix(angles):
    x,y,z=np.deg2rad(angles);cx,sx=np.cos(x),np.sin(x);cy,sy=np.cos(y),np.sin(y);cz,sz=np.cos(z),np.sin(z)
    return np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]])@np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]])@np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]])

def skin_boxes(geometry):
    result=[]
    for bone in geometry['bones']:
        assert not bone.get('rotation')
        for cube in bone.get('cubes',[]):
            assert not cube.get('rotation')
            padding=cube.get('inflate',0)+.25
            minimum=np.array(cube['origin'],dtype=float)-padding
            maximum=np.array(cube['origin'],dtype=float)+np.array(cube['size'])+padding
            result.append((bone['name'],minimum,maximum))
    return result

def face_samples(cube,face,pixels):
    uv=cube['uv'][face];coordinates=(np.arange(SAMPLES)+.5)/SAMPLES
    u,v=np.meshgrid(coordinates,coordinates);u=u.ravel();v=v.ravel()
    w,h,d=cube['size'];zeros=np.zeros_like(u)
    definitions={
      'north':(np.c_[u*w,(1-v)*h,zeros],[0,0,-1]),
      'south':(np.c_[(1-u)*w,(1-v)*h,zeros+d],[0,0,1]),
      'west':(np.c_[zeros,(1-v)*h,(1-u)*d],[-1,0,0]),
      'east':(np.c_[zeros+w,(1-v)*h,u*d],[1,0,0]),
      'up':(np.c_[u*w,zeros+h,(1-v)*d],[0,1,0]),
      'down':(np.c_[u*w,zeros,v*d],[0,-1,0])}
    points,normal=definitions[face];points+=np.array(cube['origin'])
    matrix=rotation_matrix(cube.get('rotation',[0,0,0]));pivot=np.array(cube.get('pivot',[0,0,0]))
    points=(points-pivot)@matrix.T+pivot;normal=matrix@normal
    tex_u=np.clip(np.floor(uv['uv'][0]+u*uv['uv_size'][0]).astype(int),0,pixels.shape[1]-1)
    tex_v=np.clip(np.floor(uv['uv'][1]+v*uv['uv_size'][1]).astype(int),0,pixels.shape[0]-1)
    return points,normal,pixels[tex_v,tex_u,3].astype(float)/255

def project(points,view):
    horizontal,sign,depth,depth_sign=view
    return points[:,horizontal]*sign,points[:,1],points[:,depth]*depth_sign

def projected_box(minimum,maximum,view):
    horizontal,sign,depth,depth_sign=view
    return min(minimum[horizontal]*sign,maximum[horizontal]*sign),max(minimum[horizontal]*sign,maximum[horizontal]*sign),minimum[1],maximum[1],min(minimum[depth]*depth_sign,maximum[depth]*depth_sign)

def masks(boxes,view):
    xx,yy=np.meshgrid(MIN_X+(np.arange(WIDTH)+.5)/RESOLUTION,MIN_Y+(np.arange(HEIGHT)+.5)/RESOLUTION)
    all_skin=np.zeros((HEIGHT,WIDTH),dtype=bool);regions={}
    for name,minimum,maximum in boxes:
        left,right,bottom,top,_=projected_box(minimum,maximum,view)
        mask=(xx>=left)&(xx<=right)&(yy>=bottom)&(yy<=top)
        all_skin|=mask;regions[name]=regions.get(name,np.zeros_like(mask))|mask
    return all_skin,regions

def measure(geometry,pixels,boxes,core_alpha):
    core=[b for b in geometry['bones'] if b.get('cubes') and '_core_' in b['name']]
    result={}
    for label,view in VIEWS.items():
        image=np.zeros((HEIGHT,WIDTH),dtype=float);visible_samples=0;eligible_samples=0
        for bone in core:
            for cube in bone['cubes']:
                layer=np.zeros_like(image)
                for face in cube['uv']:
                    points,normal,alpha=face_samples(cube,face,pixels)
                    if normal[view[2]]*view[3]>=-.02:continue
                    px,py,depth=project(points,view);nearest=np.full(len(points),np.inf)
                    for _,minimum,maximum in boxes:
                        left,right,bottom,top,front=projected_box(minimum,maximum,view)
                        covered=(px>=left)&(px<=right)&(py>=bottom)&(py<=top)
                        nearest[covered]=np.minimum(nearest[covered],front)
                    substantial=alpha*core_alpha>=.15
                    exposed=(depth<nearest-.025)&substantial
                    eligible_samples+=int(substantial.sum());visible_samples+=int(exposed.sum())
                    columns=np.floor((px-MIN_X)*RESOLUTION).astype(int);rows=np.floor((py-MIN_Y)*RESOLUTION).astype(int)
                    valid=exposed&(columns>=0)&(columns<WIDTH)&(rows>=0)&(rows<HEIGHT)
                    np.maximum.at(layer,(rows[valid],columns[valid]),alpha[valid]*core_alpha)
                image=1-(1-image)*(1-layer)
        skin,regions=masks(boxes,view);footprint=image>=.15
        result[label]={
          'amostras_visiveis':visible_samples,'amostras_densas':eligible_samples,
          'fracao_amostras_expostas':visible_samples/max(eligible_samples,1),
          'pixels_fumaca':int(footprint.sum()),'pixels_fora_da_skin':int((footprint&~skin).sum()),
          'cobertura_skin':float(footprint[skin].mean()),'alfa_medio_sobre_skin':float(image[skin].mean()),
          'cobertura_por_regiao':{name:float(footprint[mask].mean()) for name,mask in regions.items() if mask.any()}}
    return result

def validate(baseline=None):
    native=json.loads((RP/NATIVE_GEOS[0]).read_text())['minecraft:geometry'][0];boxes=skin_boxes(native)
    results={};sources={name:checksum((RP/name).read_bytes()) for name in [NATIVE_GEOS[0],'models/entity/swbr_iburi_draw.geo.json','render_controllers/swbr_iburi_transformacoes.json']};old_results={}
    rc=json.loads((RP/'render_controllers/swbr_iburi_transformacoes.json').read_text())['render_controllers']
    old=read_base(baseline)['RP'][1] if baseline else None
    for stage in [1,2,3]:
        geometry_file=GEO_PATHS[stage];texture_file=f'textures/entity/swbr/iburi/fumaca{stage}.png'
        geometry=json.loads((RP/geometry_file).read_text())['minecraft:geometry'][0]
        pixels=np.array(Image.open(RP/texture_file).convert('RGBA'))
        core_alpha=float(rc[f'controller.render.swbr.iburi{stage}.core']['color']['a'].split('*')[0].strip())
        results[str(stage)]=measure(geometry,pixels,boxes,core_alpha)
        for name in [geometry_file,texture_file]:sources[name]=checksum((RP/name).read_bytes())
        if old:
            old_geo=json.loads(old[geometry_file])['minecraft:geometry'][0]
            old_pixels=np.array(Image.open(io.BytesIO(old[texture_file])).convert('RGBA'))
            old_alpha={1:.68,2:.73,3:.78}[stage]
            old_results[str(stage)]=measure(old_geo,old_pixels,boxes,old_alpha)
    for view in VIEWS:
        first,second,third=[results[str(stage)][view] for stage in [1,2,3]]
        assert first['pixels_fumaca']>150,f'Nível 1 quase invisível: {view}'
        assert second['pixels_fumaca']>first['pixels_fumaca']*1.15,f'Nível 2 sem progressão suficiente: {view}'
        assert third['pixels_fumaca']>second['pixels_fumaca']*1.05,f'Nível 3 sem progressão suficiente: {view}'
        assert second['cobertura_skin']>first['cobertura_skin']+.08,f'Cobertura insuficiente no nível 2: {view}'
        assert third['cobertura_skin']>second['cobertura_skin']+.08,f'Cobertura insuficiente no nível 3: {view}'
        assert third['cobertura_por_regiao']['head']>.25,f'Cabeça permanece quase sem fumaça: {view}'
        for stage in [1,2,3]:
            assert results[str(stage)][view]['fracao_amostras_expostas']>.2,f'Nuvens ocultas pela skin: {stage}/{view}'
    report={'resultado':'APROVADO','minecraft_executado':False,
      'metodo':'Amostras das faces texturizadas e rotacionadas dos volumes permanentes. Ocultação pela geometria opaca real da addon, pose base e margem de roupa de 0,25 unidade. Composição alfa aproximada ortográfica.',
      'limites':'Não inclui cabelo/modelos adicionais, poses em movimento, ordenação do Bedrock ou seu material nativo. Não é render do jogo. Compara geometrias em opacidade plena de distância, sem as camadas transitórias.',
      'atual':results,'base_18_11_67':old_results,'base_sha256':checksum(baseline.read_bytes()) if baseline else None,'fontes_sha256':sources}
    (ROOT/'Validacao_Exposicao.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'resultado':report['resultado'],'frente':{s:{k:round(v,4) if isinstance(v,float) else v for k,v in m['frente'].items() if k in ['fracao_amostras_expostas','pixels_fumaca','cobertura_skin','alfa_medio_sobre_skin']} for s,m in results.items()},
      'frente_18_11_67':{s:{k:round(v,4) if isinstance(v,float) else v for k,v in m['frente'].items() if k in ['fracao_amostras_expostas','pixels_fumaca','cobertura_skin']} for s,m in old_results.items()}},ensure_ascii=False,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--baseline',type=Path);args=parser.parse_args();validate(args.baseline)
