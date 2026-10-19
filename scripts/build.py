"""Build a portable static directory without exposing server-side source/config."""
import pathlib
import hashlib
import re
import shutil

root = pathlib.Path(__file__).resolve().parents[1]
source = root / 'site'
target = root / '_site'
if target.exists():
    shutil.rmtree(target)
shutil.copytree(source, target)
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
    page.write_text(re.sub(r'(src|href)="([^"?#]+)"', version_asset, page.read_text()))
(target / '.nojekyll').touch()
print(f'Static site built at {target.name}/')
