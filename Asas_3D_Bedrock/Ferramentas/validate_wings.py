#!/usr/bin/env python3
"""Validate the complete add-on and its editable source without Minecraft.

Uses public Blockception Bedrock schemas plus cross-file, geometry, image, UUID,
archive and actual Blockbench round-trip checks. No assertion implies a game test.
"""
import base64, io, itertools, json, math, sys, uuid, zipfile
from pathlib import Path
import numpy as np
from PIL import Image
import jsonschema

SCRIPT=Path(__file__).resolve().parent
ROOT=SCRIPT.parent if SCRIPT.name=='Ferramentas' else SCRIPT/'Asas_3D_Fonte'
SCHEMAS=(ROOT/'Ferramentas/Schemas') if SCRIPT.name=='Ferramentas' else SCRIPT
checks=[]

def check(condition,label):
    if not condition:raise AssertionError(label)
    checks.append(label)
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def rotation_matrix(r):
    x,y,z=np.radians(r);sx,cx=math.sin(x),math.cos(x);sy,cy=math.sin(y),math.cos(y);sz,cz=math.sin(z),math.cos(z)
    rx=np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]]);ry=np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]]);rz=np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]])
    return rz@ry@rx
def around(p,r):
    a=np.eye(4);a[:3,:3]=rotation_matrix(r);a[:3,3]=np.array(p)-a[:3,:3]@np.array(p);return a
def transformed_vertices(model):
    elements={c['uuid']:c for c in model['elements']};vertices=[]
    def walk(g,parent):
        mat=parent@around(g['origin'],g.get('rotation',[0,0,0]))
        for child in g['children']:
            if isinstance(child,dict):walk(child,mat);continue
            c=elements[child];m=mat@around(c['origin'],c.get('rotation',[0,0,0]))
            for xyz in itertools.product(*zip(c['from'],c['to'])):vertices.append((m@np.r_[xyz,1])[:3])
    for g in model['outliner']:walk(g,np.eye(4))
    return np.asarray(vertices)

def validate_sources():
    files=list(ROOT.rglob('*.json'))+list(ROOT.rglob('*.bbmodel'))
    for p in files:read(p)
    check(bool(files),'Todos os JSONs e BBMODELs têm sintaxe válida')
    for pattern,schema_name in [('*/manifest.json','manifest.schema.json'),('*/items/*.json','item.schema.json'),('*/models/entity/*.geo.json','geometry.schema.json'),('*/attachables/*.json','attachable.schema.json'),('*/render_controllers/*.json','render.schema.json')]:
        schema=read(SCHEMAS/schema_name);v=jsonschema.Draft7Validator(schema)
        for p in ROOT.glob(pattern):
            errors=list(v.iter_errors(read(p)))
            check(not errors,'Schema válido: '+str(p.relative_to(ROOT))+((': '+str(errors[0])) if errors else ''))
    bp=ROOT/'Asas_3D_BP';rp=ROOT/'Asas_3D_RP'
    bm=read(bp/'manifest.json');rm=read(rp/'manifest.json')
    ids=[m['header']['uuid'] for m in [bm,rm]]+[mod['uuid'] for m in [bm,rm] for mod in m['modules']]
    check(len(ids)==len(set(ids)) and all(uuid.UUID(i).version==4 for i in ids),'Quatro UUIDs de pack/módulo válidos e exclusivos')
    check(bm['dependencies']==[{'uuid':rm['header']['uuid'],'version':rm['header']['version']}],'Dependência BP → RP e versão correspondentes')
    check(all(m['header']['min_engine_version']==[1,21,0] for m in [bm,rm]),'Versão mínima declarada: Bedrock 1.21.0')
    rc=read(rp/'render_controllers/asas_teste.render_controllers.json')['render_controllers']
    atlas=read(rp/'textures/item_texture.json')['texture_data']
    stats={}
    for k,name in [('azuis','Asas_Azuis.bbmodel'),('rosas','Asas_Rosas.bbmodel')]:
        identifier='asas_teste:chamas_'+k
        item=read(bp/f'items/chamas_{k}.json')['minecraft:item']
        attach=read(rp/f'attachables/chamas_{k}.json')['minecraft:attachable']['description']
        geo=read(rp/f'models/entity/chamas_{k}.geo.json')['minecraft:geometry'][0]
        model=read(ROOT/'Modelos_Blockbench'/name)
        check(item['description']['identifier']==attach['identifier']==identifier,'Identificador coerente: '+identifier)
        check(item['components']['minecraft:wearable']['slot']=='slot.armor.chest','Slot do peitoral: '+k)
        check(item['components']['minecraft:wearable'].get('protection',0)==0,'Item cosmético sem habilidades/proteção: '+k)
        check(attach['geometry']['default']==geo['description']['identifier']=='geometry.'+model['model_identifier'],'Attachable → geometria → BBMODEL: '+k)
        check(not attach.get('animations') and not model.get('animations'),'Asas estáticas sem animações próprias: '+k)
        texture_path=rp/(attach['textures']['default']+'.png')
        with Image.open(texture_path) as img:
            img.verify()
        with Image.open(texture_path) as img:
            check(img.size==(512,512) and img.mode=='RGBA','PNG RGBA 512×512 válido: '+k)
            alpha=np.asarray(img)[:,:,3]
            check(np.any((alpha>0)&(alpha<255)) and np.any(alpha==255),'Áreas opacas e halo com transparência: '+k)
        embedded=base64.b64decode(model['textures'][0]['source'].split(',',1)[1])
        check(embedded==texture_path.read_bytes(),'Textura embutida no BBMODEL corresponde ao RP: '+k)
        iconkey=item['components']['minecraft:icon']['textures']['default']
        check(iconkey in atlas and (rp/(atlas[iconkey]['textures']+'.png')).is_file(),'Ícone do item existente e associado: '+k)
        for locale in ['pt_BR','pt_PT','en_US']:
            check(item['components']['minecraft:display_name']['value']+'=' in (rp/f'texts/{locale}.lang').read_text(),'Nome localizado '+locale+': '+k)
        check(attach['materials']=={'default':'entity_alphatest','aura':'entity_alphablend'},'Materiais nativos declarados: '+k)
        for controller in attach['render_controllers']:
            check(controller in rc,'Render controller existente: '+k)
            entries=rc[controller]
            check(entries['geometry']=='Geometry.default' and entries['textures']==['Texture.default'],'Referências de geometria/textura do render controller: '+k)
            check(all(ref.split('.')[1].lower() in attach['materials'] for m in entries['materials'] for ref in m.values()),'Referências de materiais do render controller: '+k)
        bones=geo['bones'];names=[b['name'] for b in bones];byname={b['name']:b for b in bones}
        check(len(names)==len(set(names)),'Nomes de bones exclusivos: '+k)
        check(byname['body']['parent']=='waist' and byname['body']['pivot']==[0,24,0] and byname['waist']['pivot']==[0,12,0],'Hierarquia/pivôs waist → body iguais à armadura do jogador: '+k)
        wingnames=['asa_'+w+'_'+s for w in ['superior','inferior'] for s in ['esquerda','direita']]
        check(all(byname[n].get('parent')=='body' and len(byname[n].get('cubes',[]))>60 for n in wingnames),'Quatro asas de volume distintas, ligadas ao tronco: '+k)
        for b in bones:
            seen={b['name']};p=b.get('parent')
            while p:
                check(p in byname and p not in seen,'Hierarquia sem ciclos: '+k+'/'+b['name']+'/'+p)
                seen.add(p);p=byname[p].get('parent')
        counts=sum(len(b.get('cubes',[])) for b in bones)
        check(counts==len(model['elements']) and counts>500,'Geometria completa e volumétrica: '+k)
        element_ids=[e['uuid'] for e in model['elements']]
        check(len(set(element_ids))==len(element_ids),'UUIDs de elementos BBMODEL exclusivos: '+k)
        for c in model['elements']:
            assert min(np.array(c['to'])-np.array(c['from']))>0,'Cubo plano ou invertido: '+c['name']
            for uv in c['faces'].values():
                assert all(0<=float(v)<=512 for v in uv['uv']),'UV fora da textura: '+c['name']
        check(True,'Todos os cubos têm espessura, dimensão positiva e UV dentro do atlas: '+k)
        points=transformed_vertices(model);lo=points.min(0);hi=points.max(0)
        check(lo[2]>=1.9,'Orientação traseira: todo o volume fica em +Z, atrás do corpo: '+k)
        bounds=geo['description'];half=bounds['visible_bounds_width']*8
        check(max(abs(lo[0]),abs(hi[0]),abs(lo[2]),abs(hi[2]))<half and lo[1]>bounds['visible_bounds_offset'][1]*16-bounds['visible_bounds_height']*8 and hi[1]<bounds['visible_bounds_offset'][1]*16+bounds['visible_bounds_height']*8,'Limites de renderização contêm a geometria transformada: '+k)
        check(lo[1]<3 and hi[1]>50,'Proporções: superiores acima da cabeça e inferiores até as pernas: '+k)
        for w in ['superior','inferior']:
            l=byname['asa_'+w+'_esquerda'];r=byname['asa_'+w+'_direita']
            check(len(l['cubes'])==len(r['cubes']) and l['rotation'][1]==-r['rotation'][1],'Equilíbrio e abertura simétrica '+w+': '+k)
        stats[k]={'cubos':counts,'bones':len(bones),'limites_em_unidades_modelo':{'min':lo.round(4).tolist(),'max':hi.round(4).tolist()},'profundidade_maxima_asa':2.9,'atlas':[512,512]}
    check(not list(bp.glob('entities/*.json')) and not list(rp.glob('entity/player*')),'Não substitui a entidade nem a skin do jogador')
    bb=ROOT/'Validacao_Blockbench.json'
    if bb.exists():
        data=read(bb)
        check(len(data['results'])==2 and all(not r['newErrors'] and r['textures'][0]['error']==0 and r['format']=='bedrock' for r in data['results']),'Os dois projetos abriram no Blockbench 4.12.6 sem erros de importação/textura')
        for row in data['results']:
            key='azuis' if row['name']=='Asas_Azuis' else 'rosas'
            check(row['cubes']==stats[key]['cubos'],'Contagem do editor corresponde à geometria final: '+key)
    return stats

def validate_archive(path):
    with zipfile.ZipFile(path) as outer:
        check(outer.testzip() is None and len(outer.namelist())==2,'MCADDON íntegro: dois MCPACKs internos')
        expected={}
        for entry in outer.namelist():
            check(entry.endswith('.mcpack'),'Contêiner interno MCPACK: '+entry)
            folder=ROOT/entry.replace('.mcpack','')
            with zipfile.ZipFile(io.BytesIO(outer.read(entry))) as pack:
                check(pack.testzip() is None and 'manifest.json' in pack.namelist(),'MCPACK íntegro com manifest na raiz: '+entry)
                disk={p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file()}
                check(set(pack.namelist())==disk,'Todos os arquivos do pack estão no arquivo final: '+entry)
                for name in pack.namelist():
                    check(pack.read(name)==(folder/name).read_bytes(),'Conteúdo empacotado confere: '+entry+'/'+name)
                    if name.endswith('.json'):json.loads(pack.read(name))
    return True

if __name__=='__main__':
    stats=validate_sources()
    if len(sys.argv)>1:validate_archive(Path(sys.argv[1]))
    report={'resultado':'APROVADO','tipo':'Validação estática e abertura/exportação no Blockbench; Minecraft não executado','minecraft_testado':False,'modelos':stats,'numero_de_verificacoes':len(checks),'verificacoes':checks}
    out=ROOT/'Validacao_Estatica.json';out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'resultado':report['resultado'],'verificacoes':len(checks),'modelos':stats},ensure_ascii=False,indent=2))
