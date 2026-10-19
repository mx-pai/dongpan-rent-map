"""Small server-side CLI for POI, weather and route queries."""
import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from src.amap_research import api, path_route, metro_routes

parser = argparse.ArgumentParser(description=__doc__)
sub = parser.add_subparsers(dest='command', required=True)
p = sub.add_parser('search'); p.add_argument('keywords'); p.add_argument('--region', default='北京市')
p = sub.add_parser('detail'); p.add_argument('poi_id')
p = sub.add_parser('weather'); p.add_argument('city_adcode'); p.add_argument('--forecast', action='store_true')
p = sub.add_parser('route'); p.add_argument('origin'); p.add_argument('destination'); p.add_argument('--mode', choices=['walking', 'bicycling', 'transit'], default='walking')
args = parser.parse_args()
if args.command == 'search':
    result = api('/v5/place/text', keywords=args.keywords, region=args.region, city_limit='true', page_size=20, show_fields='business')
elif args.command == 'detail':
    result = api('/v5/place/detail', id=args.poi_id, show_fields='business')
elif args.command == 'weather':
    result = api('/v3/weather/weatherInfo', city=args.city_adcode, extensions='all' if args.forecast else 'base')
else:
    result = metro_routes(args.origin, args.destination) if args.mode == 'transit' else path_route(args.mode, args.origin, args.destination)
print(json.dumps(result, ensure_ascii=False, indent=2))
