#!/usr/bin/env python3
"""Validate the integration, game resources, editable models and preservation audit."""
from pathlib import Path
import argparse,base64,copy,fnmatch,hashlib,io,json,re,zipfile
import numpy as np
from PIL import Image
import jsonschema
from construir_iburi import VERSION,GEO_PATHS,REGISTRY,LEGACY_HIDE_SCRIPTS

ROOT=Path(__file__).resolve().parents[1]
CHECKS=[]
def check(condition,name):
    if not condition:raise AssertionError(name)
    CHECKS.append(name)
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def pack_files(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert z.testzip() is None
        return {n:z.read(n) for n in z.namelist() if not n.endswith('/')}

def visible_leaves(controller,bones,first_person=False,item_slot='head'):
    """Resolve ordered part masks, then check every ancestor, not just a leaf."""
    visibility={n:True for n in bones}
    for rule in controller['part_visibility']:
        for pattern,value in rule.items():
            if isinstance(value,str):
                if value=='!context.is_first_person || query.is_in_ui':value=not first_person
                else:
                    assert value=="context.item_slot != 'main_hand' && context.item_slot != 'off_hand' && (!context.is_first_person || query.is_in_ui)"
                    value=not first_person and item_slot not in ['main_hand','off_hand']
            for name in bones:
                if fnmatch.fnmatchcase(name,pattern):visibility[name]=bool(value)
    result=set()
    for name,bone in bones.items():
        if not bone.get('cubes'):continue
        current=name;enabled=True
        while current:
            enabled=enabled and visibility[current];current=bones[current].get('parent')
        if enabled:result.add(name)
    return result

def validate(base,addon,report_path=None):
    CHECKS.clear()
    manifest=read(ROOT/'Integracao_Manifesto.json')
    digest=hashlib.sha256(base.read_bytes()).hexdigest()
    input_entries={p:c['original_entry'] for p,c in manifest['packs'].items()}
    if digest!=manifest['base_sha256']:
        compatible=next((b for b in manifest.get('compatible_bases',[]) if b['base_sha256']==digest),None)
        assert compatible is not None
        input_entries=compatible['pack_entries']
    check(True,'Base de entrada identificada por SHA-256')
    with zipfile.ZipFile(base) as z:outer_old={n:z.read(n) for n in z.namelist()}
    with zipfile.ZipFile(addon) as z:
        check(z.testzip() is None,'MCADDON final íntegro, sem falhas CRC')
        check(len(z.namelist())==len(set(z.namelist())),'MCADDON sem nomes de entrada duplicados')
        outer_new={n:z.read(n) for n in z.namelist()}
    data_old={};data_new={};unchanged={};modified={};added={}
    for pack,config in manifest['packs'].items():
        old=pack_files(outer_old[input_entries[pack]]);new=pack_files(outer_new[config['updated_entry']])
        data_old[pack]=old;data_new[pack]=new
        check(set(old)<=set(new),'Nenhum arquivo original removido: '+pack)
        changes=set(config['files']);changed=[n for n in old if old[n]!=new[n]]
        check(set(changed)<=changes,'Somente arquivos autorizados foram alterados: '+pack)
        check(set(new)-set(old)==changes-set(old),'Somente os novos recursos Iburi foram adicionados: '+pack)
        for name,checksum in config['files'].items():
            source=(ROOT/'Integracao'/pack/name).read_bytes()
            check(hashlib.sha256(new[name]).hexdigest()==checksum and new[name]==source,'Overlay corresponde à addon: '+pack+'/'+name)
            if name.endswith('.json'):json.loads(new[name])
        unchanged[pack]=sum(old[n]==new[n] for n in old)
        modified[pack]=sorted(changed);added[pack]=sorted(set(new)-set(old))
        before=json.loads(old['manifest.json']);after=json.loads(new['manifest.json'])
        check(after['header']['version']==VERSION and all(m['version']==VERSION for m in after['modules']),'Manifests atualizados para 18.11.66: '+pack)
        normalize=copy.deepcopy(after)
        for key in ['name','description','version']:normalize['header'][key]=before['header'][key]
        for m,b in zip(normalize['modules'],before['modules']):m['version']=b['version']
        for d,b in zip(normalize.get('dependencies',[]),before.get('dependencies',[])):
            if d.get('uuid') in ['82dafe0d-c36f-4665-9df0-371f6d8b2a55','ef513a51-2cb2-4cc5-b300-5ef44201c3f5']:d['version']=b['version']
        check(normalize==before,'UUIDs, engine, APIs, entradas de script e dependências preservados: '+pack)
    for name,value in outer_old.items():
        if name not in [*input_entries.values(),'LEIA-ME_IBURI.md']:check(outer_new[name]==value,'Entrada externa preservada byte a byte: '+name)
    bp=data_new['BP'];rp=data_new['RP'];bp_old=data_old['BP'];rp_old=data_old['RP']
    for stage in [1,2,3]:
        file=f'items/nz_modo_iburi{stage}.json'
        check(bp[file]==bp_old[file],'Item e atributos originais preservados: '+file)
        check(json.loads(bp[file])['minecraft:item']['components']['minecraft:wearable']['slot']=='slot.armor.head','Slot da cabeça mantido: '+str(stage))
    check(bp['items/jutsu_iburi_fumaca.json']==bp_old['items/jutsu_iburi_fumaca.json'],'Jutsu nz:jutsu_iburi_fumaca preservado byte a byte')
    levels=[]
    for stage in [1,2,3]:
        match=re.search(r'id:\s*"nz:modo_iburi'+str(stage)+r'"[^\n]+lvl:\s*(\d+)',bp['scripts/menu/config.js'].decode())
        check(match is not None,'Modo encontrado no menu original: '+str(stage));levels.append(int(match.group(1)))
    check(levels==[10,15,25] and bp['scripts/menu/config.js']==bp_old['scripts/menu/config.js'],'Níveis, requisitos e configuração do menu preservados')
    def remove_names(text):return re.sub(r'(id: "nz:modo_iburi[123]",[\s\S]*?nome: )"[^"\n]+"',r'\1"<NOME>"',text)
    check(remove_names(bp[REGISTRY].decode())==remove_names(bp_old[REGISTRY].decode()),'Registro de combate: somente os três nomes de apresentação mudaram')
    for path in manifest['packs']['RP']['files']:
        if path.startswith('texts/') and path.endswith('.lang'):
            def normalize_names(data):return re.sub(r'(?m)^(item\.nz:modo_iburi[123](?:\.name)?=)[^\r\n]*',r'\1<NOME>',data.decode('utf-8'))
            check(normalize_names(rp[path])==normalize_names(rp_old[path]),'Localização: somente os seis nomes Iburi foram alterados: '+path)
    player=json.loads(rp['entity/player.entity.json']);original_player=json.loads(rp_old['entity/player.entity.json'])
    scripts=player['minecraft:client_entity']['description']['scripts']['pre_animation']
    check(not any('swbr_iburi_total' in s for s in scripts),'Modo 3 não ativa ocultação do corpo ou do cabelo')
    expected=copy.deepcopy(original_player)
    original_scripts=expected['minecraft:client_entity']['description']['scripts']['pre_animation']
    expected['minecraft:client_entity']['description']['scripts']['pre_animation']=[s for s in original_scripts if s not in LEGACY_HIDE_SCRIPTS]
    check(player==expected,'player.entity.json preservado, exceto a remoção das três instruções Iburi de ocultação')
    schema_dir=ROOT/'Fontes/Schemas'
    for pattern,name in [('*/manifest.json','manifest'),('RP/models/entity/*.json','geometry'),('RP/attachables/*.json','attachable'),('RP/animations/*.json','animation'),('RP/animation_controllers/*.json','animation_controller'),('RP/particles/*.json','particle'),('RP/render_controllers/*.json','render')]:
        validator=jsonschema.Draft7Validator(read(schema_dir/(name+'.json')))
        for p in (ROOT/'Integracao').glob(pattern):
            errors=list(validator.iter_errors(read(p)))
            check(not errors,'Schema válido: '+str(p.relative_to(ROOT))+(' '+errors[0].message if errors else ''))
    controllers=json.loads(rp['render_controllers/swbr_iburi_transformacoes.json'])['render_controllers']
    animation_controllers=json.loads(rp['animation_controllers/swbr_iburi_fumaca.json'])['animation_controllers']
    check(not any(b'animation.nz_modo_iburu3' in data for name,data in rp.items() if name.endswith('.json')),'Grafia antiga iburu3 removida de todo o Resource Pack')
    for stage in [1,2,3]:
        gid=f'geometry.nz_modo_iburi{stage}'
        geometry_matches=sum(bool(re.search(rb'"identifier"\s*:\s*"'+gid.encode()+rb'"',data)) for name,data in rp.items() if name.startswith('models/') and name.endswith('.json'))
        animation_matches=sum(bool(re.search(rb'"animation\.nz_modo_iburi'+str(stage).encode()+rb'\.idle"\s*:',data)) for name,data in rp.items() if name.startswith('animations/') and name.endswith('.json'))
        check(geometry_matches==1,'Definição de geometria exclusiva no pack completo: '+str(stage))
        check(animation_matches==1,'Definição de animação exclusiva no pack completo: '+str(stage))
    editors=read(ROOT/'Validacao_Blockbench.json')['results'];summary={}
    for stage in [1,2,3]:
        geo=json.loads(rp[GEO_PATHS[stage]])['minecraft:geometry'][0]
        attach=json.loads(rp[f'attachables/nz_modo_iburi{stage}.json'])['minecraft:attachable']['description']
        anims=json.loads(rp[f'animations/nz_modo_iburi{stage}.idle.json'])['animations']
        anim=anims[f'animation.nz_modo_iburi{stage}.idle']
        check(attach['identifier']==f'nz:modo_iburi{stage}','Identificador do attachable: '+str(stage))
        check(attach['geometry']['default']==geo['description']['identifier']==f'geometry.nz_modo_iburi{stage}','Geometria ligada ao attachable: '+str(stage))
        check(attach['materials']=={'default':'entity_alphablend'},'Material nativo com translucidez: '+str(stage))
        check(set(attach['animations'].values())<=set(anims)|set(animation_controllers),'Todas as referências de animação e controlador resolvem: '+str(stage))
        check(set(attach['scripts']['animate'])=={'idle','smoke'},'Animação geométrica e controlador de partículas ativos: '+str(stage))
        check(not any(x in json.dumps(attach).lower() for x in ['aburame','iburu','base_attachable']),'Vínculos legados incorretos removidos: '+str(stage))
        bones={b['name']:b for b in geo['bones']};names=set(bones);locators=set()
        check(len(names)==len(geo['bones']),'Bones exclusivos: '+str(stage))
        for bone in bones.values():
            seen={bone['name']};parent=bone.get('parent')
            while parent:
                assert parent in names and parent not in seen
                seen.add(parent);parent=bones[parent].get('parent')
            locators.update(bone.get('locators',{}))
            for c in bone.get('cubes',[]):
                assert min(c['size'])>0
                for f in c['uv'].values():
                    u,v=f['uv'];du,dv=f['uv_size'];assert all(0<=a<=512 for a in [u,v,u+du,v+dv])
        check(True,'Hierarquia sem ciclos, dimensões e UVs válidos: '+str(stage))
        check(set(anim['bones'])<=names and all(n.startswith(('iburi_p','iburi_core_')) for n in anim['bones']),'Animação atua somente nas nuvens, sem sobrescrever o rig humano: '+str(stage))
        source_rig=next(g for name,data in rp_old.items() if name.endswith('/custom.geo.json') for g in json.loads(data).get('minecraft:geometry',[]) if g.get('description',{}).get('identifier')=='geometry.swbr39.custom')
        source_bones={b['name']:b for b in source_rig['bones']}
        rig_names=['root','waist','body','head','rightArm','leftArm','rightLeg','leftLeg']
        check(all(bones[n].get('parent')==source_bones[n].get('parent') and bones[n]['pivot']==source_bones[n]['pivot'] for n in rig_names),'Hierarquia e pivôs correspondem ao rig real do jogador SWBR: '+str(stage))
        check(len(attach['render_controllers'])==7 and all(n in controllers for n in attach['render_controllers']),'Volume permanente e seis fases de dissipação existentes: '+str(stage))
        selected=set()
        all_leaves={n for n,b in bones.items() if b.get('cubes')}
        for index,rc in enumerate(attach['render_controllers']):
            row=controllers[rc]
            expected={n for n in all_leaves if n.startswith('iburi_core_' if index==0 else f'iburi_p{index-1}_')}
            visible=visible_leaves(row,bones)
            check(visible==expected and bool(visible),'Nuvens e todos os seus ancestrais visíveis no passe: '+str(stage)+'/'+str(index))
            check(not visible_leaves(row,bones,first_person=True),'Nuvens não cobrem a câmera em primeira pessoa: '+str(stage)+'/'+str(index))
            check(not visible_leaves(row,bones,item_slot='main_hand') and not visible_leaves(row,bones,item_slot='off_hand'),'Item nas mãos não duplica ou mantém a fumaça após desequipar: '+str(stage)+'/'+str(index))
            check(not selected&visible,'Nenhuma nuvem desenhada por dois passes: '+str(stage)+'/'+str(index))
            selected.update(visible)
        check(selected==all_leaves==set(anim['bones']),'Todos os volumes e nuvens possuem exatamente um passe: '+str(stage))
        legacy={'part_visibility':[{'*':False},{'iburi_p0_*':'!context.is_first_person || query.is_in_ui'}]}
        check(not visible_leaves(legacy,bones),'Regressão detecta nuvens sob pais ocultos na máscara anterior: '+str(stage))
        core=[b for n,b in bones.items() if n.startswith('iburi_core_')]
        check(all(len(b['cubes'])>=1 and min(b['cubes'][0]['size'])>1.5 and set(b['cubes'][0]['uv'])=={'north','south','east','west','up','down'} for b in core),'Volumes reais com espessura e textura nas seis faces: '+str(stage))
        check(controllers[attach['render_controllers'][0]]['color']['a']==1,'Volume central não desaparece com as fases: '+str(stage))
        required={'body','rightArm','leftArm'}|({'rightLeg','leftLeg'} if stage>=2 else set())|({'head'} if stage==3 else set())
        check(required<={b['parent'] for b in core},'Volumes cobrem as regiões corporais necessárias: '+str(stage))
        texture_path=attach['textures']['default']+'.png'
        image=Image.open(io.BytesIO(rp[texture_path])).convert('RGBA');pixels=np.array(image)
        check(image.size==(512,512),'Atlas de textura 512×512: '+str(stage))
        check(np.max(abs(pixels[:,:,0].astype(int)-pixels[:,:,1].astype(int)))==0 and np.array_equal(pixels[:,:,1],pixels[:,:,2]),'Paleta estritamente cinza: '+str(stage))
        hashes=[]
        for row in range(4):
            for col in range(4):
                tile=pixels[row*128:(row+1)*128,col*128:(col+1)*128]
                assert np.max(tile[[0,-1],:,3])==0 and np.max(tile[:,[0,-1],3])==0
                hashes.append(hashlib.sha256(tile.tobytes()).hexdigest())
        check(len(set(hashes))==16 and len(np.unique(pixels[:,:,3]))>50,'16 nuvens diferentes, bordas sem retângulo e alfa gradual: '+str(stage))
        effect=attach['particle_effects']['fumaca'];particle=json.loads(rp[f'particles/swbr_iburi_transformacao_{stage}.json'])['particle_effect']
        check(particle['description']['identifier']==effect,'Partícula ligada ao attachable: '+str(stage))
        check(particle['description']['basic_render_parameters']['texture']+'.png' in rp,'Textura da partícula existente: '+str(stage))
        controller=animation_controllers[attach['animations']['smoke']]
        active=controller['states']['equipado'];events=active['particle_effects']
        for event in events:
            assert event['effect'] in attach['particle_effects'] and event['locator'] in locators and event.get('bind_to_actor',True) is True
        check(not anim.get('particle_effects'),'Sem disparos soltos de partículas na linha do tempo: '+str(stage))
        condition=controller['states']['default']['transitions'][0]['equipado']
        check(f"'nz:modo_iburi{stage}'" in condition and "'slot.armor.head'" in condition and active['transitions']==[{'default':f'!({condition})'}],'Emissores entram e saem de estado conforme o modo equipado: '+str(stage))
        check(bool(events),'Emissores ligados ao ator e a locators existentes: '+str(stage))
        components=particle['components']
        check(components['minecraft:emitter_local_space']=={'position':True,'rotation':True,'velocity':False},'Partículas simuladas em posição e rotação locais: '+str(stage))
        max_particles=components['minecraft:emitter_rate_steady']['max_particles']*len(events)
        check(max_particles<=40 and float(re.findall(r'[\d.]+',components['minecraft:particle_lifetime_expression']['max_lifetime'])[-1])<=.55,'Limite móvel de partículas e duração máxima de 0,55 s: '+str(stage))
        file={1:'Iburi_Fumaca_I.bbmodel',2:'Iburi_Fumaca_II.bbmodel',3:'Iburi_Fumaca_Total.bbmodel'}[stage]
        path=ROOT/'Modelos_Blockbench'/file;model=read(path);editor=next(e for e in editors if e['stage']==stage)
        count=sum(len(b.get('cubes',[])) for b in bones.values())
        editable_cubes=sum(e.get('type','cube')=='cube' for e in model['elements'])
        check(model['meta']['model_format']=='bedrock' and count==editable_cubes==editor['cubes'],'BBMODEL editável corresponde à geometria: '+str(stage))
        check(base64.b64decode(model['textures'][0]['source'].split(',',1)[1])==rp[texture_path],'BBMODEL inclui a textura correta: '+str(stage))
        check(editor['texture_error']==0 and not editor['errors'] and len(editor['animations'])==1,'Modelo e animação importados no Blockbench sem erros: '+str(stage))
        check(hashlib.sha256(path.read_bytes()).hexdigest()==editor['source_sha256'],'Assinatura do projeto exportado pelo editor: '+str(stage))
        summary[str(stage)]={'volumes_persistentes':len(core),'nuvens_animadas':len(anim['bones']),'cubos':count,'bones':len(bones),'nivel':levels[stage-1],'periodo':anim['animation_length'],'limite_particulas':max_particles}
    molang=ROOT/'Validacao_Molang.json'
    check(molang.exists() and read(molang)['resultado']=='APROVADO','Expressões e ciclos Molang avaliados numericamente')
    check(not (ROOT/'Previews').exists(),'Entrega sem prévias geradas')
    report={'resultado':'APROVADO','versao':VERSION,'base_sha256':digest,'addon_sha256':hashlib.sha256(addon.read_bytes()).hexdigest(),
      'minecraft_executado':False,'escopo':'Arquivos gerados/alterados validados; demais arquivos comparados byte a byte com a base.',
      'modo_3':'Solução temporária: corpo preservado sob volumes densos; substituição completa ainda não confirmada em Minecraft.',
      'arquivos_preservados':unchanged,'arquivos_alterados':modified,'arquivos_adicionados':added,'modelos':summary,'verificacoes':CHECKS,'quantidade_verificacoes':len(CHECKS)}
    (report_path or ROOT/'Validacao.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['resultado','arquivos_preservados','quantidade_verificacoes','modelos']},ensure_ascii=False,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('base',type=Path);p.add_argument('addon',type=Path);p.add_argument('--report',type=Path);a=p.parse_args();validate(a.base,a.addon,a.report)
