#!/usr/bin/env python3
"""Apply the Iburi overlay to the exact supplied SWBR base, preserving other bytes."""
from pathlib import Path
import argparse,hashlib,io,json,zipfile

def apply(base,output,root=None):
    root=root or (Path(__file__).resolve().parents[1] if Path(__file__).parent.name=='Fontes' else Path(__file__).resolve().parent)
    manifest=json.loads((root/'Integracao_Manifesto.json').read_text())
    digest=hashlib.sha256(base.read_bytes()).hexdigest()
    entries={k:v['original_entry'] for k,v in manifest['packs'].items()}
    if digest!=manifest['base_sha256']:
        compatible=next((b for b in manifest.get('compatible_bases',[]) if b['base_sha256']==digest),None)
        if compatible is None:raise ValueError('A addon de entrada não corresponde a uma das bases SWBR identificadas por SHA-256 no manifesto: 18.11.64 ou Iburi 18.11.65.')
        entries=compatible['pack_entries']
    mappings={entries[k]:(k,v) for k,v in manifest['packs'].items()}
    if base.resolve()==output.resolve():raise ValueError('Use um caminho diferente para a saída; preserve a addon de entrada.')
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(base) as original,zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as result:
        for entry in original.infolist():
            if entry.filename=='LEIA-ME_IBURI.md':continue
            data=original.read(entry.filename)
            if entry.filename not in mappings:
                result.writestr(entry,data);continue
            pack,config=mappings[entry.filename];buffer=io.BytesIO();written=set()
            with zipfile.ZipFile(io.BytesIO(data)) as before,zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as after:
                for file in before.infolist():
                    content=before.read(file.filename)
                    if file.filename in config['files']:
                        content=(root/'Integracao'/pack/file.filename).read_bytes()
                        assert hashlib.sha256(content).hexdigest()==config['files'][file.filename]
                    after.writestr(file,content);written.add(file.filename)
                for file,checksum in config['files'].items():
                    if file in written:continue
                    content=(root/'Integracao'/pack/file).read_bytes();assert hashlib.sha256(content).hexdigest()==checksum
                    after.writestr(file,content)
            result.writestr(config['updated_entry'],buffer.getvalue())
        if (root/'README.md').exists():result.writestr('LEIA-ME_IBURI.md',(root/'README.md').read_bytes())
    return output

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('base',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args()
    print(apply(args.base,args.output))
