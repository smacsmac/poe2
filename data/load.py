"""Read Path of Building's PoE2 Lua data files into data/raw.json.

Usage:  python3 data/load.py [path/to/PathOfBuilding-PoE2/src/Data]
Needs:  pip install lupa
The default path is vendor/pob/src/Data (see scripts/fetch-pob.sh).
"""
import collections
import glob
import json
import os
import sys

import lupa

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'vendor', 'pob', 'src', 'Data')
lua = lupa.LuaRuntime(unpack_returned_tuples=True)


def conv(o):
    """Lua table -> list (array tables) or dict (keyed tables; numeric keys go to '_lines')."""
    if lupa.lua_type(o) != 'table':
        return o
    keys = list(o.keys())
    if keys and all(isinstance(k, int) for k in keys) and sorted(keys) == list(range(1, len(keys) + 1)):
        return [conv(o[k]) for k in sorted(keys)]
    d, arr = {}, []
    for k in keys:
        v = conv(o[k])
        if isinstance(k, int):
            arr.append((k, v))
        else:
            d[str(k)] = v
    if arr:
        d['_lines'] = [v for _, v in sorted(arr)]
    return d


def load_return(path):
    """Files like ModItem.lua are `return { ... }`."""
    with open(path, encoding='utf-8') as f:
        return conv(lua.execute(f.read()))


def load_bases():
    """Bases/*.lua are `return function(itemBases) ... end`: call each with one shared table."""
    tbl = lua.table()
    for p in sorted(glob.glob(os.path.join(D, 'Bases', '*.lua'))):
        with open(p, encoding='utf-8') as f:
            lua.execute(f.read())(tbl)
    return conv(tbl)


if __name__ == '__main__':
    if not os.path.isdir(D):
        sys.exit('PoB data folder not found: %s\nRun scripts/fetch-pob.sh first, or pass the path.' % D)
    mods = load_return(os.path.join(D, 'ModItem.lua'))
    veiled = load_return(os.path.join(D, 'ModVeiled.lua'))
    ess = load_return(os.path.join(D, 'Essence.lua'))
    bases = load_bases()
    out = os.path.join(HERE, 'raw.json')
    with open(out, 'w') as f:
        json.dump({'mods': mods, 'veiled': veiled, 'ess': ess, 'bases': bases}, f)
    print('wrote', out, '| mods', len(mods), 'veiled', len(veiled), 'essences', len(ess), 'bases', len(bases))
    c, h = collections.Counter(), collections.Counter()
    for b in bases.values():
        c[b.get('type')] += 1
        if b.get('hidden'):
            h[b.get('type')] += 1
    for t in sorted(c, key=str):
        print(f"  {str(t):20s} total {c[t]:4d} hidden {h[t]:3d}")
