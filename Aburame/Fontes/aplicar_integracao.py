#!/usr/bin/env python3
"""Apply the Aburame overlay to the exact approved SWBR 18.11.68 base."""
from pathlib import Path
import argparse,hashlib,io,json,zipfile

def apply(base,output,root=None):
    root=root or (Path(__file__).resolve().parents[1] if Path(__file__).parent.name=='Fontes' else Path(__file__).resolve().parent)
    manifest=json.loads((root/'Integracao_Manifesto.json').read_text())
    if hashlib.sha256(base.read_bytes()).hexdigest()!=manifest['base_sha256']:
        raise ValueError('Use a addon SWBR 18.11.68 com o Iburi aprovado. A entrada precisa corresponder ao SHA-256 indicado no manifesto.')
    if base.resolve()==output.resolve():raise ValueError('Preserve a entrada: escolha outro arquivo para a saída.')
    mappings={v['original_entry']:(k,v) for k,v in manifest['packs'].items()};output.parent.mkdir(exist_ok=True,parents=True)
    with zipfile.ZipFile(base) as before,zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as after:
        for outer_entry in before.infolist():
            if outer_entry.filename=='LEIA-ME_ABURAME.md':continue
            data=before.read(outer_entry.filename)
            if outer_entry.filename not in mappings:after.writestr(outer_entry,data);continue
            pack,config=mappings[outer_entry.filename];buffer=io.BytesIO();written=set()
            with zipfile.ZipFile(io.BytesIO(data)) as original,zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as target:
                for entry in original.infolist():
                    content=original.read(entry.filename)
                    if entry.filename in config['files']:
                        content=(root/'Integracao'/pack/entry.filename).read_bytes()
                        assert hashlib.sha256(content).hexdigest()==config['files'][entry.filename]
                    target.writestr(entry,content);written.add(entry.filename)
                for name,digest in config['files'].items():
                    if name in written:continue
                    content=(root/'Integracao'/pack/name).read_bytes();assert hashlib.sha256(content).hexdigest()==digest;target.writestr(name,content)
            after.writestr(config['updated_entry'],buffer.getvalue())
        if (root/'README.md').exists():after.writestr('LEIA-ME_ABURAME.md',(root/'README.md').read_bytes())
    return output

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('base',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args();print(apply(args.base,args.output))
