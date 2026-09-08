"""Build isolated PNG atlas candidates for every numbered PNG sequence (Pillow).
Usage: python scripts/audit-sprite-atlases.py OUTPUT_DIRECTORY
Never changes source assets or the game's manifest.
"""
import json
import math
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
output = Path(sys.argv[1]).resolve()
output.mkdir(parents=True, exist_ok=True)
groups = defaultdict(list)
other = []
for directory, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules', 'reports', 'dist', 'coverage')]
    for name in files:
        path = Path(directory) / name
        if path.suffix.lower() not in ('.png', '.webp', '.gif', '.jpg', '.jpeg'):
            continue
        match = re.fullmatch(r'(.*?)(\d+)\.png', name, re.I)
        if match:
            groups[(path.parent.relative_to(root).as_posix(), match[1])].append((int(match[2]), path))
        else:
            other.append(path.relative_to(root).as_posix())

report = {'groups': [], 'standaloneImages': other, 'errors': [], 'maxAtlasSide': 4096, 'padding': 2}
for group_index, ((directory, prefix), entries) in enumerate(sorted(groups.items())):
    entries.sort()
    if len(entries) < 2:
        report['standaloneImages'].extend(p.relative_to(root).as_posix() for _, p in entries)
        continue
    frames = []
    metadata = []
    for number, path in entries:
        try:
            with Image.open(path) as source:
                metadata.append({k: str(v)[:100] for k, v in source.info.items() if k in ('icc_profile', 'gamma', 'srgb', 'chromaticity')})
                frames.append(source.convert('RGBA'))
        except Exception as error:
            report['errors'].append({'file': str(path.relative_to(root)), 'error': str(error)})
    if len(frames) != len(entries):
        continue
    width = max(im.width for im in frames)
    height = max(im.height for im in frames)
    cell_w, cell_h = width + 4, height + 4
    group = {'id': group_index, 'directory': directory, 'prefix': prefix, 'count': len(entries),
             'sourceBytes': sum(p.stat().st_size for _, p in entries), 'sourcePixels': sum(im.width * im.height for im in frames),
             'variableDimensions': len({im.size for im in frames}) > 1, 'colorMetadata': any(metadata),
             'numberGaps': [i for i in range(entries[0][0], entries[-1][0] + 1) if i not in {n for n, _ in entries}],
             'pages': [], 'atlasBytes': 0, 'atlasPixels': 0, 'rawRgbaEqual': True}
    if max(cell_w, cell_h) > 4096:
        group['skipped'] = 'A source frame exceeds the 4096-pixel candidate limit'
        report['groups'].append(group)
        continue
    columns = max(1, min(4096 // cell_w, math.ceil(math.sqrt(len(frames) * cell_h / cell_w))))
    capacity = columns * (4096 // cell_h)
    for start in range(0, len(frames), capacity):
        batch = frames[start:start + capacity]
        rows = math.ceil(len(batch) / columns)
        sheet = Image.new('RGBA', (columns * cell_w, rows * cell_h))
        records = []
        for local, im in enumerate(batch):
            x, y = local % columns * cell_w + 2, local // columns * cell_h + 2
            sheet.paste(im, (x, y))
            # Extend edge pixels into a two-pixel border to prevent filtering bleed.
            sheet.paste(im.crop((0, 0, 1, im.height)).resize((2, im.height)), (x - 2, y))
            sheet.paste(im.crop((im.width - 1, 0, im.width, im.height)).resize((2, im.height)), (x + im.width, y))
            sheet.paste(sheet.crop((x - 2, y, x + im.width + 2, y + 1)).resize((im.width + 4, 2)), (x - 2, y - 2))
            sheet.paste(sheet.crop((x - 2, y + im.height - 1, x + im.width + 2, y + im.height)).resize((im.width + 4, 2)), (x - 2, y + im.height))
            records.append({'src': entries[start + local][1].relative_to(root).as_posix(), 'x': x, 'y': y, 'w': im.width, 'h': im.height})
        name = f'{group_index}-{start}.png'
        sheet.save(output / name, compress_level=6)
        with Image.open(output / name) as decoded:
            for record, original in zip(records, batch):
                x, y, w, h = (record[k] for k in ('x', 'y', 'w', 'h'))
                if decoded.crop((x, y, x + w, y + h)).tobytes() != original.tobytes():
                    group['rawRgbaEqual'] = False
        group['atlasBytes'] += (output / name).stat().st_size
        group['atlasPixels'] += sheet.width * sheet.height
        group['pages'].append({'file': name, 'width': sheet.width, 'height': sheet.height, 'frames': records})
    report['groups'].append(group)
    for im in frames:
        im.close()
    if len(report['groups']) % 25 == 0:
        print(f"Built {len(report['groups'])} sequences", flush=True)

(output / 'inventory.json').write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
print(json.dumps({'sequences': len(report['groups']), 'frames': sum(g['count'] for g in report['groups']),
                  'standaloneImages': len(report['standaloneImages']), 'errors': len(report['errors'])}), flush=True)
