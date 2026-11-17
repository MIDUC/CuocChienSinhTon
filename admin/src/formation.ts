/**
 * Tính vị trí đứng chờ của lính quanh nhà lính (đơn vị: ô, gốc toạ độ = góc trên-trái của nhà).
 * Game client nên dùng đúng thuật toán này để hiển thị giống trang admin.
 *
 *  - ring: lính đứng vây quanh nhà, lấp từng vòng ô bao quanh (vòng trong trước), rải đều trên mỗi vòng.
 *  - grid: lính xếp thành khối vuông trước cửa nhà (phía dưới-trái trên màn hình), lấp từng hàng.
 */
export interface Spot {
  x: number;
  y: number;
}

export function formationSpots(count: number, size: number, formation: string, spacing = 1): Spot[] {
  const n = Math.max(0, Math.floor(count));
  if (!n) return [];
  const sp = spacing > 0 ? spacing : 1;
  if (formation === 'grid') {
    const cols = Math.ceil(Math.sqrt(n));
    const out: Spot[] = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const rowCount = Math.min(cols, n - r * cols);
      // căn giữa hàng theo bề ngang nhà, đứng phía trước (y lớn hơn đáy nhà)
      const x0 = size / 2 - ((rowCount - 1) * sp) / 2 - 0.5;
      out.push({ x: x0 + c * sp + 0.5, y: size + 0.5 + r * sp + 0.5 * (sp - 1) });
    }
    return out;
  }
  // ring
  const out: Spot[] = [];
  let ring = 1;
  while (out.length < n) {
    const d = ring * sp; // khoảng cách vòng tính từ mép nhà
    const lo = -d;
    const hi = size - 1 + d;
    // các ô trên chu vi vòng, đi theo chiều kim đồng hồ bắt đầu từ cạnh trước
    const cells: Spot[] = [];
    const step = sp;
    for (let x = lo; x <= hi + 1e-6; x += step) cells.push({ x, y: hi });
    for (let y = hi - step; y >= lo - 1e-6; y -= step) cells.push({ x: hi, y });
    for (let x = hi - step; x >= lo - 1e-6; x -= step) cells.push({ x, y: lo });
    for (let y = lo + step; y <= hi - step + 1e-6; y += step) cells.push({ x: lo, y });
    const take = Math.min(cells.length, n - out.length);
    for (let i = 0; i < take; i++) {
      const c = cells[Math.floor((i * cells.length) / take)];
      out.push({ x: c.x + 0.5, y: c.y + 0.5 });
    }
    ring++;
  }
  return out;
}
