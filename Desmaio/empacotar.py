"""Aplica a correção de desmaio ao cumulativo Chinoike 18.11.82 e audita o pacote."""

import argparse
import copy
import hashlib
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parent
BASE_HASH = '2bc3abed3016129ea519c2c6e8f828b471ee9ef232eb6ff129bd74c1ca760e2b'
BASE = ROOT.parent / 'Chinoike' / 'Chinoike_Cumulativo.mcaddon'
VERSION = [18, 11, 83]
DRIVER_VERSION = [1, 0, 10]
NATIVE_UUID = '631e5d67-4d2a-4a67-a71d-bef0ea6d1136'
PACK_UUIDS = {'BP': '82dafe0d-c36f-4665-9df0-371f6d8b2a55',
              'RP': 'ef513a51-2cb2-4cc5-b300-5ef44201c3f5', 'Nativo': NATIVE_UUID}
PACK_NAMES = {'BP': 'SWBR_BP_v18.11.83_DESMAIO.mcpack', 'RP': 'SWBR_RP_v18.11.83_DESMAIO.mcpack',
              'Nativo': 'SWBR_Desmaio_Nativo_BP_v1.0.10.mcpack'}
RELEASE_NOTES = 'LEIA-ME_DESMAIO.md'
FLOOR_EVENT = 'swbr:floor_allow_death30'
FLOOR_GROUP = 'swbr:real_death30'


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def zip_info(name):
    entry = ZipInfo(name, (2026, 11, 23, 0, 0, 0))
    entry.compress_type = ZIP_DEFLATED
    return entry


def write_json(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def update_manifest(manifest, kind):
    revision = DRIVER_VERSION if kind == 'Nativo' else VERSION
    updated = copy.deepcopy(manifest)
    updated['header']['version'] = revision
    if kind == 'Nativo':
        updated['header']['name'] = 'SWBR · Desmaio Nativo 1.0.10'
        updated['header']['description'] = 'Serviço nativo para o desmaio, a morte definitiva e o transporte.'
    else:
        updated['header']['name'] = 'Shinobi World BR 18.11.83 · Desmaio'
        updated['header']['description'] = 'Shinobi World BR 18.11.83 | Correção de desmaio | Base Chinoike 18.11.82 cumulativa'
    for module in updated['modules']:
        module['version'] = revision
    for dep in updated.get('dependencies', []):
        if dep.get('uuid') in PACK_UUIDS.values():
            dep['version'] = DRIVER_VERSION if dep['uuid'] == NATIVE_UUID else VERSION
    return write_json(updated)


def update_player(data):
    entity = json.loads(data)['minecraft:entity']
    old = entity['events'][FLOOR_EVENT]
    remove = old['remove']['component_groups']
    assert old['add']['component_groups'] == [FLOOR_GROUP] and FLOOR_GROUP not in remove
    assert entity['component_groups'][FLOOR_GROUP]['minecraft:health']['min'] == 0
    # Reaplicar o mesmo evento precisa reinstalar o grupo de mínimo zero se uma
    # troca de atributo tiver sobrescrito a vida desde a primeira chamada.
    new = {'sequence': [{'remove': {'component_groups': [*remove, FLOOR_GROUP]}},
                        {'add': {'component_groups': [FLOOR_GROUP]}}]}
    compact = lambda event: json.dumps({FLOOR_EVENT: event}, separators=(',', ':')).encode()[1:-1]
    pattern = compact(old)
    assert data.count(pattern) == 1
    return data.replace(pattern, compact(new), 1)


def modifications(kind, original):
    result = {'manifest.json': update_manifest(json.loads(original.read('manifest.json')), kind)}
    if kind in ('BP', 'Nativo'):
        for path in sorted((ROOT / kind / 'scripts').glob('*.js')):
            result['scripts/' + path.name] = path.read_bytes()
    if kind == 'BP':
        path = 'entities/player.json'
        result[path] = update_player(original.read(path))
    return result


def rebuild_pack(blob, kind):
    output = io.BytesIO()
    with ZipFile(io.BytesIO(blob)) as source, ZipFile(output, 'w') as target:
        changes = modifications(kind, source)
        if not changes.keys() <= set(source.namelist()):
            raise ValueError(f'Arquivos base ausentes em {kind}.')
        for entry in source.infolist():
            name = entry.filename
            body = changes[name] if name in changes else source.read(name)
            target.writestr(copy.copy(entry), body)
    return output.getvalue()


def mcpack_names(archive):
    result = {}
    for item in archive.namelist():
        if not item.endswith('.mcpack'):
            continue
        with ZipFile(io.BytesIO(archive.read(item))) as pack:
            uuid = json.loads(pack.read('manifest.json'))['header']['uuid']
        kind = next((kind for kind, value in PACK_UUIDS.items() if uuid == value), None)
        if kind:
            if kind in result:
                raise ValueError(f'Duplicata no addon: {kind}.')
            result[kind] = item
    if set(result) != set(PACK_UUIDS):
        raise ValueError('BP, RP ou serviço nativo ausente.')
    return result


def archive_names(archive):
    entries = archive.namelist()
    assert len(entries) == len(set(entries)) and archive.testzip() is None
    return set(entries)


def verify(source_path, candidate_path, notes):
    with ZipFile(source_path) as source, ZipFile(candidate_path) as candidate:
        old, new = mcpack_names(source), mcpack_names(candidate)
        extra = archive_names(source) - set(old.values())
        assert new == PACK_NAMES and archive_names(candidate) == extra | set(new.values()) | {RELEASE_NOTES}
        assert all(source.read(path) == candidate.read(path) for path in extra)
        assert candidate.read(RELEASE_NOTES) == notes
        for kind in PACK_NAMES:
            with (ZipFile(io.BytesIO(source.read(old[kind]))) as original,
                  ZipFile(io.BytesIO(candidate.read(new[kind]))) as edited):
                entries = archive_names(original)
                assert entries == archive_names(edited)
                expected = modifications(kind, original)
                changed = set()
                for path in entries:
                    former, current = original.read(path), edited.read(path)
                    if current != former:
                        changed.add(path)
                    assert current == expected.get(path, former), f'{kind}/{path}'
                assert changed == set(expected), (kind, changed)
                print(f'{kind}: {len(entries) - len(changed)} arquivos preservados, {len(changed)} alterados.')
                for path in sorted(changed):
                    print(f'  {path}')


def build(base, output):
    if base.resolve() == output.resolve():
        raise ValueError('Use caminhos diferentes para a base e a saída.')
    if sha256(base.read_bytes()) != BASE_HASH:
        raise ValueError('Use a edição cumulativa Chinoike 18.11.82 publicada no repositório.')
    notes = (ROOT / 'README.md').read_bytes()
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent, prefix='.desmaio-') as tmp:
        partial = Path(tmp) / output.name
        with ZipFile(base) as original, ZipFile(partial, 'w') as target:
            kinds = {name: kind for kind, name in mcpack_names(original).items()}
            for entry in original.infolist():
                blob = original.read(entry)
                kind = kinds.get(entry.filename)
                if kind:
                    target.writestr(zip_info(PACK_NAMES[kind]), rebuild_pack(blob, kind))
                else:
                    target.writestr(copy.copy(entry), blob)
            target.writestr(zip_info(RELEASE_NOTES), notes)
        verify(base, partial, notes)
        partial.replace(output)
    print(f'{output.name} — SHA-256 {sha256(output.read_bytes())}')


if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('base', nargs='?', type=Path, default=BASE)
    args.add_argument('saida', nargs='?', type=Path, default=ROOT / 'SWBR_18.11.83_Cumulativo.mcaddon')
    parsed = args.parse_args()
    build(parsed.base, parsed.saida)
