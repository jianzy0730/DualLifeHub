from __future__ import annotations
import json, shutil, subprocess, zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
VERSION='0.2.0'
OUT=ROOT/'release'/f'DualPigCompanion_v{VERSION}.toolpkg'

def run(*args:str)->None:
    subprocess.run(list(args),check=True,cwd=ROOT)

def main()->None:
    manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('toolpkg_id')!='com.community.dual_pig_pet': raise SystemExit('unexpected toolpkg_id')
    if manifest.get('version')!=VERSION: raise SystemExit('version mismatch')
    (ROOT/'ui').mkdir(exist_ok=True)
    (ROOT/'packages').mkdir(exist_ok=True)
    shutil.copyfile(ROOT/'src/main.js',ROOT/'main.js')
    shutil.copyfile(ROOT/'src/ui/pig_pet.ui.js',ROOT/'ui/pig_pet.ui.js')
    shutil.copyfile(ROOT/'src/packages/dual_pig_pet_core.js',ROOT/'packages/dual_pig_pet_core.js')
    for file in ['main.js','ui/pig_pet.ui.js','packages/dual_pig_pet_core.js']:
        run('node','--check',file)
    run('node','tests/validate.js')
    run('node','tests/mock_runtime_test.js')
    OUT.parent.mkdir(exist_ok=True)
    members=['manifest.json','main.js','README.md','ui/pig_pet.ui.js','packages/dual_pig_pet_core.js','resources/webapp/index.html']
    with zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED) as z:
        for rel in members:z.write(ROOT/rel,rel)
    with zipfile.ZipFile(OUT) as z:
        bad=z.testzip()
        if bad:raise SystemExit(f'corrupted member: {bad}')
    print(f'Built {OUT}')

if __name__=='__main__':main()
