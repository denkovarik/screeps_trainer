import type { TerrainCell } from "../shared.js";

const W = 50;
const H = 50;

export function idx(x: number, y: number) {
  return y * W + x;
}

export function inBounds(x: number, y: number) {
  return x >= 0 && x < W && y >= 0 && y < H;
}

// Returns Int32Array distances (length 2500), -1 = unreachable
export function bfsDistanceField(terrain: Uint8Array, tx: number, ty: number): Int32Array {
  const dist = new Int32Array(W * H);
  dist.fill(-1);

  if (!inBounds(tx, ty)) return dist;
  if (terrain[idx(tx, ty)] === 1) return dist; // target in wall

  const qx = new Int16Array(W * H);
  const qy = new Int16Array(W * H);
  let qh = 0, qt = 0;

  dist[idx(tx, ty)] = 0;
  qx[qt] = tx; qy[qt] = ty; qt++;

  const dirs = [
    [ 0, -1],
    [ 1,  0],
    [ 0,  1],
    [-1,  0],
    // If you want diagonals later, add them, but Screeps movement is 8-dir.
  ] as const;

  while (qh < qt) {
    const x = qx[qh];
    const y = qy[qh];
    const d = dist[idx(x, y)];
    qh++;

    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (dist[ni] !== -1) continue;

      const cell = terrain[ni] as TerrainCell;
      if (cell === 1) continue; // wall blocks

      dist[ni] = d + 1;
      qx[qt] = nx; qy[qt] = ny; qt++;
    }
  }

  return dist;
}

// Move one step "downhill" on the distance field
export function stepToward(terrain: Uint8Array, dist: Int32Array, x: number, y: number): { x: number; y: number } {
  const here = dist[idx(x, y)];
  if (here <= 0) return { x, y }; // at target or unreachable

  let bestX = x;
  let bestY = y;
  let bestD = here;

  const dirs = [
    [ 0, -1],
    [ 1,  0],
    [ 0,  1],
    [-1,  0],
  ] as const;

  for (const [dx, dy] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (!inBounds(nx, ny)) continue;
    const ni = idx(nx, ny);
    if (terrain[ni] === 1) continue;

    const nd = dist[ni];
    if (nd !== -1 && nd < bestD) {
      bestD = nd;
      bestX = nx;
      bestY = ny;
    }
  }

  return { x: bestX, y: bestY };
}

