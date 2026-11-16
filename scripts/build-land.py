"""Clip and simplify Natural Earth 1:10m land (public domain) to the Europe-Asia-Africa window used by scene 4.

Usage: python scripts/build-land.py assets-src/geo/ne_10m_land.geojson public/data/land.json
Output: {"bbox": [lonMin, latMin, lonMax, latMax], "polys": [[ring, hole, ...], ...]}, each ring a flat
[lon, lat, lon, lat, ...] list rounded to 2 decimals.
"""
import json
import sys

BBOX = (-25.0, -42.0, 125.0, 62.0)  # lonMin, latMin, lonMax, latMax
TOL = 0.07  # degrees, Douglas-Peucker tolerance
MIN_AREA = 0.12  # square degrees: drops islets


def clip(ring, edge, inside, cross):
    out = []
    for i, p in enumerate(ring):
        q = ring[i - 1]
        if inside(p):
            if not inside(q):
                out.append(cross(q, p))
            out.append(p)
        elif inside(q):
            out.append(cross(q, p))
    return out


def clip_rect(ring):
    x0, y0, x1, y1 = BBOX
    def at_x(x):
        return lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))
    def at_y(y):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)
    for inside, cross in [
        (lambda p: p[0] >= x0, at_x(x0)),
        (lambda p: p[0] <= x1, at_x(x1)),
        (lambda p: p[1] >= y0, at_y(y0)),
        (lambda p: p[1] <= y1, at_y(y1)),
    ]:
        if len(ring) < 3:
            return []
        ring = clip(ring, None, inside, cross)
    return ring


def rdp(points, tol):
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5 or 1e-9
        far, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm
            if d > far:
                far, idx = d, i
        if far > tol:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(points, keep) if k]


def area(ring):
    return abs(sum(ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1] for i in range(len(ring)))) / 2


def main(src, dst):
    data = json.load(open(src, encoding='utf-8'))
    polys = []
    for f in data['features']:
        g = f['geometry']
        parts = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for rings in parts:
            out = []
            for k, ring in enumerate(rings):
                ring = [tuple(p[:2]) for p in ring]
                if ring[0] == ring[-1]:
                    ring = ring[:-1]
                ring = clip_rect(ring)
                if len(ring) < 3:
                    continue
                ring = rdp(ring, TOL)
                if len(ring) < 3 or area(ring) < (MIN_AREA if k == 0 else 0.05):
                    if k == 0:
                        out = []
                        break
                    continue
                out.append([round(c, 2) for p in ring for c in p])
            if out:
                polys.append(out)
    json.dump({'bbox': list(BBOX), 'polys': polys}, open(dst, 'w'), separators=(',', ':'))
    pts = sum(len(r) // 2 for p in polys for r in p)
    print(f'{len(polys)} polygons, {pts} points')


if __name__ == '__main__':
    main(*sys.argv[1:3])
