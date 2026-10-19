"""Refresh selected residence-to-office routes while preserving rental evidence."""
import argparse
import datetime
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src import amap_research as amap


def short_route(route):
    if not route:
        return None
    line = route.get('polyline', [])
    if isinstance(line, str):
        line = [list(map(float, p.split(','))) for p in line.split(';') if ',' in p]
    if len(line) > 170:
        line = line[::math.ceil(len(line) / 170)] + [line[-1]]
    return {**route, 'polyline': line}


def short_metro(plan):
    if not plan:
        return None
    return {**plan, 'lines': [{
        **line, 'polyline': short_route({'polyline': line.get('polyline', [])})['polyline'],
        'departure': line.get('departure', {}).get('name'),
        'arrival': line.get('arrival', {}).get('name'),
    } for line in plan['lines']]}


def measure_point(point, egress, egress_bike):
    measured = amap.measure(dict(point))
    if measured.get('error'):
        raise RuntimeError(measured['error'])
    plans = measured.get('metro_plans', [])
    entrances = {}
    for plan in plans:
        if plan['ride_seconds'] > 1200:
            continue
        stop = plan['lines'][0]['departure']
        entrance = stop.get('entrance')
        if isinstance(entrance, dict) and entrance.get('location'):
            entrances[entrance['location']] = {
                'station': stop['name'], 'name': entrance.get('name', '出入口'),
                'location': entrance['location'],
            }
        if len(entrances) >= 2:
            break
    candidates = []
    # Direct bike/walk routes remain useful even when no metro entrance is returned
    for entry in entrances.values():
        station_plans = amap.metro_routes(entry['location'], amap.EXIT)
        if not station_plans:
            continue
        metro = min(station_plans, key=lambda p: p['seconds'])
        for mode, label in [('walking', '步行'), ('bicycling', '骑行')]:
            access = amap.path_route(mode, point['location'], entry['location'])
            if not access:
                continue
            for exit_mode, last in [('步行', egress), ('骑行', egress_bike)]:
                if not last:
                    continue
                total = access['seconds'] + metro['seconds'] + last['seconds']
                candidates.append({
                    'mode': label, 'egress_mode': exit_mode, 'entry': entry,
                    'access': short_route(access), 'metro': short_metro(metro),
                    'egress': short_route(last), 'seconds': total,
                    'rounded_total_min': sum(math.ceil(s / 60) for s in [access['seconds'], metro['seconds'], last['seconds']]),
                    'eligible': total <= 1200,
                })
    best = min(candidates, key=lambda c: c['seconds']) if candidates else None
    point.update({k: measured[k] for k in ['walk_ok', 'bike_ok', 'metro_auto_ok', 'rail20']})
    point['walk'] = short_route(measured.get('walk'))
    point['bike'] = short_route(measured.get('bike'))
    point['metro'] = short_metro(measured.get('metro'))
    point['rail_seconds'] = min((p['ride_seconds'] for p in plans), default=None)
    point['segment_best'] = best
    point['segment_ok'] = bool(best and best['eligible'])
    point['eligible'] = any(point[k] for k in ['walk_ok', 'bike_ok', 'metro_auto_ok', 'segment_ok'])
    point['category'] = 'walk' if point['walk_ok'] else ('bike' if point['bike_ok'] else ('metro' if point['eligible'] else 'reference'))
    point['route_measured_at'] = datetime.date.today().isoformat()
    point['transit_time'] = f'{amap.TRANSIT_DATE} {amap.TRANSIT_TIME.replace("-", ":")}'
    return point


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ids', default='', help='Comma-separated POI IDs or map numbers; empty means all')
    parser.add_argument('--max-points', type=int, default=0, help='0 means no limit')
    parser.add_argument('--data', type=pathlib.Path, default=ROOT / 'site/data.json')
    args = parser.parse_args()
    if args.max_points < 0:
        parser.error('--max-points must be >= 0')
    selected_ids = set(filter(None, args.ids.split(',')))
    data = json.loads(args.data.read_text())
    if data['destination']['location'] != amap.DEST:
        parser.error('AMAP_DESTINATION must match the dataset destination')
    points = [p for p in data['points'] if not selected_ids or p['id'] in selected_ids or p['map_id'] in selected_ids]
    if args.max_points:
        points = points[:args.max_points]
    if not points:
        parser.error('No matching POIs')
    egress = amap.path_route('walking', amap.EXIT)
    egress_bike = amap.path_route('bicycling', amap.EXIT)
    failures = []
    for i, point in enumerate(points):
        try:
            measure_point(point, egress, egress_bike)
            print(f'{i+1}/{len(points)} {point["map_id"]} {point["name"]}', flush=True)
        except Exception as exc:
            failures.append({'id': point['id'], 'error': str(exc).replace(amap.KEY, '[REDACTED]') if amap.KEY else str(exc)})
    if failures:
        # Keep the published snapshot intact when a batch fails
        print(json.dumps({'failures': failures}, ensure_ascii=False), file=sys.stderr)
        return 1
    if len(points) == len(data['points']):
        data['measured_at'] = datetime.date.today().isoformat()
        data['transit_time'] = f'{amap.TRANSIT_DATE} {amap.TRANSIT_TIME.replace("-", ":")}'
    data['routes_updated_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    temporary = args.data.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    temporary.replace(args.data)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
