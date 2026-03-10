#!/usr/bin/env python3
"""
Extract EVE Frontier stellar cartography from local game client files.

Usage:
  python scripts/extract_starmap.py --resfiles "D:/Games/EVE Frontier/ResFiles" \
                                     --stillness "D:/Games/EVE Frontier/stillness" \
                                     --output frontend/public/galaxy.json

The script reads from the game's ResFiles directory (hashed file storage) and
outputs a compact JSON file suitable for runtime fetching by the frontend.

Output schema (per system):
  { "id": 30004759, "name": "UK4-GH8", "x": -5.33e18, "y": -4.62e17, "z": 2.15e18,
    "regionId": 10000040, "region": "N.6K1.K5D" }

Coordinates are raw EVE meter values. The frontend normalizes them to scene space.
"""

import argparse
import json
import mmap
import pickle
import struct
import sys
from pathlib import Path


# File paths within ResFiles — keyed by virtual path from index files
STARMAP_HASH    = '2e/2edadfca55978bdf_e376d0d13d65b82314e2a77cc8a9f262'
SYSCONTENT_HASH = '33/33c83a8c56c485e6_6192550ccd1762a95c8b8b8fe1050e85'
REGIONS_HASH    = 'a7/a74cde5df2632168_13eb5da4601e760dd429a1a9ed2b799e'
LOC_EN_HASH     = '2c/2c3038b3c38e91a1_b9f34d3b8fa737e8a5ce6430d4cf8a60'


def resolve(resfiles: Path, hash_path: str) -> Path:
    """Resolve a hash path to an absolute file path within ResFiles."""
    p = resfiles / hash_path
    if not p.exists():
        raise FileNotFoundError(f'Game file not found: {p}\n'
                                 f'Ensure EVE Frontier is installed and ResFiles path is correct.')
    return p


def load_localization(resfiles: Path) -> dict:
    """Load English localization dict: nameID (int) -> name string."""
    path = resolve(resfiles, LOC_EN_HASH)
    print(f'Loading localization ({path.stat().st_size // 1_000_000}MB)...')
    with open(path, 'rb') as f:
        lang, loc = pickle.load(f, encoding='latin1')
    assert lang == 'en-us', f'Unexpected language: {lang}'
    # Values are (name, ...) tuples or plain strings
    names = {}
    for k, v in loc.items():
        if isinstance(v, (tuple, list)):
            names[k] = v[0]
        else:
            names[k] = v
    print(f'  {len(names):,} localization entries loaded')
    return names


def load_starmap(resfiles: Path) -> dict:
    """Load starmapcache.pickle: returns { regions, constellations, solarSystems, jumps }."""
    path = resolve(resfiles, STARMAP_HASH)
    print(f'Loading starmapcache ({path.stat().st_size // 1_000_000}MB)...')
    with open(path, 'rb') as f:
        data = pickle.load(f, encoding='latin1')
    print(f'  {len(data["solarSystems"]):,} systems, '
          f'{len(data["regions"])} regions, '
          f'{len(data["constellations"])} constellations')
    return data


def extract_names_from_binary(file_path: Path, known_ids: set, loc: dict) -> dict:
    """
    Scan an FSD binary file for records matching known IDs and extract their nameIDs.

    The FSD binary format stores records where:
      - bytes 0-3: the object ID (4-byte little-endian int, matches the dict key)
      - bytes 4-7: nameID (4-byte little-endian int, localization key)

    Records are NOT guaranteed to be 4-byte aligned in the file, so we use mmap.find()
    per ID (C-level SIMD search) rather than a stepped Python loop.

    Returns: dict of id -> name string
    """
    names = {}
    total = len(known_ids)

    with open(file_path, 'rb') as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        for obj_id in known_ids:
            search = struct.pack('<I', obj_id)
            pos = mm.find(search)
            if pos != -1 and pos + 8 <= len(mm):
                name_id = struct.unpack_from('<I', mm, pos + 4)[0]
                name = loc.get(name_id)
                if name:
                    names[obj_id] = name
        mm.close()

    found = len(names)
    print(f'  {found:,}/{total:,} IDs resolved ({total - found} unnamed)')
    return names


def extract_region_names(resfiles: Path, region_ids: set, loc: dict) -> dict:
    """Extract region names from regions.static."""
    path = resolve(resfiles, REGIONS_HASH)
    print(f'Extracting region names from regions.static ({path.stat().st_size // 1024}KB)...')
    return extract_names_from_binary(path, region_ids, loc)


def extract_system_names(resfiles: Path, system_ids: set, loc: dict) -> dict:
    """Extract system names from solarsystemcontent.static (84MB scan)."""
    path = resolve(resfiles, SYSCONTENT_HASH)
    print(f'Extracting system names from solarsystemcontent.static ({path.stat().st_size // 1_000_000}MB)...')
    print('  (this may take 15-30 seconds)')
    return extract_names_from_binary(path, system_ids, loc)


def build_galaxy_json(starmap: dict, system_names: dict, region_names: dict) -> list:
    """
    Join starmapcache, system names, and region names into the output schema.

    Output per system:
      { id, name, x, y, z, regionId, region }
    """
    systems_raw = starmap['solarSystems']
    output = []
    unnamed_systems = 0
    unnamed_regions = 0

    for sys_id, sys_data in systems_raw.items():
        name = system_names.get(sys_id)
        if not name:
            unnamed_systems += 1
            name = str(sys_id)  # fallback to ID string

        region_id = sys_data.get('regionID')
        region_name = region_names.get(region_id, '') if region_id else ''
        if region_id and not region_name:
            unnamed_regions += 1
            region_name = str(region_id)

        cx, cy, cz = sys_data['center']

        output.append({
            'id': sys_id,
            'name': name,
            'x': cx,
            'y': cy,
            'z': cz,
            'regionId': region_id,
            'region': region_name,
        })

    print(f'  {len(output):,} systems built '
          f'({unnamed_systems} unnamed systems, {unnamed_regions} unnamed regions)')
    return output


def main():
    parser = argparse.ArgumentParser(description='Extract EVE Frontier stellar cartography')
    parser.add_argument('--resfiles', required=True,
                        help='Path to EVE Frontier ResFiles directory')
    parser.add_argument('--output', default='frontend/public/galaxy.json',
                        help='Output JSON file path (default: frontend/public/galaxy.json)')
    parser.add_argument('--pretty', action='store_true',
                        help='Pretty-print the JSON (larger file, for inspection)')
    args = parser.parse_args()

    resfiles = Path(args.resfiles)
    if not resfiles.is_dir():
        print(f'Error: ResFiles directory not found: {resfiles}', file=sys.stderr)
        sys.exit(1)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print('=== EVE Frontier Stellar Cartography Extraction ===')
    print()

    # Step 1: Load localization
    loc = load_localization(resfiles)

    # Step 2: Load starmapcache (coordinates + hierarchy)
    starmap = load_starmap(resfiles)

    system_ids = set(starmap['solarSystems'].keys())
    region_ids = set(starmap['regions'].keys())

    # Step 3: Extract names
    print()
    region_names = extract_region_names(resfiles, region_ids, loc)
    print()
    system_names = extract_system_names(resfiles, system_ids, loc)

    # Step 4: Build output
    print()
    print('Building galaxy JSON...')
    galaxy = build_galaxy_json(starmap, system_names, region_names)

    # Step 5: Write output
    indent = 2 if args.pretty else None
    raw = json.dumps(galaxy, indent=indent, separators=(None if indent else (',', ':')))
    output_path.write_text(raw, encoding='utf-8')

    size_kb = output_path.stat().st_size // 1024
    print()
    print(f'=== Complete ===')
    print(f'Output: {output_path}')
    print(f'Systems: {len(galaxy):,}')
    print(f'File size: {size_kb:,} KB raw')
    print()
    print('Sample records:')
    for sys in galaxy[:3]:
        print(f'  {sys}')

    # Print coordinate ranges for normalization
    xs = [s['x'] for s in galaxy]
    ys = [s['y'] for s in galaxy]
    zs = [s['z'] for s in galaxy]
    print()
    print('Coordinate ranges (meters):')
    print(f'  X: [{min(xs):.3e}, {max(xs):.3e}] span={max(xs)-min(xs):.3e}')
    print(f'  Y: [{min(ys):.3e}, {max(ys):.3e}] span={max(ys)-min(ys):.3e}')
    print(f'  Z: [{min(zs):.3e}, {max(zs):.3e}] span={max(zs)-min(zs):.3e}')

    regions_found = len(set(s['region'] for s in galaxy if s['region']))
    print()
    print(f'Unique regions: {regions_found}')


if __name__ == '__main__':
    main()
