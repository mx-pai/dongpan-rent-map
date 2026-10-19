"""Validate public evidence, time thresholds and website files before deployment."""
import json
import math
import pathlib
import re
from urllib.parse import urlsplit

root = pathlib.Path(__file__).resolve().parents[1]
site = root / 'site'
data = json.loads((site / 'data.json').read_text())
ids = set()
numbers = set()
for point in data['points']:
    assert point['id'] not in ids, f'Duplicate POI {point["id"]}'
    assert point['map_id'] not in numbers, 'Duplicate display number'
    ids.add(point['id']); numbers.add(point['map_id'])
    lon, lat = map(float, point['location'].split(','))
    assert 115 < lon < 118 and 39 < lat < 42, 'Unexpected Beijing coordinate'
    for mode, flag, limit in [('walk', 'walk_ok', 1800), ('bike', 'bike_ok', 1200), ('metro', 'metro_auto_ok', 1200)]:
        route = point.get(mode)
        assert point[flag] == bool(route and route['seconds'] <= limit), f'{point["name"]}: {flag}'
        if route:
            assert math.isfinite(route['seconds']) and route['seconds'] >= 0
    segment = point.get('segment_best')
    if segment:
        legs = [segment[k]['seconds'] for k in ['access', 'metro', 'egress']]
        assert abs(sum(legs) - segment['seconds']) < .01, f'{point["name"]}: segmented total'
        assert segment['rounded_total_min'] == sum(math.ceil(x / 60) for x in legs)
    assert point['segment_ok'] == bool(segment and segment['seconds'] <= 1200)
    assert point['eligible'] == any(point[k] for k in ['walk_ok', 'bike_ok', 'metro_auto_ok', 'segment_ok'])
    research = point.get('research')
    if research:
        assert research.get('checked_at') and research.get('status')
        for record in research.get('listings', []):
            assert record.get('source_url') and record.get('evidence_type') and record.get('status')
            assert urlsplit(record['source_url']).scheme == 'https'
            price = record.get('price_month')
            if price is not None:
                assert isinstance(price, (int, float)) and price > 0
        assert isinstance(research.get('missing_fields'), list)

for path in site.rglob('*'):
    if not path.is_file() or path.suffix not in ['.html', '.js', '.css', '.json', '.md']:
        continue
    text = path.read_text()
    assert not re.search(r'\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})', text), f'Token in {path}'
    assert not re.search(r'(?:[?&]key=|api[_-]?key\s*[=:]\s*[\"\x27]?)[a-f0-9]{32}', text, re.I), f'API key in {path}'
    assert not re.search(r'/Users/[^\s"\x27<>]+', text), f'Local path in {path}'
    if path.suffix == '.html':
        for href in re.findall(r'(?:href|src)=["\x27]([^"\x27]+)', text):
            if href.startswith(('https:', 'http:', '#', 'data:', 'mailto:', 'tel:')):
                continue
            target = path.parent / href.split('#')[0].split('?')[0]
            assert target.exists(), f'Missing asset {path.name}: {href}'

print(json.dumps({
    'points': len(ids),
    'eligible': sum(p['eligible'] for p in data['points']),
    'with_monthly_samples': sum(any(r.get('price_month') for r in p.get('research', {}).get('listings', [])) for p in data['points']),
    'with_research': sum(bool(p.get('research')) for p in data['points']),
    'public_assets': 'validated',
}, ensure_ascii=False))
