#!/usr/bin/env python3
"""Audit six Aburame models, integration and preservation of the approved base."""
from pathlib import Path
import argparse,base64,copy,hashlib,io,json,re,zipfile
import numpy as np
from PIL import Image
import jsonschema
from construir_aburame import MODES,VERSION,NATIVE_GEOS,DRAW_GEO,SLOT_GEO,RC_FILE,FX_FILE,PLAYER_FILE,camera_program,read_base

ROOT=Path(__file__).resolve().parents[1];CHECKS=[]
def check(value,label):
    if not value:raise AssertionError(label)
    CHECKS.append(label)
def sha(data):return hashlib.sha256(data).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def pack(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert z.testzip() is None and len(z.namelist())==len(set(z.namelist()))
        return {n:z.read(n) for n in z.namelist() if not n.endswith('/')}
def clean_player(player):
    player=copy.deepcopy(player);d=player['minecraft:client_entity']['description']
    for section in ['materials','textures','geometry','animations','particle_effects']:
        d[section]={k:v for k,v in d[section].items() if not k.startswith('swbr_aburame')}
    d['scripts']['pre_animation']=[s for s in d['scripts']['pre_animation'] if not s.startswith('v.swbr_aburame_')]
    d['scripts']['animate']=[a for a in d['scripts']['animate'] if not any(k.startswith('swbr_aburame') for k in ([a] if isinstance(a,str) else a))]
    d['render_controllers']=[c for c in d['render_controllers'] if not any(k.startswith('controller.render.swbr.aburame') for k in ([c] if isinstance(c,str) else c))]
    return player
def clean_locators(geo):
    geo=copy.deepcopy(geo)
    for g in geo['minecraft:geometry']:
        for bone in g['bones']:
            if 'locators' in bone:
                bone['locators']={k:v for k,v in bone['locators'].items() if not k.startswith('swbr_aburame_')}
                if not bone['locators']:bone.pop('locators')
    return geo

def validate(base,addon,previous=None):
    CHECKS.clear();m=read(ROOT/'Integracao_Manifesto.json')
    check(sha(base.read_bytes())==m['base_sha256'],'Base 18.11.68 aprovada identificada por SHA-256')
    with zipfile.ZipFile(base) as z:outer_old={n:z.read(n) for n in z.namelist()}
    with zipfile.ZipFile(addon) as z:
        check(z.testzip() is None and len(z.namelist())==len(set(z.namelist())),'MCADDON íntegro sem falhas CRC ou entradas duplicadas')
        outer_new={n:z.read(n) for n in z.namelist()}
    old={};new={};preserved={};changed={};added={}
    for name,cfg in m['packs'].items():
        a=pack(outer_old[cfg['original_entry']]);b=pack(outer_new[cfg['updated_entry']]);old[name]=a;new[name]=b
        modified={n for n in a if a[n]!=b.get(n)};allowed=set(cfg['files'])
        check(set(a)<=set(b) and modified<=allowed and set(b)-set(a)==allowed-set(a),'Somente overlay aplicado, sem arquivos excluídos: '+name)
        for file,digest in cfg['files'].items():
            source=(ROOT/'Integracao'/name/file).read_bytes();check(b[file]==source and sha(source)==digest,'Overlay e assinatura conferidos: '+name+'/'+file)
        before=json.loads(a['manifest.json']);after=json.loads(b['manifest.json']);normalize=copy.deepcopy(after)
        check(after['header']['version']==VERSION and all(module['version']==VERSION for module in after['modules']),'Versão '+'.'.join(map(str,VERSION))+' nos manifests: '+name)
        for key in ['name','description','version']:normalize['header'][key]=before['header'][key]
        for module,o in zip(normalize['modules'],before['modules']):module['version']=o['version']
        for dep,o in zip(normalize.get('dependencies',[]),before.get('dependencies',[])):
            if 'uuid' in dep and dep['uuid'] in [json.loads(pack(outer_old[v['original_entry']])['manifest.json'])['header']['uuid'] for v in m['packs'].values()]:dep['version']=o['version']
        check(normalize==before,'UUIDs, APIs, engine, scripts e demais metadados preservados: '+name)
        preserved[name]=sum(a[n]==b[n] for n in a);changed[name]=sorted(modified);added[name]=sorted(set(b)-set(a))
    source_entries={cfg['original_entry'] for cfg in m['packs'].values()}
    for name,data in outer_old.items():
        if name not in source_entries:check(outer_new[name]==data,'Entrada externa preservada byte a byte: '+name)
    bp,rp=new['BP'],new['RP'];bp_old,rp_old=old['BP'],old['RP']
    check(all(bp[n]==data for n,data in bp_old.items() if n!='manifest.json'),'Behavior Pack inteiro preservado exceto a versão: itens, atributos, raridade, jutsus, câmera e administração')
    menu=bp['scripts/menu/config.js'].decode();rarity=[]
    for mode,spec in MODES.items():
        path='items/'+spec['id'].replace(':','_')+'.json';item=json.loads(bp[path])['minecraft:item']
        check(item['description']['identifier']==spec['id'] and item['components']['minecraft:wearable']['slot']=='slot.armor.head','Item e slot da cabeça preservados: '+spec['id'])
        row=next(line for line in menu.splitlines() if 'id: "'+spec['id']+'"' in line)
        level=int(re.search(r'lvl:\s*(\d+)',row).group(1));check(level==spec['level'],'Nível original preservado: '+spec['id'])
        tag=re.search(r'requiresTag:\s*"([^"]+)"',row);rarity.append({'mode':mode,'level':level,'requiresTag_explicito_no_menu':tag.group(1) if tag else None})
    check(rarity[1]['requiresTag_explicito_no_menu']=='AburameRaro','Modo venenoso inicial mantém a exigência AburameRaro')
    check('player.addTag("AburameRaro")' in bp['scripts/menu/custom/clan_selection.js'].decode(),'Sorteio e atribuição AburameRaro preservados')
    for path in rp_old:
        if 'iburi' in path.lower():check(rp[path]==rp_old[path],'Recurso Iburi aprovado preservado: '+path)
    for path in changed['RP']:
        allowed=(path in [PLAYER_FILE,*NATIVE_GEOS,'manifest.json'] or path in [s['path'] for s in MODES.values()] or path.startswith('attachables/nz_insetos_aburame_'))
        check(allowed,'Nenhum recurso antigo fora do escopo foi alterado: '+path)
    player=json.loads(rp[PLAYER_FILE]);d=player['minecraft:client_entity']['description']
    check(clean_player(player)==json.loads(rp_old[PLAYER_FILE]),'Jogador, Iburi e outros clãs preservados fora dos vínculos exclusivos Aburame')
    check(d['scripts']['pre_animation'][-len(camera_program()):]==camera_program(),'Programa visual usa indicadores de câmera nativos e apenas o item da cabeça')
    check(d['scripts']['animate'].count('swbr_aburame_fx')==1,'Uma instância do controlador de efeitos por jogador')
    check(d['materials']['swbr_aburame_solid']=='entity_alphatest' and d['materials']['swbr_aburame_translucent']=='entity_alphablend','Materiais nativos, sem brilho emissivo ou aditivo')
    reference=None;locators={}
    for path in NATIVE_GEOS:
        data=json.loads(rp[path]);check(clean_locators(data)==json.loads(rp_old[path]),'Geometria humana e locators Iburi preservados, somente âncoras Aburame acrescentadas: '+path)
        bones={b['name']:b for b in data['minecraft:geometry'][0]['bones']}
        if reference is None:reference=bones
        for bone in bones.values():locators.update(bone.get('locators',{}))
    for pattern,schema in [('*/manifest.json','manifest'),('RP/models/entity/**/*.json','geometry'),('RP/attachables/*.json','attachable'),('RP/animations/*.json','animation'),('RP/animation_controllers/*.json','animation_controller'),('RP/particles/*.json','particle'),('RP/render_controllers/*.json','render')]:
        validator=jsonschema.Draft7Validator(read(ROOT/'Fontes/Schemas'/(schema+'.json')))
        for p in (ROOT/'Integracao').glob(pattern):
            errors=list(validator.iter_errors(read(p)));check(not errors,'Schema válido: '+str(p.relative_to(ROOT))+(' '+errors[0].message if errors else ''))
    rcs=json.loads(rp[RC_FILE])['render_controllers'];draw_list=json.loads(rp[DRAW_GEO])['minecraft:geometry'];draw={g['description']['identifier']:g for g in draw_list}
    check(len(draw_list)==len(draw)==21,'21 malhas exclusivas por camada, sem máscaras concorrentes')
    slot=json.loads(rp[SLOT_GEO])['minecraft:geometry'][0];check(not any(b.get('cubes') for b in slot['bones']),'Attachable vazio evita insetos/modelos na mão ou envolvendo a câmera')
    fx=json.loads(rp[FX_FILE])['animation_controllers'][d['animations']['swbr_aburame_fx']]
    own_rc={k:v for c in d['render_controllers'] if isinstance(c,dict) for k,v in c.items() if k.startswith('controller.render.swbr.aburame')}
    check(len(own_rc)==21,'Somente as camadas do modo equipado são desenhadas pelo jogador')
    editors=read(ROOT/'Validacao_Blockbench.json')['results'];summary={};texture_hashes=[]
    for mode,spec in MODES.items():
        prefix=f'swbr_aburame{mode}';geo=json.loads(rp[spec['path']])['minecraft:geometry'][0];bones={b['name']:b for b in geo['bones']}
        anim_path=f'animations/swbr_aburame_{mode}.json';animation=json.loads(rp[anim_path])['animations'][d['animations'][prefix+'_idle']]
        leaves={n for n,b in bones.items() if n.startswith(prefix+'_')};rendered=set();count=sum(len(b.get('cubes',[])) for b in bones.values())
        check(len(bones)==len(geo['bones']) and geo['description']['identifier']==spec['gid'],'Geometria e bones exclusivos: '+str(mode))
        matches=sum(bool(re.search(rb'"identifier"\s*:\s*"'+spec['gid'].encode()+rb'"',data)) for path,data in rp.items() if path.startswith('models/') and path.endswith('.json'))
        check(matches==1,'Geometria declarada uma única vez no pack completo: '+spec['gid'])
        check(all(bones[name]['pivot']==reference[name]['pivot'] and bones[name].get('parent')==reference[name].get('parent') for name in reference if name in ['root','waist','body','head','rightArm','leftArm','rightLeg','leftLeg']),'Rig acompanha o jogador, sem alterar os pivôs humanos: '+str(mode))
        for name,bone in bones.items():
            visited={name};parent=bone.get('parent')
            while parent:
                assert parent in bones and parent not in visited;visited.add(parent);parent=bones[parent].get('parent')
            for c in bone.get('cubes',[]):
                assert min(c['size'])>0
                for face in c['uv'].values():
                    u,v=face['uv'];w,h=face['uv_size'];assert all(0<=x<=512 for x in [u,v,u+w,v+h])
        check(True,'Hierarquia sem ciclos, dimensões e UVs válidos: '+str(mode))
        check(set(animation['bones'])<=leaves and not animation.get('particle_effects'),'Animações afetam só os insetos e não disparam emissores soltos: '+str(mode))
        check({prefix+'_idle':f'v.swbr_aburame_draw{mode}'} in d['scripts']['animate'],'Animação condicionada ao modo e à câmera: '+str(mode))
        counts=m['modelos_novos'][str(mode)];original=m['modelos_anteriores'][str(mode)]
        check(count==counts['cubos'] and len(bones)==counts['bones'] and count<original['cubos']*.35 and len(bones)<original['bones']*.30,'Complexidade reduzida em relação ao modelo original: '+str(mode))
        for role in counts['roles']:
            alias=prefix+'_'+role;part=draw[d['geometry'][alias]];part_bones={b['name']:b for b in part['bones']}
            own={n for n in part_bones if n.startswith(prefix+'_')};expected={n for n in leaves if n.startswith(alias+'_')}
            check(own==expected and own and not rendered&own and all(part_bones[n]==bones[n] for n in own),'Subconjunto de renderização corresponde ao modelo editável: '+alias);rendered|=own
            check(len(part_bones)<=64 and all(not b.get('parent') or b['parent'] in part_bones for b in part_bones.values()),'Até 64 bones por malha e cadeia de pais completa: '+alias)
            identifier=f'controller.render.swbr.aburame{mode}.{role}';rc=rcs[identifier]
            material='solid' if role.startswith('solid') else 'translucent'
            check(own_rc[identifier]==f'v.swbr_aburame_draw{mode}' and 'part_visibility' not in rc and rc['geometry']=='Geometry.'+alias and rc['textures']==['Texture.'+prefix] and rc['materials']==[{'*':'Material.swbr_aburame_'+material}],'Vínculos e proteção do controlador completo: '+identifier)
        check(rendered==leaves,'Todas as peças desenhadas uma única vez: '+str(mode))
        texture=d['textures'][prefix]+'.png';pixels=np.array(Image.open(io.BytesIO(rp[texture])).convert('RGBA'));texture_hashes.append(sha(rp[texture]))
        check(pixels.shape==(512,512,4) and pixels[511,511,3]==0,'Atlas 512×512 e amostra de borda totalmente transparente: '+str(mode))
        tiles=range(1,16) if spec['kind']=='comum' else range(8,16)
        for tile in tiles:
            cell=pixels[tile//4*128:(tile//4+1)*128,tile%4*128:(tile%4+1)*128]
            assert not cell[[0,-1],:,3].any() and not cell[:,[0,-1],3].any()
            assert 0<np.mean(cell[:,:,3]>128)<.34
        check(True,'Enxames com espaços e bordas dispersas, sem retângulos ou preenchimento sólido: '+str(mode))
        if spec['kind']=='venenoso':
            opaque=pixels[:256,:,:3][pixels[:256,:,3]>128]
            check(np.mean(opaque[:,2]>opaque[:,0])>.95 and np.mean(opaque[:,0]>opaque[:,1])>.95 and opaque.max()<160,'Revestimento violeta escuro sem neon: '+str(mode))
            check(not any('besouro' in name or 'elytro' in name for name in bones),'Rinkaichū representados como colônias microscópicas, não insetos gigantes: '+str(mode))
            for b in bones.values():
                if not b['name'].startswith(prefix+'_coat_'):continue
                src=reference[b['parent']]['cubes'][0];c=b['cubes'][0]
                assert all(abs(c['origin'][i]-src['origin'][i])<=.301 for i in range(3))
                assert all(c['origin'][i]+c['size'][i]<=src['origin'][i]+src['size'][i]+.301 for i in range(3))
            check(True,'Revestimento aderido ao corpo, sem placas ou espinhos: '+str(mode))
            def coat_alpha(part):
                uv=bones[prefix+'_coat_'+part]['cubes'][0]['uv']['north']
                u,v=uv['uv'];w,h=uv['uv_size']
                return pixels[v:v+h,u:u+w,3]/255
            if mode in (2,4):
                for part in ('rightArm','leftArm'):
                    mask=coat_alpha(part)
                    check(mask[:20].mean()+.25<mask[-20:].mean() and mask[-20:].mean()>.7,
                          'Violeta aumenta gradualmente em direção às mãos: '+str(mode)+'/'+part)
            if mode==6:
                face_alpha=coat_alpha('head')
                check(face_alpha.min()>.38 and face_alpha.mean()<.60 and coat_alpha('body').min()>.70,
                      'Sobreposição violeta mantém cobertura contínua com translucidez no rosto: '+str(mode))
        else:
            solids=[c for b in bones.values() if '_solid_' in b['name'] for c in b.get('cubes',[])]
            check(solids and max(max(c['size']) for c in solids)<1.0,'Besouros modelados pequenos, com corpo/cabeça/élitros e pernas em recorte: '+str(mode))
            check(not any('_coat_' in n for n in bones),'Modos comuns preservam a skin sem uma carapaça corporal: '+str(mode))
        for path in [f'attachables/{spec["id"].replace(":","_")}.json',f'attachables/{spec["id"].replace(":","_")}.player.json']:
            if path not in rp_old:continue
            attach=json.loads(rp[path])['minecraft:attachable']['description'];before=json.loads(rp_old[path])['minecraft:attachable']['description']
            check(attach['identifier']==before['identifier'] and attach.get('item')==before.get('item') and attach['geometry']['default']==slot['description']['identifier'] and not any(attach.get(k) for k in ['animations','scripts','particle_effects']),'Proxy regular/especializado preserva o vínculo e não duplica o efeito: '+path)
        ppath=f'particles/swbr_aburame_{mode}.json';p=json.loads(rp[ppath])['particle_effect'];components=p['components'];active=fx['states']['modo'+str(mode)];events=active['particle_effects']
        check(d['particle_effects'][prefix+'_insetos']==p['description']['identifier'] and p['description']['basic_render_parameters']['material']=='particles_blend','Partículas próprias sem material emissivo: '+str(mode))
        check(components['minecraft:emitter_local_space']=={'position':True,'rotation':True,'velocity':False} and all(e.get('bind_to_actor',True) and e['locator'] in locators for e in events),'Emissores ligados aos bones e simulados em espaço local: '+str(mode))
        check(active['transitions']==[{'default':f'!v.swbr_aburame_draw{mode}'}] and components['minecraft:emitter_rate_steady']['max_particles']*len(events)<=44,'Emissão encerra ao sair do estado e tem orçamento limitado: '+str(mode))
        model_file=ROOT/'Modelos_Blockbench'/(spec['name']+'.bbmodel');project=read(model_file);editor=next(x for x in editors if x['mode']==mode)
        check(project['meta']['model_format']=='bedrock' and sum(e.get('type','cube')=='cube' for e in project['elements'])==count==editor['cubes'],'BBMODEL editável corresponde à geometria: '+str(mode))
        check(base64.b64decode(project['textures'][0]['source'].split(',',1)[1])==rp[texture],'Textura embutida corresponde ao recurso do jogo: '+str(mode))
        check(not editor['errors'] and editor['texture_error']==0 and editor['reopened']['animations']==1 and editor['geometry_roundtrip'] and editor['animation_roundtrip'],'Projeto, UVs e animações exportados e reabertos no Blockbench: '+str(mode))
        check(editor['source_sha256']==sha(model_file.read_bytes()) and editor['native_geometry_sha256']==sha(rp[spec['path']]) and editor['native_animation_sha256']==sha(rp[anim_path]) and editor['texture_sha256']==sha(rp[texture]),'Relatório do editor corresponde aos arquivos atuais: '+str(mode))
        summary[str(mode)]={'id':spec['id'],'nivel':spec['level'],'tipo':spec['kind'],'bones':len(bones),'cubos':count,'antes':original,'redução_cubos_pct':round(100*(1-count/original['cubos']),1)}
    check(len(set(texture_hashes))==6,'Seis texturas distintas para seis estágios')
    for filename in ['Validacao_Molang.json','Validacao_Visual_Estatica.json']:
        report=read(ROOT/filename);check(report['resultado']=='APROVADO' and report['minecraft_executado'] is False,'Verificação estática concluída, sem alegar Minecraft executado: '+filename)
        for path,digest in report['fontes_sha256'].items():check(sha(rp[path])==digest,'Verificação ligada ao fonte atual: '+filename+'/'+path)
    check(not (ROOT/'Previews').exists(),'Entrega sem prévias geradas')
    revision=None
    if previous:
        prior=read_base(previous)
        revision={'anterior_sha256':sha(previous.read_bytes()),'arquivos_alterados':{}}
        revised_rp={'manifest.json',DRAW_GEO,RC_FILE}
        for mode,spec in MODES.items():
            revised_rp.update((spec['path'],f'animations/swbr_aburame_{mode}.json',f'textures/entity/swbr/aburame/modo_{mode}.png'))
        for name in ['BP','RP']:
            before=prior[name][1];after=new[name]
            permitted={'manifest.json'} if name=='BP' else revised_rp
            altered={p for p in before if before[p]!=after.get(p)}
            check(set(before)==set(after) and altered<=permitted,'Revisão limitada à apresentação dos seis modos e aos manifests: '+name)
            revision['arquivos_alterados'][name]=sorted(altered)
    report={'resultado':'APROVADO','versao':VERSION,'base_sha256':m['base_sha256'],'addon_sha256':sha(addon.read_bytes()),'minecraft_executado':False,'revisao_visual':revision,
      'arquivos_preservados':preserved,'arquivos_alterados':changed,'arquivos_adicionados':added,'modelos':summary,'raridade_original':rarity,'verificacoes':CHECKS,'quantidade_verificacoes':len(CHECKS),
      'limites':'Validação de arquivos, geometria, estados e editor. Aparência real, movimento no motor, multiplayer, remoção final dos efeitos e desempenho em celular precisam de confirmação no Minecraft.'}
    (ROOT/'Validacao.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['resultado','versao','arquivos_preservados','quantidade_verificacoes','modelos']},ensure_ascii=False,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('base',type=Path);p.add_argument('addon',type=Path);p.add_argument('--anterior',type=Path);args=p.parse_args();validate(args.base,args.addon,args.anterior)
