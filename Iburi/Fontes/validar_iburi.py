#!/usr/bin/env python3
"""Audit pack preservation, player-owned visuals and the camera regression checks."""
from pathlib import Path
import argparse,base64,copy,hashlib,io,json,re,zipfile
import numpy as np
from PIL import Image
import jsonschema
from construir_iburi import VERSION,GEO_PATHS,NATIVE_GEOS,SLOT_GEO,DRAW_GEO,REGISTRY,LEGACY_HIDE_SCRIPTS,PLAYER_SCRIPTS

ROOT=Path(__file__).resolve().parents[1]
CHECKS=[]
def check(value,label):
    if not value:raise AssertionError(label)
    CHECKS.append(label)
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def digest(data):return hashlib.sha256(data).hexdigest()
def pack_files(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert z.testzip() is None and len(z.namelist())==len(set(z.namelist()))
        return {n:z.read(n) for n in z.namelist() if not n.endswith('/')}
def clean_player(entity):
    result=copy.deepcopy(entity);d=result['minecraft:client_entity']['description']
    for section in ['materials','textures','geometry','animations','particle_effects']:
        d[section]={k:v for k,v in d.get(section,{}).items() if not k.startswith('swbr_iburi')}
    d['scripts']['pre_animation']=[s for s in d['scripts']['pre_animation'] if s not in LEGACY_HIDE_SCRIPTS and not s.startswith('v.swbr_iburi_')]
    d['scripts']['animate']=[a for a in d['scripts']['animate'] if not any(k.startswith('swbr_iburi') for k in ([a] if isinstance(a,str) else a))]
    d['render_controllers']=[c for c in d['render_controllers'] if not any(k.startswith('controller.render.swbr.iburi') for k in ([c] if isinstance(c,str) else c))]
    return result
def clean_locators(geometry):
    result=copy.deepcopy(geometry)
    for g in result['minecraft:geometry']:
        for b in g['bones']:
            if 'locators' not in b:continue
            b['locators']={k:v for k,v in b['locators'].items() if not k.startswith('swbr_iburi_')}
            if not b['locators']:b.pop('locators')
    return result

def validate(base,addon,report_path=None):
    CHECKS.clear();manifest=read(ROOT/'Integracao_Manifesto.json');base_hash=digest(base.read_bytes())
    entries={p:v['original_entry'] for p,v in manifest['packs'].items()}
    if base_hash!=manifest['base_sha256']:
        compatible=next((b for b in manifest.get('compatible_bases',[]) if b['base_sha256']==base_hash),None)
        assert compatible is not None;entries=compatible['pack_entries']
    check(True,'Base reconhecida por SHA-256')
    with zipfile.ZipFile(base) as z:old_outer={n:z.read(n) for n in z.namelist()}
    with zipfile.ZipFile(addon) as z:
        check(z.testzip() is None and len(z.namelist())==len(set(z.namelist())),'MCADDON íntegro, sem falhas CRC ou entradas duplicadas')
        new_outer={n:z.read(n) for n in z.namelist()}
    old={};new={};preserved={};modified={};added={}
    for pack,config in manifest['packs'].items():
        a=pack_files(old_outer[entries[pack]]);b=pack_files(new_outer[config['updated_entry']]);old[pack]=a;new[pack]=b
        changed={n for n in a if a[n]!=b.get(n)};allowed=set(config['files'])
        check(set(a)<=set(b) and changed<=allowed and set(b)-set(a)==allowed-set(a),'Alterações limitadas ao overlay, sem exclusões: '+pack)
        for name,checksum in config['files'].items():
            source=(ROOT/'Integracao'/pack/name).read_bytes()
            check(b[name]==source and digest(source)==checksum,'Overlay e assinatura conferidos: '+pack+'/'+name)
            if name.endswith('.json'):json.loads(b[name])
        preserved[pack]=sum(a[n]==b[n] for n in a);modified[pack]=sorted(changed);added[pack]=sorted(set(b)-set(a))
        before=json.loads(a['manifest.json']);after=json.loads(b['manifest.json'])
        check(after['header']['version']==VERSION and all(m['version']==VERSION for m in after['modules']),'Versão 18.11.68 nos manifests: '+pack)
        normalized=copy.deepcopy(after)
        for key in ['name','description','version']:normalized['header'][key]=before['header'][key]
        for m,o in zip(normalized['modules'],before['modules']):m['version']=o['version']
        for dep,o in zip(normalized.get('dependencies',[]),before.get('dependencies',[])):
            if dep.get('uuid') in ['82dafe0d-c36f-4665-9df0-371f6d8b2a55','ef513a51-2cb2-4cc5-b300-5ef44201c3f5']:dep['version']=o['version']
        check(normalized==before,'UUIDs, engine, APIs e dependências preservados: '+pack)
    for name,data in old_outer.items():
        if name not in [*entries.values(),'LEIA-ME_IBURI.md']:check(new_outer[name]==data,'Entrada externa preservada: '+name)
    bp,rp=new['BP'],new['RP'];bp_old,rp_old=old['BP'],old['RP']
    check(all(bp[n]==data for n,data in bp_old.items() if n not in ['manifest.json',REGISTRY]),'Todos os itens, scripts de câmera, física, atributos, menus e jutsus preservados byte a byte')
    def labels(data):return re.sub(r'(id: "nz:modo_iburi[123]",[\s\S]*?nome: )"[^"\n]+"',r'\1"<NOME>"',data.decode())
    check(labels(bp[REGISTRY])==labels(bp_old[REGISTRY]),'Registro de combate: somente nomes de apresentação Iburi podem diferir')
    levels=[]
    for stage in [1,2,3]:
        item=json.loads(bp[f'items/nz_modo_iburi{stage}.json'])['minecraft:item']
        check(item['description']['identifier']==f'nz:modo_iburi{stage}' and item['components']['minecraft:wearable']['slot']=='slot.armor.head','Identificador e slot da cabeça preservados: '+str(stage))
        match=re.search(r'id:\s*"nz:modo_iburi'+str(stage)+r'"[^\n]+lvl:\s*(\d+)',bp['scripts/menu/config.js'].decode());assert match
        levels.append(int(match.group(1)))
    check(levels==[10,15,25],'Níveis 10/15/25 preservados')
    for name in manifest['packs']['RP']['files']:
        if name.startswith('texts/') and name.endswith('.lang'):
            def normalize(data):return re.sub(r'(?m)^(item\.nz:modo_iburi[123](?:\.name)?=)[^\r\n]*',r'\1<NOME>',data.decode())
            check(normalize(rp[name])==normalize(rp_old[name]),'Demais nomes e traduções preservados: '+name)
    player=json.loads(rp['entity/player.entity.json']);d=player['minecraft:client_entity']['description']
    check(clean_player(player)==clean_player(json.loads(rp_old['entity/player.entity.json'])),'Jogador preservado fora dos vínculos visuais exclusivos do Iburi')
    check(d['scripts']['pre_animation'][-len(PLAYER_SCRIPTS):]==PLAYER_SCRIPTS,'Programa de câmera executado depois dos indicadores nativos SWBR')
    check(not any('swbr_iburi_total' in s for s in d['scripts']['pre_animation']),'Nenhuma ocultação do corpo ou cabelo adicionada pelo Iburi')
    check(d['materials']['swbr_iburi_smoke']=='entity_alphablend','Fumaça usa material nativo translúcido sem alterar os materiais existentes')
    native_locators={};source_rig=None
    for name in NATIVE_GEOS:
        geom=json.loads(rp[name]);before=json.loads(rp_old[name])
        check(clean_locators(geom)==clean_locators(before),'Geometria humana preservada, exceto locators exclusivos: '+name)
        if source_rig is None:source_rig={b['name']:b for b in geom['minecraft:geometry'][0]['bones']}
        for b in geom['minecraft:geometry'][0]['bones']:
            native_locators.update(b.get('locators',{}))
    schemas=ROOT/'Fontes/Schemas'
    for pattern,schema in [('*/manifest.json','manifest'),('RP/models/entity/**/*.json','geometry'),('RP/attachables/*.json','attachable'),('RP/animations/*.json','animation'),('RP/animation_controllers/*.json','animation_controller'),('RP/particles/*.json','particle'),('RP/render_controllers/*.json','render')]:
        validator=jsonschema.Draft7Validator(read(schemas/(schema+'.json')))
        for path in (ROOT/'Integracao').glob(pattern):
            errors=list(validator.iter_errors(read(path)))
            check(not errors,'Schema: '+str(path.relative_to(ROOT))+(' '+errors[0].message if errors else ''))
    controllers=json.loads(rp['render_controllers/swbr_iburi_transformacoes.json'])['render_controllers']
    draw_list=json.loads(rp[DRAW_GEO])['minecraft:geometry'];draws={g['description']['identifier']:g for g in draw_list}
    check(len(draw_list)==len(draws)==21,'21 geometrias exclusivas, uma por camada de renderização')
    fx=json.loads(rp['animation_controllers/swbr_iburi_fumaca.json'])['animation_controllers']
    check(d['animations']['swbr_iburi_fx'] in fx and d['scripts']['animate'].count('swbr_iburi_fx')==1,'Controlador de partículas pertence ao jogador e possui uma única instância')
    fx=fx[d['animations']['swbr_iburi_fx']]
    slot=json.loads(rp[SLOT_GEO])['minecraft:geometry'][0]
    check(slot['description']['identifier']=='geometry.swbr.iburi.slot' and not any(b.get('cubes') for b in slot['bones']),'Attachable de slot vazio: nenhuma malha pode envolver a câmera ou a mão')
    own_controllers={key:value for c in d['render_controllers'] if isinstance(c,dict) for key,value in c.items() if key.startswith('controller.render.swbr.iburi')}
    check(len(own_controllers)==21,'21 passes de fumaça controlados integralmente pelo jogador')
    editors=read(ROOT/'Validacao_Blockbench.json')['results'];summary={}
    for stage in [1,2,3]:
        suffix=str(stage);prefix='swbr_iburi'+suffix
        geo=json.loads(rp[GEO_PATHS[stage]])['minecraft:geometry'][0]
        attach=json.loads(rp[f'attachables/nz_modo_iburi{stage}.json'])['minecraft:attachable']['description']
        anim_path=f'animations/nz_modo_iburi{stage}.idle.json';anims=json.loads(rp[anim_path])['animations'];anim=anims[d['animations'][prefix+'_idle']]
        check(attach['identifier']==f'nz:modo_iburi{stage}' and attach['geometry']['default']==slot['description']['identifier'] and attach['render_controllers']==['controller.render.swbr.iburi.slot'],'Item ligado somente à geometria vazia: '+suffix)
        check(not any(attach.get(k) for k in ['animations','particle_effects','scripts']),'Nenhuma emissão, animação ou fumaça no contexto do item: '+suffix)
        check(geo['description']['identifier']==f'geometry.nz_modo_iburi{stage}' and prefix not in d['geometry'],'Modelo unificado reservado para edição; jogador usa somente as camadas: '+suffix)
        check({prefix+'_idle':f'v.swbr_iburi_draw{stage}'} in d['scripts']['animate'],'Animação vinculada ao modo e à câmera nativa: '+suffix)
        for identifier,folder in [(geo['description']['identifier'],'models/'),(d['animations'][prefix+'_idle'],'animations/')]:
            pattern=rb'"'+identifier.encode()+rb'"\s*:' if folder=='animations/' else rb'"identifier"\s*:\s*"'+identifier.encode()+rb'"'
            check(sum(bool(re.search(pattern,data)) for name,data in rp.items() if name.startswith(folder) and name.endswith('.json'))==1,'Identificador exclusivo no pack: '+identifier)
        bones={b['name']:b for b in geo['bones']};names=set(bones);leaves={n for n,b in bones.items() if b.get('cubes')}
        check(len(names)==len(geo['bones']),'Bones exclusivos: '+suffix)
        for n,b in bones.items():
            seen={n};parent=b.get('parent')
            while parent:
                assert parent in bones and parent not in seen;seen.add(parent);parent=bones[parent].get('parent')
            for cube in b.get('cubes',[]):
                assert min(cube['size'])>0
                for face in cube['uv'].values():
                    u,v=face['uv'];du,dv=face['uv_size'];assert all(0<=a<=512 for a in [u,v,u+du,v+dv])
        check(True,'Hierarquia, espessura e UVs válidos: '+suffix)
        rig=['root','waist','body','head','rightArm','leftArm','rightLeg','leftLeg']
        check(all(bones[n].get('parent')==source_rig[n].get('parent') and bones[n]['pivot']==source_rig[n]['pivot'] for n in rig),'Rig e pivôs correspondem ao jogador: '+suffix)
        check(set(anim['bones'])==leaves and all(n.startswith(prefix+'_') for n in anim['bones']),'Animações só alteram os filhos privados de cada nível: '+suffix)
        selected=set()
        for index,label in enumerate(['core','p0','p1','p2','p3','p4','p5']):
            identifier=f'controller.render.swbr.iburi{stage}.{label}';rc=controllers[identifier]
            check(own_controllers[identifier]==f'v.swbr_iburi_draw{stage}','Bloqueio da câmera no controlador inteiro: '+identifier)
            expected={n for n in leaves if n.startswith(prefix+'_'+label+'_')}
            alias=prefix+'_'+label;part=draws[d['geometry'][alias]];part_bones={b['name']:b for b in part['bones']}
            visible={n for n,b in part_bones.items() if b.get('cubes')}
            check(visible==expected and bool(visible) and not selected&visible,'Camada com geometria própria, sem duplicação: '+identifier);selected.update(visible)
            check(all(part_bones[n]==bones[n] for n in visible) and all(not b.get('parent') or b['parent'] in part_bones for b in part_bones.values()),'Cubos, transforms e cadeia de pais correspondem ao modelo editável: '+identifier)
            check('part_visibility' not in rc and len(part_bones)<=64,'Sem máscaras concorrentes e até 64 bones por malha: '+identifier)
            check(rc['geometry']=='Geometry.'+alias and rc['textures']==['Texture.'+prefix] and rc['materials']==[{'*':'Material.swbr_iburi_smoke'}],'Aliases exclusivos de geometria, material e textura resolvem: '+identifier)
        check(selected==leaves,'Cada nuvem tem exatamente um passe: '+suffix)
        core=[b for n,b in bones.items() if n.startswith(prefix+'_core_')]
        check(all(min(b['cubes'][0]['size'])>1.5 and len(b['cubes'][0]['uv'])==6 for b in core),'Volumes com seis faces e espessura: '+suffix)
        regions={'body','rightArm','leftArm'}|({'rightLeg','leftLeg'} if stage>=2 else set())|({'head'} if stage==3 else set())
        check(regions<={b['parent'] for b in core},'Fumaça distribuída nas regiões necessárias: '+suffix)
        texture=d['textures'][prefix]+'.png';pixels=np.array(Image.open(io.BytesIO(rp[texture])).convert('RGBA'))
        check(pixels.shape==(512,512,4) and np.array_equal(pixels[:,:,0],pixels[:,:,1]) and np.array_equal(pixels[:,:,1],pixels[:,:,2]),'Atlas 512×512 estritamente cinza: '+suffix)
        tiles=[]
        for row in range(4):
            for col in range(4):
                tile=pixels[row*128:(row+1)*128,col*128:(col+1)*128];assert not tile[[0,-1],:,3].any() and not tile[:,[0,-1],3].any();tiles.append(digest(tile.tobytes()))
        check(len(set(tiles))==16 and len(np.unique(pixels[:,:,3]))>50 and pixels[:,:,3].max()<226,'Alfa graduado, nuvens diferentes e bordas transparentes: '+suffix)
        pfx=json.loads(rp[f'particles/swbr_iburi_transformacao_{stage}.json'])['particle_effect'];effect=prefix+'_fumaca'
        check(d['particle_effects'][effect]==pfx['description']['identifier'],'Partícula pertence ao jogador: '+suffix)
        active=fx['states']['fumaca'+suffix];events=active['particle_effects']
        check(fx['states']['default']['transitions'][stage-1]=={'fumaca'+suffix:f'v.swbr_iburi_draw{stage}'} and active['transitions']==[{'default':f'!v.swbr_iburi_draw{stage}'}],'Estado termina ao trocar modo, câmera ou desequipar: '+suffix)
        for event in events:
            assert event['effect']==effect and event['locator'] in native_locators and event.get('bind_to_actor',True)
            position=native_locators[event['locator']];assert abs(position[0])<=9 and 0<=position[1]<=32 and abs(position[2])<=6
        check(bool(events),'Locators existem no rig humano e usam unidades de modelo: '+suffix)
        c=pfx['components'];limit=c['minecraft:emitter_rate_steady']['max_particles']*len(events)
        check(c['minecraft:emitter_local_space']=={'position':True,'rotation':True,'velocity':False},'Simulação de posição e rotação locais: '+suffix)
        check(limit<=27 and float(re.findall(r'[\d.]+',c['minecraft:particle_lifetime_expression']['max_lifetime'])[-1])<=.45,'Até 27 partículas e vida máxima de 0,45 s: '+suffix)
        check(not anim.get('particle_effects') and pfx['description']['basic_render_parameters']['texture']+'.png' in rp,'Sem emissores soltos na linha do tempo e textura existente: '+suffix)
        filename={1:'Iburi_Fumaca_I.bbmodel',2:'Iburi_Fumaca_II.bbmodel',3:'Iburi_Fumaca_Total.bbmodel'}[stage];path=ROOT/'Modelos_Blockbench'/filename
        model=read(path);editor=next(x for x in editors if x['stage']==stage);count=sum(len(b.get('cubes',[])) for b in bones.values())
        check(model['meta']['model_format']=='bedrock' and count==sum(e.get('type','cube')=='cube' for e in model['elements'])==editor['cubes'],'Projeto editável corresponde à geometria: '+suffix)
        check(base64.b64decode(model['textures'][0]['source'].split(',',1)[1])==rp[texture],'Textura embutida corresponde ao jogo: '+suffix)
        check(editor['texture_error']==0 and not editor['errors'] and editor['reopened']['animations']==1 and editor['source_sha256']==digest(path.read_bytes()),'Projeto salvo e reaberto no Blockbench sem erros: '+suffix)
        check(editor['native_geometry_sha256']==digest(rp[GEO_PATHS[stage]]) and editor['native_animation_sha256']==digest(rp[anim_path]) and editor['texture_sha256']==digest(rp[texture]),'Relatório do editor corresponde aos fontes atuais: '+suffix)
        summary[suffix]={'volumes_persistentes':len(core),'cubos':count,'bones':len(bones),'nivel':levels[stage-1],'limite_particulas':limit}
    numeric=read(ROOT/'Validacao_Molang.json')
    check(numeric['resultado']=='APROVADO' and numeric['minecraft_executado'] is False,'Testes numéricos de câmera e partículas concluídos sem alegar execução do Minecraft')
    for name,checksum in numeric['fontes_sha256'].items():check(digest(rp[name])==checksum,'Teste numérico corresponde ao fonte atual: '+name)
    exposure=read(ROOT/'Validacao_Exposicao.json')
    check(exposure['resultado']=='APROVADO' and exposure['minecraft_executado'] is False,'Exposição à frente da pele e progressão dos três níveis verificadas em projeção estática')
    for name,checksum in exposure['fontes_sha256'].items():check(digest(rp[name])==checksum,'Teste de exposição corresponde ao fonte atual: '+name)
    check(not (ROOT/'Previews').exists(),'Sem prévias de modelos na entrega')
    report={'resultado':'APROVADO','versao':VERSION,'base_sha256':base_hash,'addon_sha256':digest(addon.read_bytes()),'minecraft_executado':False,
      'escopo':'Arquivos e regressões numéricas. Renderização real e multiplayer ainda precisam de teste no Minecraft.',
      'modo_3':'Corpo preservado sob a fumaça; fumaça inteira bloqueada na primeira pessoa e perto da câmera.',
      'arquivos_preservados':preserved,'arquivos_alterados':modified,'arquivos_adicionados':added,'modelos':summary,'verificacoes':CHECKS,'quantidade_verificacoes':len(CHECKS)}
    (report_path or ROOT/'Validacao.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['resultado','versao','arquivos_preservados','quantidade_verificacoes','modelos']},ensure_ascii=False,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('base',type=Path);p.add_argument('addon',type=Path);p.add_argument('--report',type=Path);a=p.parse_args();validate(a.base,a.addon,a.report)
