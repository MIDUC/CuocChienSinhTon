/** Lưới ô vuông xoay 45° (isometric 2:1). Toạ độ lưới (x, y) là góc ô; tâm ô = (x+0.5, y+0.5). */
export const TW = 64;
export const TH = 32;

export function iso(x: number, y: number) {
  return { x: ((x - y) * TW) / 2, y: ((x + y) * TH) / 2 };
}

/** Màn hình (toạ độ thế giới) -> lưới (số thực) */
export function grid(sx: number, sy: number) {
  const a = sx / (TW / 2);
  const b = sy / (TH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Thứ tự vẽ: vật ở dưới màn hình (x+y lớn) vẽ sau */
export function depthOf(x: number, y: number) {
  return (x + y) * 10;
}

export function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}
