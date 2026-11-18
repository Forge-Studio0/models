"""Bake the venom colours into the SWBR skin textures used by the player."""
import io
import re

import numpy as np
from PIL import Image

SKIN_CONTROLLER_FILE = 'render_controllers/nzs_body_v1875.render_controllers.json'
SKIN_TEXTURE_DIR = 'textures/entity/swbr/aburame/pele'
VENOM_MODES = (2, 4, 6)
SKIN_CONTROLLER = re.compile(r'controller\.render\.swbr_v1875_custom\d+')
SKIN_ALIAS = re.compile(r'Texture\.((?:pele|nzs_soft|nzs_slim)\d+)')


def painted_alias(mode, alias):
    return f'swbr_aburame_pele{mode}_{alias}'


def skin_expression(original):
    result = original
    for mode in reversed(VENOM_MODES):
        painted = SKIN_ALIAS.sub(lambda match: 'Texture.' + painted_alias(mode, match[1]), original)
        result = f'v.swbr_aburame_skin_stage == {mode} ? ({painted}) : ({result})'
    return result


def apply_skin_binding(controllers, textures):
    aliases = set()
    for identifier, controller in controllers['render_controllers'].items():
        if not SKIN_CONTROLLER.fullmatch(identifier):
            continue
        original, = controller['textures']
        aliases.update(SKIN_ALIAS.findall(original))
        controller['textures'] = [skin_expression(original)]
    for mode in VENOM_MODES:
        for alias in sorted(aliases):
            key = painted_alias(mode, alias)
            textures[key] = f'{SKIN_TEXTURE_DIR}/{key}'
    return sorted(aliases)


def coating_mask(native, master, atlas, size):
    """Project the edited coat's alpha into the exact UVs of the live skin."""
    tiles = np.asarray(atlas)
    coats = {bone['parent']: bone['cubes'][0]['uv'] for bone in master['bones'] if '_coat_' in bone['name']}
    width, height = size
    uv_width = native['description']['texture_width']
    uv_height = native['description']['texture_height']
    x, y = np.meshgrid((np.arange(width) + .5) * uv_width / width,
                       (np.arange(height) + .5) * uv_height / height)
    opacity = np.zeros((height, width))
    region = np.zeros((height, width), dtype=bool)
    for bone in native['bones']:
        if bone['name'] not in coats:
            continue
        coated_faces = coats[bone['name']]
        for cube in bone.get('cubes', []):
            for face, source in cube['uv'].items():
                u0, v0 = source['uv']
                du, dv = source['uv_size']
                if abs(du) < 1e-6 or abs(dv) < 1e-6:
                    continue
                u, v = (x - u0) / du, (y - v0) / dv
                inside = (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
                if face in ('up', 'down'):
                    # Some small caps reuse pixels already mapped to a side.
                    inside &= ~region
                rotation = source.get('uv_rotation', 0)
                if rotation == 90:
                    u, v = v, 1 - u
                elif rotation == 180:
                    u, v = 1 - u, 1 - v
                elif rotation == 270:
                    u, v = 1 - v, u
                target = coated_faces[face]
                left, top = target['uv']
                span_x, span_y = target['uv_size']
                cols = (left + u[inside] * span_x).astype(int).clip(0, tiles.shape[1] - 1)
                rows = (top + v[inside] * span_y).astype(int).clip(0, tiles.shape[0] - 1)
                opacity[inside] = np.maximum(opacity[inside], tiles[rows, cols, 3] / 255)
                region |= inside
    return opacity


def tint_skin(original_png, opacity):
    original = np.array(Image.open(io.BytesIO(original_png)).convert('RGBA'))
    rgba = original.copy()
    rgb = original[:, :, :3].astype(float)
    luminance = rgb @ [.2126, .7152, .0722]
    violet = luminance[:, :, None] * np.array([.55, .39, .70]) + np.array([14, 8, 19])
    # Keep dark linework and masks. Recolour the light and midtones in place.
    strength = opacity * np.clip((luminance - 9) / 28, 0, 1)
    strength *= original[:, :, 3] > 0
    rgba[:, :, :3] = np.rint(rgb + strength[:, :, None] * (violet - rgb)).clip(0, 255).astype('uint8')
    return Image.fromarray(rgba, 'RGBA')
