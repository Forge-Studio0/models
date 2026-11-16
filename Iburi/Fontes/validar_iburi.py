#!/usr/bin/env python3
"""Validate the integration, game resources, editable models and preservation audit."""
from pathlib import Path
import argparse,base64,copy,hashlib,io,json,re,zipfile
import numpy as np
from PIL import Image
import jsonschema
from construir_iburi import BP_ENTRY,RP_ENTRY,GEO_PATHS,REGISTRY,HIDE_SCRIPTS

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

def validate(base,addon):
    manifest=read(ROOT/'Integracao_Manifesto.json')
    check(hashlib.sha256(base.read_bytes()).hexdigest()==manifest['base_sha256'],'Base original identificada por SHA-256')
    with zipfile.ZipFile(base) as z:outer_old={n:z.read(n) for n in z.namelist()}
    with zipfile.ZipFile(addon) as z:
        check(z.testzip() is None,'MCADDON final íntegro, sem falhas CRC')
        outer_new={n:z.read(n) for n in z.namelist()}
    data_old={};data_new={};unchanged={};modified={};added={}
    for pack,config in manifest['packs'].items():
        old=pack_files(outer_old[config['original_entry']]);new=pack_files(outer_new[config['updated_entry']])
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
        check(after['header']['version']==[18,11,65] and all(m['version']==[18,11,65] for m in after['modules']),'Manifests atualizados para 18.11.65: '+pack)
        normalize=copy.deepcopy(after)
        for key in ['name','description','version']:normalize['header'][key]=before['header'][key]
        for m,b in zip(normalize['modules'],before['modules']):m['version']=b['version']
        for d,b in zip(normalize.get('dependencies',[]),before.get('dependencies',[])):
            if d.get('uuid') in ['82dafe0d-c36f-4665-9df0-371f6d8b2a55','ef513a51-2cb2-4cc5-b300-5ef44201c3f5']:d['version']=b['version']
        check(normalize==before,'UUIDs, engine, APIs, entradas de script e dependências preservados: '+pack)
    for name,value in outer_old.items():
        if name not in [BP_ENTRY,RP_ENTRY]:check(outer_new[name]==value,'Entrada externa preservada byte a byte: '+name)
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
    check(scripts[-len(HIDE_SCRIPTS):]==HIDE_SCRIPTS,'Ocultação visual condicionada exclusivamente a nz:modo_iburi3')
    restored=copy.deepcopy(player);restored['minecraft:client_entity']['description']['scripts']['pre_animation']=scripts[:-len(HIDE_SCRIPTS)]
    check(restored==original_player,'Todo o restante de player.entity.json foi preservado')
    schema_dir=ROOT/'Fontes/Schemas'
    for pattern,name in [('*/manifest.json','manifest'),('RP/models/entity/*.json','geometry'),('RP/attachables/*.json','attachable'),('RP/animations/*.json','animation'),('RP/particles/*.json','particle'),('RP/render_controllers/*.json','render')]:
        validator=jsonschema.Draft7Validator(read(schema_dir/(name+'.json')))
        for p in (ROOT/'Integracao').glob(pattern):
            errors=list(validator.iter_errors(read(p)))
            check(not errors,'Schema válido: '+str(p.relative_to(ROOT))+(' '+errors[0].message if errors else ''))
    controllers=json.loads(rp['render_controllers/swbr_iburi_transformacoes.json'])['render_controllers']
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
        check(set(attach['animations'].values())==set(anims),'Todas as referências de animação resolvem: '+str(stage))
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
        check(set(anim['bones'])<=names and all(n.startswith('iburi_p') for n in anim['bones']),'Animação atua somente nas nuvens, sem sobrescrever o rig humano: '+str(stage))
        check(bones['body']['parent']=='waist' and bones['rightArm']['parent']=='body' and bones['rightLeg']['parent']=='waist','Rig acompanha tronco, braços e pernas: '+str(stage))
        check(len(attach['render_controllers'])==6 and all(n in controllers for n in attach['render_controllers']),'Seis fases de renderização existentes: '+str(stage))
        selected=set()
        for phase,rc in enumerate(attach['render_controllers']):
            row=controllers[rc]
            check(row['part_visibility'][1].get(f'iburi_p{phase}_*')=='!context.is_first_person || query.is_in_ui','Fase com máscara de bones e primeira pessoa: '+str(stage)+'/'+str(phase))
            selected.update(n for n in names if n.startswith(f'iburi_p{phase}_'))
        check(selected==set(anim['bones']),'Cada nuvem possui uma fase de opacidade: '+str(stage))
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
        for time,event in anim['particle_effects'].items():
            assert 0<=float(time)<anim['animation_length'];assert event['effect'] in attach['particle_effects'];assert event['locator'] in locators
        check(True,'Eventos de partículas possuem tempo, efeito e locator válidos: '+str(stage))
        file={1:'Iburi_Fumaca_I.bbmodel',2:'Iburi_Fumaca_II.bbmodel',3:'Iburi_Fumaca_Total.bbmodel'}[stage]
        path=ROOT/'Modelos_Blockbench'/file;model=read(path);editor=next(e for e in editors if e['stage']==stage)
        count=sum(len(b.get('cubes',[])) for b in bones.values())
        editable_cubes=sum(e.get('type','cube')=='cube' for e in model['elements'])
        check(model['meta']['model_format']=='bedrock' and count==editable_cubes==editor['cubes'],'BBMODEL editável corresponde à geometria: '+str(stage))
        check(base64.b64decode(model['textures'][0]['source'].split(',',1)[1])==rp[texture_path],'BBMODEL inclui a textura correta: '+str(stage))
        check(editor['texture_error']==0 and not editor['errors'] and len(editor['animations'])==1,'Modelo e animação importados no Blockbench sem erros: '+str(stage))
        check(hashlib.sha256(path.read_bytes()).hexdigest()==editor['source_sha256'],'Assinatura do projeto exportado pelo editor: '+str(stage))
        summary[str(stage)]={'nuvens':len(anim['bones']),'cubos':count,'bones':len(bones),'nivel':levels[stage-1],'periodo':anim['animation_length']}
    molang=ROOT/'Validacao_Molang.json'
    check(molang.exists() and read(molang)['resultado']=='APROVADO','Expressões e ciclos Molang avaliados numericamente')
    check(not (ROOT/'Previews').exists(),'Entrega sem prévias geradas')
    report={'resultado':'APROVADO','versao':[18,11,65],'base_sha256':manifest['base_sha256'],'addon_sha256':hashlib.sha256(addon.read_bytes()).hexdigest(),
      'minecraft_executado':False,'escopo':'Arquivos gerados/alterados validados; demais arquivos comparados byte a byte com a base.',
      'arquivos_preservados':unchanged,'arquivos_alterados':modified,'arquivos_adicionados':added,'modelos':summary,'verificacoes':CHECKS,'quantidade_verificacoes':len(CHECKS)}
    (ROOT/'Validacao.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['resultado','arquivos_preservados','quantidade_verificacoes','modelos']},ensure_ascii=False,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('base',type=Path);p.add_argument('addon',type=Path);a=p.parse_args();validate(a.base,a.addon)
