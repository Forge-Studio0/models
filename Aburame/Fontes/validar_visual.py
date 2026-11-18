#!/usr/bin/env python3
"""Measure textured Aburame visibility against the native opaque player.

Rest pose only; no screenshots, preview images or Minecraft render claims.
"""
from pathlib import Path
import hashlib,json,math
import numpy as np
from PIL import Image
from construir_aburame import COAT_OPACITY,MODES,NATIVE_GEOS,RC_FILE

ROOT=Path(__file__).resolve().parents[1];RP=ROOT/'Integracao/RP'
VIEWS={'frente':(0,1,2,1),'costas':(0,-1,2,-1),'direita':(2,-1,0,-1),'esquerda':(2,1,0,1)}
RES=8;WIDTH=320;HEIGHT=320;MIN_X=-20;MIN_Y=-4

def rotate(angles):
    x,y,z=np.deg2rad(angles);cx,sx=np.cos(x),np.sin(x);cy,sy=np.cos(y),np.sin(y);cz,sz=np.cos(z),np.sin(z)
    return np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]])@np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]])@np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]])

def sample(cube,face,pixels,bone,bones):
    uv=cube['uv'][face];n=min(96,max(12,math.ceil(max(cube['size'])*RES*1.5)))
    coords=(np.arange(n)+.5)/n;u,v=np.meshgrid(coords,coords);u=u.ravel();v=v.ravel()
    w,h,d=cube['size'];zero=np.zeros_like(u)
    definitions={
      'north':(np.c_[u*w,(1-v)*h,zero],[0,0,-1]),
      'south':(np.c_[(1-u)*w,(1-v)*h,zero+d],[0,0,1]),
      'west':(np.c_[zero,(1-v)*h,(1-u)*d],[-1,0,0]),
      'east':(np.c_[zero+w,(1-v)*h,u*d],[1,0,0]),
      'up':(np.c_[u*w,zero+h,(1-v)*d],[0,1,0]),
      'down':(np.c_[u*w,zero,v*d],[0,-1,0])}
    points,normal=definitions[face];points+=np.array(cube['origin']);normal=np.array(normal,dtype=float)
    transforms=[cube];current=bone
    while current:
        transforms.append(current);current=bones.get(current.get('parent'))
    for transform in transforms:
        if not transform.get('rotation'):continue
        matrix=rotate(transform['rotation']);pivot=np.array(transform.get('pivot',[0,0,0]))
        points=(points-pivot)@matrix.T+pivot;normal=matrix@normal
    tu=np.clip(np.floor(uv['uv'][0]+u*uv['uv_size'][0]).astype(int),0,511)
    tv=np.clip(np.floor(uv['uv'][1]+v*uv['uv_size'][1]).astype(int),0,511)
    return points,normal,pixels[tv,tu,3].astype(float)/255

def projection_box(lo,hi,view):
    horizontal,sign,axis,direction=view
    return min(lo[horizontal]*sign,hi[horizontal]*sign),max(lo[horizontal]*sign,hi[horizontal]*sign),lo[1],hi[1],min(lo[axis]*direction,hi[axis]*direction)

def measure(geometry,pixels,boxes):
    bones={b['name']:b for b in geometry['bones']};result={}
    xx,yy=np.meshgrid(MIN_X+(np.arange(WIDTH)+.5)/RES,MIN_Y+(np.arange(HEIGHT)+.5)/RES)
    for label,view in VIEWS.items():
        image=np.zeros((HEIGHT,WIDTH));eligible=exposed_total=0
        for bone in bones.values():
            opacity=COAT_OPACITY if '_coat_' in bone['name'] else 1
            for cube in bone.get('cubes',[]):
                layer=np.zeros_like(image)
                for face in cube['uv']:
                    points,normal,alpha=sample(cube,face,pixels,bone,bones)
                    if normal[view[2]]*view[3]>=-.02:continue
                    if '_solid_' in bone['name'] or '_swarm_' in bone['name']:alpha=(alpha>=.5).astype(float)
                    px=points[:,view[0]]*view[1];py=points[:,1];depth=points[:,view[2]]*view[3]
                    nearest=np.full(len(points),np.inf)
                    for _,lo,hi in boxes:
                        left,right,bottom,top,front=projection_box(lo,hi,view)
                        hit=(px>=left)&(px<=right)&(py>=bottom)&(py<=top)
                        nearest[hit]=np.minimum(nearest[hit],front)
                    dense=alpha*opacity>=.15;exposed=dense&(depth<nearest-.025)
                    eligible+=int(dense.sum());exposed_total+=int(exposed.sum())
                    col=np.floor((px-MIN_X)*RES).astype(int);row=np.floor((py-MIN_Y)*RES).astype(int)
                    valid=exposed&(col>=0)&(col<WIDTH)&(row>=0)&(row<HEIGHT)
                    np.maximum.at(layer,(row[valid],col[valid]),alpha[valid]*opacity)
                image=1-(1-image)*(1-layer)
        regions={};skin=np.zeros_like(image,dtype=bool);footprint=image>=.15
        for name,lo,hi in boxes:
            left,right,bottom,top,_=projection_box(lo,hi,view)
            mask=(xx>=left)&(xx<=right)&(yy>=bottom)&(yy<=top)
            skin|=mask;regions[name]=float(footprint[mask].mean())
        result[label]={'pixels_visiveis':int(footprint.sum()),'pixels_fora_skin':int((footprint&~skin).sum()),'fracao_amostras_expostas':exposed_total/max(1,eligible),
          'cobertura_skin':float(footprint[skin].mean()),'cobertura_regioes':regions,
          'alfa_medio_sobre_skin':float(image[skin].mean()),'massa_alfa':float(image.sum()),
          'pixels_opacos':int((image>=.9).sum())}
    return result

def validate():
    sources={};results={}
    def read(path):
        data=(RP/path).read_bytes();sources[path]=hashlib.sha256(data).hexdigest();return data
    native=json.loads(read(NATIVE_GEOS[0]))['minecraft:geometry'][0];read(RC_FILE);boxes=[]
    for bone in native['bones']:
        assert not bone.get('rotation')
        for c in bone.get('cubes',[]):
            assert not c.get('rotation')
            pad=c.get('inflate',0)+.25
            lo=np.array(c['origin'])-pad;hi=np.array(c['origin'])+np.array(c['size'])+pad
            boxes.append((bone['name'],lo,hi))
    for mode,spec in MODES.items():
        geometry=json.loads(read(spec['path']))['minecraft:geometry'][0]
        texture=f'textures/entity/swbr/aburame/modo_{mode}.png';read(texture)
        results[str(mode)]=measure(geometry,np.array(Image.open(RP/texture).convert('RGBA')),boxes)
    # Persist diagnostics before assertions as well, so a failure is reviewable.
    report={'resultado':'EM_VERIFICACAO','minecraft_executado':False,'previas_criadas':False,
      'metodo':'Amostragem das faces, alfa real dos atlas, rotações dos cubos e hierarquia de bones. Quatro projeções ortográficas, pose base, ocultação pelas caixas nativas com margem de roupa de 0,25 unidade. Distância com opacidade plena; pulsação média.',
      'limites':'Compara as malhas e a camada de compatibilidade. A cor integrada às peles da SWBR é conferida separadamente em Validacao.json. Não simula cabelo, acessórios, poses em movimento, iluminação nem o renderizador Bedrock.',
      'modelos':results,'fontes_sha256':sources}
    target=ROOT/'Validacao_Visual_Estatica.json'
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    for label in VIEWS:
        for mode in MODES:
            assert results[str(mode)][label]['pixels_visiveis']>60,f'Modelo quase invisível: {mode}/{label}'
            assert results[str(mode)][label]['fracao_amostras_expostas']>.12,f'Peças em excesso dentro da skin: {mode}/{label}'
        for family in [(1,3,5),(2,4,6)]:
            a,b,c=[results[str(mode)][label]['pixels_visiveis'] for mode in family]
            assert b>a*1.12 and c>b*1.12,f'Progressão de densidade insuficiente: {family}/{label}'
        a,b,c=[results[str(mode)][label]['massa_alfa'] for mode in (1,3,5)]
        assert b>a*1.45 and c>b*1.7,f'Camadas comuns com densidades muito próximas: {label}'
        for mode in [1,2,3,4,5]:
            assert results[str(mode)][label]['cobertura_regioes']['head']<.12,f'Cabeça coberta sem autorização: {mode}/{label}'
        assert results['6'][label]['cobertura_skin']>.60,f'Revestimento final insuficiente: {label}'
    for mode in [2,4]:
        for label in ['frente','costas']:
            regions=results[str(mode)][label]['cobertura_regioes']
            assert min(regions['rightArm'],regions['leftArm'])>.35,f'Veneno não aparece nos braços: {mode}/{label}'
    report['resultado']='APROVADO';target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'resultado':'APROVADO','frente':{m:v['frente'] for m,v in results.items()}},ensure_ascii=False,indent=2))

if __name__=='__main__':validate()
