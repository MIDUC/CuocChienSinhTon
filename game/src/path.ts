/** A* trên lưới ô vuông, đi 8 hướng (không cắt góc qua ô bị chặn). */

export interface Cell {
  x: number;
  y: number;
}

/** cost(x,y): Infinity = không đi được; số = chi phí bước vào ô */
export type CostFn = (x: number, y: number) => number;

class Heap {
  a: number[] = [];
  f: Float64Array;
  constructor(size: number) {
    this.f = new Float64Array(size);
  }
  push(i: number, f: number) {
    this.f[i] = f;
    const a = this.a;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.f[a[p]] <= this.f[a[k]]) break;
      [a[p], a[k]] = [a[k], a[p]];
      k = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l;
        if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * Tìm đường từ start tới một ô bất kỳ thoả isGoal. hx,hy = điểm để ước lượng heuristic.
 * Trả về danh sách ô (không gồm ô xuất phát) hoặc null.
 */
export function astar(n: number, start: Cell, isGoal: (x: number, y: number) => boolean, hx: number, hy: number, cost: CostFn, maxIter = 6000): Cell[] | null {
  const N = n * n;
  const g = new Float64Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new Heap(N);
  const sx = Math.max(0, Math.min(n - 1, Math.floor(start.x)));
  const sy = Math.max(0, Math.min(n - 1, Math.floor(start.y)));
  const s = sy * n + sx;
  g[s] = 0;
  const h = (x: number, y: number) => Math.hypot(x - hx, y - hy) * 0.9;
  heap.push(s, h(sx, sy));
  let it = 0;
  while (heap.size && it++ < maxIter) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % n;
    const cy = (cur / n) | 0;
    if (isGoal(cx, cy) && cur !== s) {
      const out: Cell[] = [];
      let k = cur;
      while (k !== s && k >= 0) {
        out.push({ x: k % n, y: (k / n) | 0 });
        k = from[k];
      }
      return out.reverse();
    }
    if (isGoal(cx, cy) && cur === s) return [];
    for (const [dx, dy, dc] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const c = cost(nx, ny);
      if (!isFinite(c)) continue;
      if (dx && dy && (!isFinite(cost(cx + dx, cy)) || !isFinite(cost(cx, cy + dy)))) continue;
      const ni = ny * n + nx;
      const ng = g[cur] + dc * c;
      if (ng < g[ni]) {
        g[ni] = ng;
        from[ni] = cur;
        heap.push(ni, ng + h(nx, ny));
      }
    }
  }
  return null;
}
