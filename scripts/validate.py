"""Validate public evidence, time thresholds and website files before deployment."""
import json
import math
import pathlib
import re
import struct
import sys
from collections import Counter
from urllib.parse import urlsplit

root = pathlib.Path(__file__).resolve().parents[1]
site = root / 'site'
data = json.loads((site / 'data.json').read_text())
sys.path.insert(0, str(root))
from src.rental_evidence import canonical_url, date_only
audit = data['evidence_audit']
all_records = [r for p in data['points'] for r in p.get('research', {}).get('listings', [])]
assert audit == json.loads((site / 'evidence-audit.json').read_text())
assert audit['records'] == len(all_records)
assert audit['current_price_records'] == sum(r['current_quote_eligible'] for r in all_records)
assert audit['unique_urls'] == len({canonical_url(r['source_url']) for r in all_records})
assert audit['direct_pages'] == len({canonical_url(r['source_url']) for r in all_records if r['direct_read']})
assert audit['statuses'] == dict(Counter(r['freshness']['code'] for r in all_records))
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
            if record['current_quote_eligible']:
                verification = record['verification']
                assert record['direct_read'] and verification['method'] in ['direct_http', 'browser_rendered']
                assert verification['http_status'] == 200 and verification['readable_body']
                age = (date_only(audit['as_of'])-date_only(verification['read_at'])).days
                assert 0 <= age <= 7
                assert record['availability_status'] in ['unconfirmed', 'source_available']
                assert record['freshness']['code'] == 'page_price'
                assert not record.get('historical')
            if record['freshness']['code'] in ['full', 'future', 'expired', 'inactive', 'reference', 'historical']:
                assert not record['current_quote_eligible']
            # Keep user activity independent from any evidenced publication date.
            assert record['freshness']['publication_date_known'] == bool(record.get('original_published_at') or record.get('listing_updated_at'))
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
    'with_recent_page_quotes': sum(bool(p['page_quote_count']) for p in data['points']),
    'direct_pages': audit['direct_pages'],
    'with_research': sum(bool(p.get('research')) for p in data['points']),
    'public_assets': 'validated',
}, ensure_ascii=False))

# Georeferenced local basemap files must cover all published point coordinates.
manifest = json.loads((site / 'maps/manifest.json').read_text())
assert manifest['coordinateSystem'] == 'GCJ-02'
assert manifest['tileSize'] == 1024 and manifest['scale'] == 2
assert manifest['tileCount'] == sum(level['tileCount'] for level in manifest['levels'].values())
assert list(map(int, manifest['levels'])) == list(range(manifest['minZoom'], manifest['maxNativeZoom']+1))
for zoom, level in manifest['levels'].items():
    x0, y0, x1, y1 = level['tileRange']
    assert level['tileCount'] == (x1-x0+1)*(y1-y0+1)
    for x in range(x0, x1+1):
        for y in range(y0, y1+1):
            tile = site / f'maps/{zoom}/{x}/{y}.png'
            with tile.open('rb') as stream:
                header = stream.read(24)
            assert header.startswith(b'\x89PNG\r\n\x1a\n'), f'Invalid basemap {tile}'
            assert struct.unpack('>II', header[16:24]) == (2048, 2048), f'Basemap dimensions {tile}'
(south, west), (north, east) = manifest['coverageBounds']
for p in data['points'] + [data['destination'], data['transit_exit']]:
    lon, lat = map(float, p['location'].split(','))
    assert west <= lon <= east and south <= lat <= north, f'POI outside cached basemap: {p["name"]}'
    for zoom, level in manifest['levels'].items():
        size = 256 * 2**int(zoom)
        sine = math.sin(math.radians(lat))
        tx = math.floor((lon+180)/360*size/1024)
        ty = math.floor((.5-math.log((1+sine)/(1-sine))/(4*math.pi))*size/1024)
        x0, y0, x1, y1 = level['tileRange']
        assert x0 <= tx <= x1 and y0 <= ty <= y1, f'POI outside zoom {zoom}: {p["name"]}'
print(f'Local basemap validated: {manifest["tileCount"]} tiles across {len(manifest["levels"])} levels, all POIs covered')
