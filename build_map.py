#!/usr/bin/env python3
"""Build quan5-map.json from OSM data, clipped to the real Quan 5 boundary.
Source: OpenStreetMap (ODbL). Boundary: OSM relation 3820432 via Nominatim.
Layout coordinates are real (lon/lat -> game units); road widths, building
heights and character sizes are exaggerated for playability, as noted in README.
"""
import json, math, pathlib

BASE = pathlib.Path('/home/hatch/workspace/quan5-online/osm')
OUT = pathlib.Path('/home/hatch/workspace/quan5-online/public/quan5-map.json')

# Game scale: lon range of Q5 ~4018 m -> 280 game units
LON0, LAT0 = 106.6689, 10.75575
SCALE = 280.0 / 4018.0

def to_game(lon, lat):
    x = (lon - LON0) * 109300.0 * SCALE
    z = -(lat - LAT0) * 110500.0 * SCALE
    return [round(x, 2), round(z, 2)]

def to_meters(lon, lat):
    return ((lon - LON0) * 109300.0, -(lat - LAT0) * 110500.0)

def point_in_poly(lon, lat, poly):
    # poly: list of [lon, lat]; ray casting
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside

boundary = json.load(open(BASE / 'quan5-boundary.json'))[0]['geojson']['coordinates'][0]
poly_lonlat = [[p[0], p[1]] for p in boundary]
poly_game = [to_game(lon, lat) for lon, lat in poly_lonlat]
print('boundary points:', len(poly_lonlat),
      'lon', min(p[0] for p in poly_lonlat), max(p[0] for p in poly_lonlat),
      'lat', min(p[1] for p in poly_lonlat), max(p[1] for p in poly_lonlat))

# ---------- Roads ----------
# Real width in metres, for proportional game widths (see client roadWidth):
# explicit OSM width tag first, else lanes * 3.5 m, else a default by highway type.
TYPE_WIDTH_M = {
    'motorway': 22, 'motorway_link': 12, 'trunk': 20, 'trunk_link': 12,
    'primary': 16, 'primary_link': 10, 'secondary': 14, 'secondary_link': 10,
    'tertiary': 12, 'tertiary_link': 8, 'unclassified': 8, 'residential': 8,
    'living_street': 6, 'service': 5, 'pedestrian': 6, 'footway': 3,
    'path': 3, 'cycleway': 3, 'steps': 2,
}

def real_width_m(tags):
    w = tags.get('width')
    if w:
        try:
            v = float(str(w).split()[0])
            if 1 <= v <= 40:
                return round(v, 1)
        except ValueError:
            pass
    lanes = tags.get('lanes')
    if lanes:
        try:
            n = int(str(lanes).split('|')[0].split(';')[0])
            if 1 <= n <= 8:
                return round(n * 3.5, 1)
        except ValueError:
            pass
    return TYPE_WIDTH_M.get(tags.get('highway'), 6)

highways = json.load(open(BASE / 'highways.json'))['elements']
roads = []
major_names = {'Trần Hưng Đạo','Nguyễn Trãi','An Dương Vương','Hải Thượng Lãn Ông',
               'Hùng Vương','Nguyễn Chí Thanh','Nguyễn Văn Cừ','Nguyễn Tri Phương',
               'Châu Văn Liêm','Ngô Quyền','Hồng Bàng','Tháp Mười','Lương Nhữ Học',
               'Phùng Hưng','Nguyễn Thị Nhỏ','Trần Phú','Ngô Gia Tự','Võ Văn Kiệt'}
for e in highways:
    tags = e.get('tags', {})
    geom = e.get('geometry', [])
    if len(geom) < 2:
        continue
    # split into sub-polylines of consecutive inside points
    wm = real_width_m(tags)
    cur = []
    for pt in geom:
        if point_in_poly(pt['lon'], pt['lat'], poly_lonlat):
            cur.append(to_game(pt['lon'], pt['lat']))
        else:
            if len(cur) >= 2:
                roads.append({'name': tags.get('name'), 'type': tags.get('highway'),
                              'major': tags.get('name') in major_names, 'width_m': wm, 'pts': cur})
            cur = []
    if len(cur) >= 2:
        roads.append({'name': tags.get('name'), 'type': tags.get('highway'),
                      'major': tags.get('name') in major_names, 'width_m': wm, 'pts': cur})
print('road polylines inside Q5:', len(roads),
      'points:', sum(len(r['pts']) for r in roads))
names = {}
for r in roads:
    if r['name']:
        names[r['name']] = names.get(r['name'], 0) + 1
for n, c in sorted(names.items(), key=lambda kv: -kv[1])[:60]:
    print(' road', c, n)

# street midpoints for lantern / dong-y landmarks
def street_midpoint(name):
    pts = []
    for r in roads:
        if r['name'] == name:
            pts.extend(r['pts'])
    if not pts:
        return None
    return [round(sum(p[0] for p in pts) / len(pts), 2),
            round(sum(p[1] for p in pts) / len(pts), 2)]

# ---------- Buildings ----------
# Cartographic displacement: game road widths are exaggerated (width_m * 0.3,
# vs true scale 0.0697 units/m), while building positions are at true scale.
# Without displacement, a shophouse facade 4 m from a road centreline sits only
# 0.28 game units away, so any playable character radius blocks the road.
# So each building is pushed away from its nearest road segment until its
# footprint clears the exaggerated road corridor plus a 0.5-unit margin
# (capped at 3 units, so buildings stay inside their block). This moves
# buildings slightly off their exact OSM position on narrow streets, but it
# is what makes alleys walkable at all.
road_segs = []
for r in roads:
    w_game = r['width_m'] * 0.3
    for i in range(len(r['pts']) - 1):
        road_segs.append((r['pts'][i][0], r['pts'][i][1],
                          r['pts'][i + 1][0], r['pts'][i + 1][1], w_game / 2.0))
# Spatial grid over road segments (cell 10 units) for fast nearest search.
from collections import defaultdict
seg_grid = defaultdict(list)
for si, (x1, z1, x2, z2, hw_) in enumerate(road_segs):
    for cx in range(int(min(x1, x2) // 10), int(max(x1, x2) // 10) + 1):
        for cz in range(int(min(z1, z2) // 10), int(max(z1, z2) // 10) + 1):
            seg_grid[(cx, cz)].append(si)

def displace_building(cx, cz, hw_t_, hd_t_, rot_):
    # local axes in (x, z): local x = (cos rot, -sin rot), local z = (sin rot, cos rot)
    lx_axis = (math.cos(rot_), -math.sin(rot_))
    lz_axis = (math.sin(rot_), math.cos(rot_))
    best = None  # (dist2, closest_x, closest_z, seg_half_width)
    cell = (int(cx // 10), int(cz // 10))
    cand = set()
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            cand.update(seg_grid.get((cell[0] + dx, cell[1] + dz), []))
    for si in cand:
        x1, z1, x2, z2, hw_ = road_segs[si]
        vx, vz = x2 - x1, z2 - z1
        len2 = vx * vx + vz * vz
        t = 0.0 if len2 == 0 else max(0.0, min(1.0, ((cx - x1) * vx + (cz - z1) * vz) / len2))
        px, pz = x1 + vx * t, z1 + vz * t
        d2 = (cx - px) ** 2 + (cz - pz) ** 2
        if best is None or d2 < best[0]:
            best = (d2, px, pz, hw_, vx, vz)
    if best is None:
        return cx, cz
    d2, px, pz, hw_, vx, vz = best
    d = math.sqrt(d2)
    if d < 0.001:
        # centroid on the road: push along the segment normal
        vl = math.hypot(vx, vz) or 1.0
        nx, nz = -vz / vl, vx / vl
    else:
        nx, nz = (cx - px) / d, (cz - pz) / d
    # building extent along the normal direction
    cos_phi = nx * lx_axis[0] + nz * lx_axis[1]
    sin_phi = nx * lz_axis[0] + nz * lz_axis[1]
    extent = abs(hw_t_ * cos_phi) + abs(hd_t_ * sin_phi)
    required = hw_ + extent + 0.5
    if d >= required:
        return cx, cz
    shift = min(required - d, 3.0)
    return cx + nx * shift, cz + nz * shift

blds = json.load(open(BASE / 'buildings.json'))['elements']
buildings = []
for e in blds:
    tags = e.get('tags', {})
    geom = e.get('geometry', [])
    if len(geom) < 4:
        continue
    # centroid in meters
    pts_m = [to_meters(p['lon'], p['lat']) for p in geom]
    cx_m = sum(p[0] for p in pts_m) / len(pts_m)
    cy_m = sum(p[1] for p in pts_m) / len(pts_m)
    # centroid lon/lat approx back
    clon = LON0 + cx_m / 109300.0
    clat = LAT0 - cy_m / 110500.0
    if not point_in_poly(clon, clat, poly_lonlat):
        continue
    # area in m2 (shoelace, in meters)
    area = 0.0
    for i in range(len(pts_m)):
        x1, y1 = pts_m[i]
        x2, y2 = pts_m[(i + 1) % len(pts_m)]
        area += x1 * y2 - x2 * y1
    area = abs(area) / 2.0
    name = tags.get('name')
    btype = tags.get('building')
    if area < 80 and not name and btype not in ('hospital', 'school', 'university', 'commercial', 'retail', 'civic', 'temple', 'church'):
        continue
    # oriented bbox: try angles from polygon edges, pick smallest area bbox
    best = None
    for i in range(len(pts_m)):
        x1, y1 = pts_m[i]
        x2, y2 = pts_m[(i + 1) % len(pts_m)]
        ang = math.atan2(y2 - y1, x2 - x1)
        ca, sa = math.cos(-ang), math.sin(-ang)
        xs, ys = [], []
        for (x, y) in pts_m:
            rx = (x - cx_m) * ca - (y - cy_m) * sa
            ry = (x - cx_m) * sa + (y - cy_m) * ca
            xs.append(rx); ys.append(ry)
        w, d = max(xs) - min(xs), max(ys) - min(ys)
        if best is None or w * d < best[0]:
            best = (w * d, ang, w, d)
    _, ang, w_m, d_m = best
    # hw/hd: kích thước VẼ (phóng đại, tối thiểu 2x2 để nhìn thấy trên điện thoại).
    # hw_t/hd_t: kích thước VA CHẠM thật (footprint OSM, không phóng đại, không sàn 1.0),
    # để nhân vật đi được trên đường nhỏ/hẻm mà nhà hai bên không chặn tim đường.
    hw = max(1.0, (w_m * SCALE) / 2.0)
    hd = max(1.0, (d_m * SCALE) / 2.0)
    hw_t = max(0.2, (w_m * SCALE) / 2.0)
    hd_t = max(0.2, (d_m * SCALE) / 2.0)
    # game coords: note game z = -meters_y, so rotation sign flips
    cx, cz = to_game(clon, clat)
    levels = tags.get('building:levels')
    try:
        h_m = float(levels) * 3.0 if levels else None
    except ValueError:
        h_m = None
    if h_m is None:
        h_m = 18.0 if area > 2000 else (12.0 if area > 800 else 8.0)
    height = round(max(2.5, min(9.0, h_m * 0.35)), 2)
    cx, cz = displace_building(cx, cz, hw_t, hd_t, -ang)
    buildings.append({'x': round(cx, 2), 'z': round(cz, 2), 'hw': round(hw, 2), 'hd': round(hd, 2),
                      'hw_t': round(hw_t, 2), 'hd_t': round(hd_t, 2),
                      'rot': round(-ang, 3), 'h': height,
                      'type': btype, 'name': name})
print('buildings inside Q5 (area>=80 or named/special):', len(buildings))
for b in buildings:
    if b['name'] in ('Chợ An Đông', 'Chợ Kim Biên', 'Bệnh Viện Nguyễn Tri Phương'):
        print(' named building:', b)

# ---------- Water & parks ----------
wp = json.load(open(BASE / 'water_parks.json'))['elements']
waters, parks = [], []
for e in wp:
    tags = e.get('tags', {})
    geom = e.get('geometry', [])
    if len(geom) < 2:
        continue
    pts = [to_game(p['lon'], p['lat']) for p in geom
           if point_in_poly(p['lon'], p['lat'], poly_lonlat)]
    if len(pts) < 2:
        continue
    if tags.get('waterway') or tags.get('natural') == 'water':
        waters.append({'name': tags.get('name'), 'pts': pts})
    elif tags.get('leisure') == 'park':
        parks.append({'name': tags.get('name'), 'pts': pts})
print('water polylines:', len(waters), 'park polygons:', len(parks))

# ---------- Landmarks (verified Nominatim coordinates) ----------
LM = [
    ('Chợ Bình Tây', 10.7492965, 106.6507280, '57A Tháp Mười — chợ Chợ Lớn mới từ 1928, ngay rìa tây Quận 5.'),
    ('Chợ An Đông', 10.7581080, 106.6721816, 'Công trường An Đông — chợ sỉ lẻ nổi tiếng.'),
    ('Chợ Kim Biên', 10.7500448, 106.6559414, 'Chợ phụ liệu, nguyên liệu nổi tiếng.'),
    ('Chùa Bà Thiên Hậu', 10.7535637, 106.6611920, 'Hội quán Tuệ Thành, 710 Nguyễn Trãi.'),
    ('Hội quán Nghĩa An', 10.7536537, 106.6621288, '678 Nguyễn Trãi — hội quán Quan Thánh Đế Quân.'),
    ('Công viên Văn Lang', 10.7566528, 106.6685155, 'An Dương Vương — công viên xanh giữa lòng Quận 5.'),
    ('Bến xe Chợ Lớn', 10.7512111, 106.6518705, 'Bến xe ở rìa tây, cửa ngõ đi các tỉnh miền Tây.'),
    ('Chợ Hòa Bình', 10.7510343, 106.6756373, 'Chợ trên đường Bùi Hữu Nghĩa, phía đông Quận 5.'),
    ('Bệnh viện Chợ Rẫy', 10.7566964, 106.6597263, '201B Nguyễn Chí Thanh — bệnh viện lớn của Quận 5.'),
]
landmarks = []
for name, lat, lon, desc in LM:
    x, z = to_game(lon, lat)
    landmarks.append({'name': name, 'x': x, 'z': z, 'desc': desc})
for name, desc in [('Phố lồng đèn Lương Nhữ Học', 'Phố lồng đèn rực rỡ nhất Chợ Lớn.'),
                   ('Phố Đông y Hải Thượng Lãn Ông', 'Phố thuốc bắc, thảo dược lâu đời của Chợ Lớn.')]:
    street = 'Lương Nhữ Học' if 'lồng đèn' in name else 'Hải Thượng Lãn Ông'
    mid = street_midpoint(street)
    if mid:
        landmarks.append({'name': name, 'x': mid[0], 'z': mid[1], 'desc': desc})
        print(' street landmark', name, mid)
    else:
        print(' WARNING street not found:', street)

out = {
    'source': 'OpenStreetMap (ODbL), boundary OSM relation 3820432 (Quan 5), fetched 2026-11-02',
    'origin': {'lon': LON0, 'lat': LAT0, 'scale_units_per_meter': SCALE},
    'bounds': {'x': [-140, 140], 'z': [-75, 75]},
    'boundary': poly_game,
    'roads': roads,
    'buildings': buildings,
    'waters': waters,
    'parks': parks,
    'landmarks': landmarks,
}
OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print('wrote', OUT, OUT.stat().st_size, 'bytes')
