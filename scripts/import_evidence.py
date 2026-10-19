"""Merge reviewed rental evidence keyed by POI ID or display number."""
import argparse
import json
import pathlib

root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('input', type=pathlib.Path)
args = parser.parse_args()
incoming = json.loads(args.input.read_text())
path = root / 'site/data.json'
data = json.loads(path.read_text())
known = {p['id'] for p in data['points']} | {p['map_id'] for p in data['points']}
unknown = set(incoming) - known
if unknown:
    parser.error('Unknown POIs: ' + ', '.join(sorted(unknown)))
for point in data['points']:
    evidence = incoming.get(point['id'], incoming.get(point['map_id']))
    if evidence:
        if not evidence.get('checked_at') or not isinstance(evidence.get('listings'), list):
            parser.error('Each record needs checked_at and listings')
        point['research'] = evidence
        point['info_status'] = evidence.get('status', point.get('info_status', ''))
        records = evidence['listings']
        quoted = [r for r in records if r.get('price_month') and r.get('mode') != '方式待核']
        prices = []
        for mode in dict.fromkeys(r['mode'] for r in quoted):
            group = [r for r in quoted if r['mode'] == mode]
            values = [r['price_month'] for r in group]
            amount = str(min(values)) if min(values) == max(values) else f'{min(values)}–{max(values)}'
            historical = '历史' if all(r.get('historical') for r in group) else ''
            prices.append(f'{historical}{mode}样本 {amount}元/月')
        if prices:
            point['price_text'] = '；'.join(prices)
        point['private_bath_confirmed'] = any(r.get('private_bath') for r in records)
        point['monthly_confirmed'] = bool(quoted)
        for record in records:
            source = {'title': record['source_title'], 'url': record['source_url']}
            if not any(s['url'] == source['url'] for s in point.get('sources', [])):
                point.setdefault('sources', []).append(source)
temporary = path.with_suffix('.tmp')
temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
temporary.replace(path)
print(f'Merged {len(incoming)} reviewed POIs')
