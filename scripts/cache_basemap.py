"""Download a finite, georeferenced Amap basemap for the rental research area.

Uses the documented static map API. The public site requests only local images;
AMAP_API_KEY remains in the environment. Tile indices follow EPSG:3857 pixel
math applied to the source GCJ-02 coordinates, matching Amap's map image grid.
"""
import argparse
import json
import math
import os
import pathlib
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
TILE_SIZE = 1024
NATIVE_ZOOM = 15


def project(lon, lat, zoom):
    size = 256 * 2**zoom
    sine = math.sin(math.radians(lat))
    return size * (lon + 180) / 360, size * (.5 - math.log((1+sine)/(1-sine))/(4*math.pi))


def unproject(x, y, zoom):
    size = 256 * 2**zoom
    return x / size * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2*y/size))))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    key = os.environ.get('AMAP_API_KEY')
    if not key:
        raise SystemExit('AMAP_API_KEY is required')
    data = json.loads((ROOT / 'site/data.json').read_text())
    coords = [list(map(float, p['location'].split(','))) for p in data['points']]
    # Include a small local context margin around the sampled locations.
    corners = [(min(p[0] for p in coords)-.012, max(p[1] for p in coords)+.008),
               (max(p[0] for p in coords)+.012, min(p[1] for p in coords)-.008)]
    nw, se = [project(*c, NATIVE_ZOOM) for c in corners]
    x0, y0 = [math.floor(v / TILE_SIZE) for v in nw]
    x1, y1 = [math.floor(v / TILE_SIZE) for v in se]
    total = (x1-x0+1) * (y1-y0+1)
    for x in range(x0, x1+1):
        for y in range(y0, y1+1):
            target = ROOT / f'site/maps/{NATIVE_ZOOM}/{x}/{y}.png'
            if target.exists() and not args.force:
                continue
            lon, lat = unproject((x+.5)*TILE_SIZE, (y+.5)*TILE_SIZE, NATIVE_ZOOM)
            params = {'location': f'{lon:.6f},{lat:.6f}', 'zoom': NATIVE_ZOOM-1,
                      'size': f'{TILE_SIZE}*{TILE_SIZE}', 'scale': 2, 'key': key}
            for attempt in range(3):
                try:
                    url = 'https://restapi.amap.com/v3/staticmap?' + urllib.parse.urlencode(params)
                    with urllib.request.urlopen(url, timeout=40) as response:
                        content = response.read()
                    if not content.startswith(b'\x89PNG\r\n\x1a\n'):
                        raise RuntimeError('Static map API returned a non-PNG response')
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(content)
                    print(f'Basemap {x},{y}: {len(content)} bytes', flush=True)
                    break
                except Exception as error:
                    if attempt == 2:
                        raise RuntimeError(str(error).replace(key, '[REDACTED]')) from None
                    time.sleep(2)
            time.sleep(.55)
    west, north = unproject(x0*TILE_SIZE, y0*TILE_SIZE, NATIVE_ZOOM)
    east, south = unproject((x1+1)*TILE_SIZE, (y1+1)*TILE_SIZE, NATIVE_ZOOM)
    metadata = {'nativeZoom': NATIVE_ZOOM, 'tileSize': TILE_SIZE, 'scale': 2,
                'bounds': [[south, west], [north, east]], 'tileRange': [x0,y0,x1,y1],
                'tileCount': total, 'source': 'Amap Static Maps API', 'coordinateSystem': 'GCJ-02',
                'captured_at': data['measured_at']}
    (ROOT / 'site/maps/manifest.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n')
    print(f'Finished: {total} tiles')


if __name__ == '__main__':
    main()
