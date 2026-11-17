#!/usr/bin/env python3
"""Package the already validated addon, editable projects and integration files."""
from pathlib import Path
import hashlib,json,zipfile

ROOT=Path(__file__).resolve().parents[1]

def package():
    addon=ROOT/'Iburi.mcaddon'
    validation=json.loads((ROOT/'Validacao.json').read_text())
    assert validation['resultado']=='APROVADO'
    assert hashlib.sha256(addon.read_bytes()).hexdigest()==validation['addon_sha256']
    integration=ROOT/'Iburi_Integracao.zip'
    documents=['README.md','Referencias.md','Revisao_18.11.68.md','Integracao_Manifesto.json','Validacao.json','Validacao_Base_18.11.64.json','Validacao_Base_18.11.65.json','Validacao_Base_18.11.66.json','Validacao_Blockbench.json','Validacao_Molang.json','Validacao_Exposicao.json']
    for name in ['Validacao_Base_18.11.64.json','Validacao_Base_18.11.65.json','Validacao_Base_18.11.66.json']:
        report=json.loads((ROOT/name).read_text())
        assert report['resultado']=='APROVADO' and report['addon_sha256']==validation['addon_sha256']
    with zipfile.ZipFile(integration,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as output:
        for name in documents:output.write(ROOT/name,name)
        output.write(ROOT/'Fontes/aplicar_integracao.py','aplicar_integracao.py')
        for folder in ['Integracao','Modelos_Blockbench','Fontes']:
            for file in sorted((ROOT/folder).rglob('*')):
                if not file.is_file() or '__pycache__' in file.parts or file.suffix=='.pyc':continue
                output.write(file,file.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(ROOT/'Iburi.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as output:
        for name in ['Iburi.mcaddon','Iburi_Integracao.zip',*documents]:output.write(ROOT/name,name)
        for file in sorted((ROOT/'Modelos_Blockbench').glob('*.bbmodel')):output.write(file,file.relative_to(ROOT).as_posix())
    files=[ROOT/name for name in ['Iburi.mcaddon','Iburi.zip','Iburi_Integracao.zip']]+sorted((ROOT/'Modelos_Blockbench').glob('*.bbmodel'))
    (ROOT/'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.relative_to(ROOT).as_posix()}\n' for file in files))
    for file in files:
        if file.suffix in ['.zip','.mcaddon']:
            with zipfile.ZipFile(file) as archive:
                assert archive.testzip() is None and len(archive.namelist())==len(set(archive.namelist()))
        print(file.name,file.stat().st_size)

if __name__=='__main__':package()
