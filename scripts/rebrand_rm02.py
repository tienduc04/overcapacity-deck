"""Make the Sketchfab "Container Ship" by RM02 (CC-BY-4.0) usable in the deck.

Erases the real carriers' marks from its textures, paints the yellow boxes Hapag orange, letters
HAPAG-LLOYD on the hull and the orange boxes, shrinks every texture to 2K and writes a new GLB.
The source GLB stays untouched (gitignored, see docs/third-party-assets.md).

Usage: python scripts/rebrand_rm02.py assets-src/models/rm02/container_ship.glb public/models/ship-rm02.glb
"""
import io
import json
import os
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT = 'C:/Windows/Fonts/ariblk.ttf'  # Arial Black
SIZE = 2048  # output texture size

# Boxes (x0, y0, x1, y1) on the 4096 px source textures that hold real carriers' marks, found by eye.
# grey_only: erase only unsaturated pixels (the winged funnel logo sits on red paint).
HULL_MARKS = [
    ((1650, 3610, 2450, 4070), False),  # "MRC" twice in the black band
    ((20, 40, 220, 120), False),  # "MRC LINDA" (name boards)
    ((1760, 70, 1960, 160), False),
    ((2420, 2340, 2570, 2395), False),
    ((370, 20, 580, 50), False),  # small red lettering
    ((1390, 30, 1590, 60), False),
    ((670, 70, 1270, 310), True),  # winged logo
]
BOX_MARKS = [
    (64, 850, 830, 1210),  # msc-like, on yellow
    (1357, 42, 1463, 414),  # MRC, on grey
    (2226, 42, 2332, 414),
    (933, 159, 1124, 223),  # small marks, on maroon
    (1791, 159, 1972, 223),
    (2660, 763, 3000, 1262),  # CMA CGM, on navy
    (3095, 763, 3435, 1262),
    (3773, 3350, 3858, 3434),  # small msc
    (3392, 3890, 3498, 3943),  # small CMA CGM
]
# HAPAG-LLOYD: (centre x, centre y, letter height px) on the 4096 textures, and how the source
# lettering there is oriented (checked against the erased marks).
HULL_TEXT = [(2130, 3713, 120), (1983, 3963, 120)]  # upside down, like "MRC"
BOX_TEXT = [(210, 1030, 120), (660, 1030, 120)]  # turned 90 degrees and flipped, like "CMA CGM"


def erase(a, box, grey_only=False):
    """Paint over everything in the box that differs from its background (the box's median colour)."""
    x0, y0, x1, y1 = box
    r = a[y0:y1, x0:x1, :3].astype(int)
    bg = np.median(r.reshape(-1, 3), axis=0).astype(int)
    mask = np.abs(r - bg).max(-1) > 40
    if grey_only:
        mask &= (r.max(-1) - r.min(-1)) < 50
    mask = np.array(Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))) > 0
    a[y0:y1, x0:x1, :3][mask] = bg


def lettering(img, centre, height, turn):
    """White HAPAG-LLOYD, `height` px tall, centred on `centre`, oriented by `turn`."""
    font = ImageFont.truetype(FONT, int(height * 1.38))  # Arial Black caps are ~0.72 em
    x0, y0, x1, y1 = font.getbbox('HAPAG-LLOYD')
    mask = Image.new('L', (x1 - x0, y1 - y0))
    ImageDraw.Draw(mask).text((-x0, -y0), 'HAPAG-LLOYD', font=font, fill=255)
    mask = turn(mask)
    white = Image.new(img.mode, mask.size, (255,) * len(img.mode))
    img.paste(white, (centre[0] - mask.width // 2, centre[1] - mask.height // 2), mask)


def hapag_orange(img):
    """Shift yellow paint to orange, keeping its shading."""
    hsv = np.array(img.convert('RGB').convert('HSV')).astype(int)
    yellow = (hsv[..., 0] > 25) & (hsv[..., 0] < 50) & (hsv[..., 1] > 90)
    hsv[..., 0][yellow] = 15  # about 21 degrees
    hsv[..., 1][yellow] = np.minimum(hsv[..., 1][yellow] * 4 // 3, 235)
    return Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB')


def rebrand_hull(img):
    a = np.array(img)
    for box, grey in HULL_MARKS:
        erase(a, box, grey)
    img = Image.fromarray(a)
    for x, y, h in HULL_TEXT:
        lettering(img, (x, y), h, lambda m: m.transpose(Image.FLIP_TOP_BOTTOM))
    return img


def rebrand_boxes(img):
    a = np.array(img)
    for box in BOX_MARKS:
        erase(a, box)
    img = hapag_orange(Image.fromarray(a))
    for x, y, h in BOX_TEXT:
        lettering(img, (x, y), h, lambda m: m.rotate(90, expand=True).transpose(Image.FLIP_TOP_BOTTOM))
    return img


def read_glb(path):
    data = open(path, 'rb').read()
    magic, _, length = struct.unpack_from('<III', data)
    assert magic == 0x46546C67, 'not a GLB'
    chunks, off = {}, 12
    while off < length:
        size, kind = struct.unpack_from('<II', data, off)
        chunks[kind] = data[off + 8 : off + 8 + size]
        off += 8 + size
    return json.loads(chunks[0x4E4F534A]), chunks[0x004E4942]


def write_glb(path, gltf, views):
    """views: bytes for every bufferView, in order. Packs them into one 4-byte aligned buffer."""
    blob = bytearray()
    for view, data in zip(gltf['bufferViews'], views):
        view.update(buffer=0, byteOffset=len(blob), byteLength=len(data))
        blob += data + b'\0' * (-len(data) % 4)
    gltf['buffers'] = [{'byteLength': len(blob)}]
    text = json.dumps(gltf, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(blob)))
        f.write(struct.pack('<II', len(text), 0x4E4F534A) + text)
        f.write(struct.pack('<II', len(blob), 0x004E4942) + bytes(blob))


def main(src, dst):
    gltf, blob = read_glb(src)
    assert len(gltf['buffers']) == 1
    views = [blob[v.get('byteOffset', 0) : v.get('byteOffset', 0) + v['byteLength']] for v in gltf['bufferViews']]
    image_of = lambda tex: gltf['textures'][tex['index']]['source']
    materials = {m['name']: m for m in gltf['materials']}
    edits = {
        image_of(materials['Hull']['pbrMetallicRoughness']['baseColorTexture']): rebrand_hull,
        image_of(materials['Containers']['pbrMetallicRoughness']['baseColorTexture']): rebrand_boxes,
    }
    for i, image in enumerate(gltf['images']):
        img = Image.open(io.BytesIO(views[image['bufferView']]))
        assert img.size == (4096, 4096), f'image {i}: mark boxes assume 4096 px, got {img.size}'
        img = img.convert('RGBA' if img.mode in ('RGBA', 'LA', 'P') else 'RGB')
        if img.mode == 'RGBA' and img.getchannel('A').getextrema()[0] == 255:
            img = img.convert('RGB')  # alpha unused
        if i in edits:
            img = edits[i](img)
        img = img.resize((SIZE, SIZE), Image.LANCZOS)
        out = io.BytesIO()
        if img.mode == 'RGBA':
            img.save(out, 'PNG', optimize=True)
            image['mimeType'] = 'image/png'
        else:
            img.save(out, 'JPEG', quality=90)
            image['mimeType'] = 'image/jpeg'
        views[image['bufferView']] = out.getvalue()
    write_glb(dst, gltf, views)

    # self-check: the written file reads back with every image decodable
    check, blob = read_glb(dst)
    for image in check['images']:
        v = check['bufferViews'][image['bufferView']]
        assert Image.open(io.BytesIO(blob[v['byteOffset'] : v['byteOffset'] + v['byteLength']])).size == (SIZE, SIZE)
    print(f'{dst}: {os.path.getsize(dst) / 1e6:.1f} MB, {len(check["images"])} textures at {SIZE} px')


if __name__ == '__main__':
    main(*sys.argv[1:3])
