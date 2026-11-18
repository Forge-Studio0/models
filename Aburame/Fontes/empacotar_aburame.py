#!/usr/bin/env python3
"""Package the validated addon, integration sources and editable projects."""
from pathlib import Path
import hashlib,json,zipfile

ROOT=Path(__file__).resolve().parents[1]
DOCS=['README.md','Referencias.md','Relatorio_Tecnico.md','Integracao_Manifesto.json','Validacao.json','Validacao_Blockbench.json','Validacao_Molang.json','Validacao_Visual_Estatica.json']

def files(folder):
    return [p for p in sorted((ROOT/folder).rglob('*')) if p.is_file() and '__pycache__' not in p.parts and 'node_modules' not in p.parts and p.suffix!='.pyc']
def make_zip(target,entries):
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for path,name in entries:z.write(path,name)
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        assert len(z.namelist())==len(set(z.namelist()))
        for path,name in entries:assert z.read(name)==path.read_bytes()
def package():
    validation=json.loads((ROOT/'Validacao.json').read_text())
    assert validation['resultado']=='APROVADO'
    assert validation['addon_sha256']==hashlib.sha256((ROOT/'Aburame.mcaddon').read_bytes()).hexdigest()
    projects=files('Modelos_Blockbench');assert len(projects)==6 and all(p.suffix=='.bbmodel' for p in projects)
    common=[(ROOT/n,n) for n in DOCS]+[(p,p.relative_to(ROOT).as_posix()) for p in projects]
    integration=common+[(p,p.relative_to(ROOT).as_posix()) for folder in ['Integracao','Fontes'] for p in files(folder)]
    integration.append((ROOT/'Fontes/aplicar_integracao.py','aplicar_integracao.py'))
    make_zip(ROOT/'Aburame_Integracao.zip',integration)
    complete=common+[(ROOT/n,n) for n in ['Aburame.mcaddon','Aburame_Integracao.zip']]
    make_zip(ROOT/'Aburame.zip',complete)
    targets=[ROOT/n for n in ['Aburame.mcaddon','Aburame_Integracao.zip','Aburame.zip']]+projects
    (ROOT/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(ROOT).as_posix()+'\n' for p in targets))
    print(json.dumps({p.name:p.stat().st_size for p in targets},indent=2))

if __name__=='__main__':package()
