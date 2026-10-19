import concurrent.futures
import hashlib
import json
import math
import pathlib
import re
import threading
import time
import os
import datetime
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache' / 'amap'
CACHE.mkdir(parents=True, exist_ok=True)
DEST = os.getenv('AMAP_DESTINATION', '116.366962,40.002384')
EXIT = '116.367223,40.001733'
KEY = os.getenv('AMAP_API_KEY', '')
TRANSIT_DATE = os.getenv('AMAP_TRANSIT_DATE', (datetime.date.today() + datetime.timedelta(days=1)).isoformat())
TRANSIT_TIME = os.getenv('AMAP_TRANSIT_TIME', '08:30').replace(':', '-')
lock = threading.Lock()
next_request = 0.0


def api(endpoint, **params):
    global next_request
    if not KEY:
        raise RuntimeError('AMAP_API_KEY is required for API requests')
    identity = json.dumps([endpoint, params], ensure_ascii=False, sort_keys=True)
    cache = CACHE / (hashlib.sha256(identity.encode()).hexdigest() + '.json')
    if cache.exists() and time.time() - cache.stat().st_mtime < 86400:
        return json.loads(cache.read_text())
    for attempt in range(3):
        with lock:
            delay = max(0, next_request - time.monotonic())
            if delay:
                time.sleep(delay)
            next_request = time.monotonic() + 0.5
        url = 'https://restapi.amap.com' + endpoint + '?' + urllib.parse.urlencode({**params, 'key': KEY})
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                data = json.load(response)
            if data.get('status') != '1':
                if data.get('infocode') in ['10004', '10020', '10021']:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise RuntimeError(str(data.get('infocode')) + ': ' + str(data.get('info')))
            cache.write_text(json.dumps(data, ensure_ascii=False))
            return data
        except Exception as error:
            if attempt == 2:
                raise RuntimeError(type(error).__name__ + ': ' + str(error).replace(KEY, '[REDACTED]')) from None
            time.sleep(1)
    raise RuntimeError('Rate limit retries exhausted')


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def seconds(path):
    return number(path.get('cost', {}).get('duration', path.get('duration')))


def haversine(location):
    lon, lat = map(float, location.split(','))
    x, y = map(float, DEST.split(','))
    a = math.sin(math.radians(lat-y)/2)**2 + math.cos(math.radians(lat))*math.cos(math.radians(y))*math.sin(math.radians(lon-x)/2)**2
    return 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def path_route(mode, origin, destination=DEST):
    data = api('/v5/direction/'+mode, origin=origin, destination=destination, show_fields='cost,polyline')
    paths = data.get('route',{}).get('paths',[])
    paths = [p for p in paths if seconds(p) is not None]
    if not paths:
        return None
    p=min(paths,key=seconds)
    line=[]
    for s in p.get('steps',[]):
        poly=s.get('polyline','')
        if isinstance(poly,dict): poly=poly.get('polyline','')
        if poly:
            line.extend([list(map(float,x.split(','))) for x in poly.split(';') if ',' in x])
    return {'seconds':seconds(p),'distance_m':number(p.get('distance')),'polyline':line}


def metro_routes(origin, destination=DEST):
    data=api('/v5/direction/transit/integrated',origin=origin,destination=destination,city1='010',city2='010',strategy=7,AlternativeRoute=5,show_fields='cost,polyline',date=TRANSIT_DATE,time=TRANSIT_TIME)
    plans=[]
    for t in data.get('route',{}).get('transits',[]):
        lines=[]; walks=[]; valid=True
        for segment in t.get('segments',[]):
            w=segment.get('walking')
            if isinstance(w,dict) and seconds(w) is not None:
                walks.append({'seconds':seconds(w),'distance_m':number(w.get('distance'))})
            bus=segment.get('bus',{})
            if not isinstance(bus,dict): bus={}
            choices=bus.get('buslines',[])
            if choices:
                choices=[line for line in choices if '地铁' in line.get('type','')]
                if not choices:
                    valid=False;break
                line=choices[0]
                if seconds(line) is None:
                    valid=False;break
                poly=line.get('polyline',{})
                if isinstance(poly,dict):poly=poly.get('polyline','')
                lines.append({'name':line.get('name'),'seconds':seconds(line),'departure':line.get('departure_stop',{}),'arrival':line.get('arrival_stop',{}),'polyline':poly})
            if segment.get('railway') or segment.get('taxi'):
                valid=False
        if valid and lines and seconds(t) is not None:
            plans.append({'seconds':seconds(t),'ride_seconds':sum(x['seconds'] for x in lines),'walk_seconds':sum(x['seconds'] for x in walks),'lines':lines,'transfer_count':len(lines)-1})
    return sorted(plans,key=lambda p:p['seconds'])


def measure(home):
    if 'error' in home:return home
    try:
        home['walk']=path_route('walking',home['location'])
        home['bike']=path_route('bicycling',home['location'])
        home['metro_plans']=metro_routes(home['location'])
        home['metro']=home['metro_plans'][0] if home['metro_plans'] else None
        home['walk_ok']=bool(home['walk'] and home['walk']['seconds']<=1800)
        home['bike_ok']=bool(home['bike'] and home['bike']['seconds']<=1200)
        home['metro_auto_ok']=bool(home['metro'] and home['metro']['seconds']<=1200)
        home['rail20']=any(p['ride_seconds']<=1200 for p in home['metro_plans'])
    except Exception as e:
        home['error']=str(e)
    return home


def batch(fn, items, label):
    results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures=[pool.submit(fn,x) for x in items]
        for i,f in enumerate(concurrent.futures.as_completed(futures)):
            results.append(f.result())
            if (i+1)%8==0 or i+1==len(futures):
                print(json.dumps({'phase':label,'done':i+1,'total':len(futures)},ensure_ascii=False),flush=True)
    return results


