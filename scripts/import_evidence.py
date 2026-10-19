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
# Shared policy keeps a direct page read distinct from confirmed vacancies.
import sys
sys.path.insert(0, str(root))
from src.rental_evidence import apply_evidence
existing = {p['id']: p.get('research', {}) for p in data['points']}
for point in data['points']:
    record = incoming.get(point['id'], incoming.get(point['map_id']))
    if record:
        if not record.get('checked_at') or not isinstance(record.get('listings'), list):
            parser.error('Each record needs checked_at and listings')
        existing[point['id']] = record
report = apply_evidence(data, existing)
(root / 'site/evidence-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
temporary = path.with_suffix('.tmp')
temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
temporary.replace(path)
print(f'Merged {len(incoming)} reviewed POIs')
