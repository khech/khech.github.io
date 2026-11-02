"""Export selected current archive records; originals are never modified.

Requires Pillow. Local provenance stays in ignored 99_Agent, outside public data.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
from PIL import Image, ImageOps, ImageDraw

ARCHIVE = Path(r'G:\My Drive\0-Khech-Gallery')
SITE = Path(__file__).resolve().parents[1]
PAINTINGS = '02_Works/01_Paintings'
MAIN = {'Streets', 'Abstract Begining', 'Abstract Tbilisi'}
INITIAL_IDS = ['STR-TBS-26-GG', 'ABS-TBS-23-05', 'STR-TBS-26-EYES',
               'ABS-MOW-18-10', 'STR-TBS-26-TEETH-02', 'ABS-MOW-18-01',
               'STR-M-TBS-26-02', 'STR-M-TBS-26-01']
ABSTRACT_CARDS = ['02_Abstract/Abstract Tbilisi/Black and Red.md',
                  '02_Abstract/Abstract Begining/Mist.md',
                  '02_Abstract/Abstract Begining/Insight.md']


def fields(path):
    text = path.read_text(encoding='utf-8-sig')
    yaml = text.split('---', 2)[1]
    return {m[1]: m[2].strip().strip('\"\'')
            for m in re.finditer(r'^([\w ]+):[ \t]*([^\r\n]*)$', yaml, re.M)}


def links(text):
    return re.findall(r'\[\[([^\]|]+?)(?:\\?\|[^\]]*)?\]\]', text)


def linked_record(text, root):
    target = links(text)
    if not target:
        raise ValueError(f'Missing series/record link: {text}')
    return root / (target[0] + '.md')


def parse_dimensions(text):
    match = re.fullmatch(r'(\d+)\s*[×xх]\s*(\d+)\s*(?:(?:cm|см)\s*)?(?:each)?', text)
    if not match:
        raise ValueError(f'Missing or unrecognised dimensions: {text!r}')
    dimensions = [int(match[1]), int(match[2])]
    category = {(16, 16): 'S', (30, 40): 'M', (40, 50): 'M',
                (50, 70): 'M', (70, 100): 'L'}.get(tuple(sorted(dimensions)))
    if category is None:
        raise ValueError(f'Unclassified dimensions: {text!r}')
    return dimensions, category


def resolve_series(record, root, seen=None):
    seen = set() if seen is None else seen
    if record in seen:
        raise ValueError(f'Circular series hierarchy: {record}')
    seen.add(record)
    data = fields(record)
    title = data.get('Title')
    if data.get('kind') == 'series' and title in MAIN:
        return title
    parent = data.get('parent_series') or data.get('series')
    if not parent:
        raise ValueError(f'No main series for {record}')
    return resolve_series(linked_record(parent, root), root, seen)


def photo_sources(work_id, image_cell, root):
    sources = [root / link for link in links(image_cell)]
    if work_id == 'STR-M-TBS-26-01':
        sources = [sources[0].with_name('STR-M-TBS-26-01__IMG-009__crop.jpg')] + sources[1:]
    if work_id == 'STR-M-TBS-26-02':
        sources = [p for p in sources if '__IMG-011__' not in p.name]
    # A mapped full view takes precedence over a side photograph.
    sources.sort(key=lambda p: 0 if any(tag in p.stem for tag in ('__front', '__crop', '__view', '__framed')) else 1)
    if not sources or any(not p.is_file() or not p.name.startswith(work_id + '__') for p in sources):
        raise ValueError(f'Missing or mismatched mapped photograph for {work_id}')
    return sources


def build_catalog(root=ARCHIVE):
    painting_root = root / PAINTINGS
    hierarchy = {}
    for record in painting_root.rglob('*.md'):
        text = record.read_text(encoding='utf-8-sig')
        if not text.startswith('---'):
            continue
        data = fields(record)
        if data.get('kind') == 'series':
            hierarchy[data['Title']] = resolve_series(record, root)

    works = []
    streets_root = painting_root / '01_Streets'
    for record in sorted(streets_root.rglob('*.md')):
        data = fields(record)
        if data.get('kind') != 'series':
            continue
        for line in record.read_text(encoding='utf-8-sig').splitlines():
            if not re.match(r'^\| STR-', line):
                continue
            cells = [cell.strip() for cell in re.split(r'(?<!\\)\|', line.strip().strip('|'))]
            if len(cells) != 8:
                raise ValueError(f'Unexpected artwork table in {record}: {line}')
            work_id, title, year, location, dim, photos, status, price = cells
            source_record = record
            if links(title):
                source_record = linked_record(title, root)
                individual = fields(source_record)
                if individual['id'] != work_id:
                    raise ValueError(f'Wrong individual card for {work_id}')
                title, year, location, dim, status, price = [individual.get(key, '') for key in
                    ('Title', 'year', 'location', 'dimensions', 'availability', 'price')]
            dimensions, category = parse_dimensions(dim)
            works.append(dict(id=work_id, title=title, year=year, location=location,
                price=price or None, sold=status.lower() == 'sold', series=resolve_series(record, root),
                subseries=data['Title'] if data['Title'] != 'Streets' else None,
                dimensionsCm=dimensions, sizeCategory=category,
                sources=photo_sources(work_id, photos, root), record=source_record))

    for card in ABSTRACT_CARDS:
        record = painting_root / card
        data = fields(record)
        work_id = data['id']
        sources = photo_sources(work_id, data['cover'], root)
        if work_id == 'ABS-MOW-18-01':
            sources.append(sources[0].with_name('ABS-MOW-18-01__IMG-052__front.jpg'))
        dimensions, category = parse_dimensions(data['dimensions'])
        works.append(dict(id=work_id, title=data['Title'], year=data['year'], location=data['location'],
            price=data.get('price') or None, sold=data.get('availability', '').lower() == 'sold',
            series=resolve_series(record, root), subseries=None, dimensionsCm=dimensions,
            sizeCategory=category, sources=sources, record=record))
    ids = [w['id'] for w in works]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate artwork IDs')
    works.sort(key=lambda w: INITIAL_IDS.index(w['id']) if w['id'] in INITIAL_IDS else len(INITIAL_IDS))
    return works, hierarchy


def export_photo(source, assets):
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
    image.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
    image.save(assets / (source.stem + '.jpg'), quality=90, optimize=True)
    preview = image.copy()
    preview.thumbnail((640, 640), Image.Resampling.LANCZOS)
    preview.save(assets / (source.stem + '--preview.jpg'), quality=87, optimize=True)
    if digest != hashlib.sha256(source.read_bytes()).hexdigest():
        raise RuntimeError(f'Source changed: {source}')
    view = dict(id=source.stem, width=image.width, height=image.height,
                preview='/images/khech-gallery/' + source.stem + '--preview.jpg',
                image='/images/khech-gallery/' + source.stem + '.jpg')
    return view, dict(source=str(source), sha256=digest), preview


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, default=ARCHIVE)
    parser.add_argument('--site', type=Path, default=SITE)
    args = parser.parse_args()
    works, hierarchy = build_catalog(args.archive)
    assets = args.site / 'images/khech-gallery'
    technical = args.site / '99_Agent/khech-gallery'
    assets.mkdir(parents=True, exist_ok=True)
    technical.mkdir(parents=True, exist_ok=True)
    public, provenance = [], []
    sheet = Image.new('RGB', (220 * 6, 270 * ((len(works) + 5) // 6)), 'white')
    draw = ImageDraw.Draw(sheet)
    for index, work in enumerate(works):
        views, evidence = [], []
        for source in work['sources']:
            view, proof, preview = export_photo(source, assets)
            views.append(view)
            evidence.append(proof)
            if len(views) == 1:
                preview.thumbnail((200, 220))
                x, y = index % 6 * 220, index // 6 * 270
                sheet.paste(preview, (x + (220 - preview.width) // 2, y))
                draw.text((x + 5, y + 225), work['id'], fill='black')
        result = {key: value for key, value in work.items() if key not in ('sources', 'record')}
        result.update({key: value for key, value in views[0].items() if key != 'id'})
        result['views'] = views
        public.append(result)
        provenance.append(dict(id=work['id'], record=str(work['record']), views=evidence))
    (assets / 'works.json').write_text(json.dumps(public, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (technical / 'sources.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (technical / 'series-audit.json').write_text(json.dumps(hierarchy, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    sheet.save(technical / 'streets-contact-sheet.jpg')
    print(json.dumps(dict(works=len(public), streets=sum(w['series'] == 'Streets' for w in public),
        views=sum(len(w['views']) for w in public), hierarchy=hierarchy, originals_unchanged=True)))


if __name__ == '__main__':
    main()
