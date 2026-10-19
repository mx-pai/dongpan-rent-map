"""Build a portable static directory without exposing server-side source/config."""
import pathlib
import hashlib
import json
import re
import shutil

root = pathlib.Path(__file__).resolve().parents[1]
source = root / 'site'
target = root / '_site'
if target.exists():
    shutil.rmtree(target)
shutil.copytree(source, target)
# Include the data and tile manifest so an open tab can detect a new snapshot.
digest = hashlib.sha256()
for asset in sorted(target.rglob('*')):
    if asset.is_file() and asset.suffix in ['.html', '.js', '.css', '.json']:
        digest.update(asset.relative_to(target).as_posix().encode())
        digest.update(asset.read_bytes())
release = digest.hexdigest()[:16]
(target / 'version.json').write_text(json.dumps({'version': release})+'\n')
# Version asset URLs by their content so an existing browser can load a new
# HTML layout without reusing incompatible cached JavaScript or CSS.
def version_asset(match):
    attr, href = match.groups()
    asset = target / href
    if asset.suffix not in ['.js', '.css'] or not asset.is_file():
        return match.group(0)
    version = hashlib.sha256(asset.read_bytes()).hexdigest()[:12]
    return f'{attr}="{href}?v={version}"'

for page in target.glob('*.html'):
    html = page.read_text().replace('content="build-version"', f'content="{release}"')
    page.write_text(re.sub(r'(src|href)="([^"?#]+)"', version_asset, html))
(target / '.nojekyll').touch()
print(f'Static site built at {target.name}/')
