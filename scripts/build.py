"""Build a portable static directory without exposing server-side source/config."""
import pathlib
import shutil

root = pathlib.Path(__file__).resolve().parents[1]
source = root / 'site'
target = root / '_site'
if target.exists():
    shutil.rmtree(target)
shutil.copytree(source, target)
(target / '.nojekyll').touch()
print(f'Static site built at {target.name}/')
