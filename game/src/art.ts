import Phaser from 'phaser';
import { Entity, lvl } from './data';
import { TW, TH } from './iso';

/**
 * Ảnh tạm vẽ bằng canvas theo góc nhìn isometric (giống phong cách SVG tạm của admin).
 * Khi một cấp đã có ảnh upload trên admin (level.image), game dùng ảnh đó thay thế.
 */

type Ctx = CanvasRenderingContext2D;
type P = [number, number];

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}
const hsl = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360} ${s}% ${Math.max(0, Math.min(100, l))}%)`;

function poly(c: Ctx, pts: P[], fill: string, stroke?: string, lw = 1) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

function ell(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1.5;
    c.stroke();
  }
}

function makeCanvas(scene: Phaser.Scene, key: string, w: number, h: number) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const t = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h))!;
  return { t, c: t.getContext() };
}

/* ---------------- Địa hình ---------------- */

export function terrainTexture(scene: Phaser.Scene, e: Entity, variant: number) {
  const key = `terrain:${e.key}:${variant}`;
  if (scene.textures.exists(key)) return key;
  const thick = 8;
  const { t, c } = makeCanvas(scene, key, TW, TH + thick);
  const base = String(e.props.color || '#6cc24a');
  const top: P[] = [[0, TH / 2], [TW / 2, 0], [TW, TH / 2], [TW / 2, TH]];
  poly(c, [[0, TH / 2], [TW / 2, TH], [TW / 2, TH + thick], [0, TH / 2 + thick]], '#7a5232');
  poly(c, [[TW / 2, TH], [TW, TH / 2], [TW, TH / 2 + thick], [TW / 2, TH + thick]], '#5e3e24');
  poly(c, top, base, 'rgba(0,0,0,0.12)');
  const rnd = mulberry(hash(key));
  c.save();
  c.beginPath();
  c.moveTo(0, TH / 2);
  c.lineTo(TW / 2, 0);
  c.lineTo(TW, TH / 2);
  c.lineTo(TW / 2, TH);
  c.closePath();
  c.clip();
  if (e.props.layer === 'water') {
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const x = 14 + rnd() * 30;
      const y = 8 + rnd() * 16;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 5, y - 3, x + 10, y);
      c.stroke();
    }
  } else {
    for (let i = 0; i < 10; i++) {
      const x = rnd() * TW;
      const y = rnd() * TH;
      c.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
      c.fillRect(x, y, 2, 2);
    }
    if (variant === 1 && e.key === 'grass') {
      for (let i = 0; i < 4; i++) ell(c, 10 + rnd() * 44, 6 + rnd() * 20, 1.5, 1.5, rnd() > 0.5 ? '#fff' : '#ffe066');
    }
  }
  c.restore();
  t.refresh();
  return key;
}

/* ---------------- Công trình ---------------- */

/** Kích thước texture công trình chiếm w×h ô; ox,oy = vị trí góc trên (ô x,y) trong texture */
export function buildingFrame(w: number, h: number) {
  const W = ((w + h) * TW) / 2;
  const extra = 40 + 26 * Math.max(w, h);
  const H = ((w + h) * TH) / 2 + extra;
  return { W, H, ox: (h * TW) / 2, oy: extra };
}

export function buildingTexture(scene: Phaser.Scene, e: Entity, level: number, w: number, h: number) {
  const key = `bld:${e.key}:${level}:${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  const f = buildingFrame(w, h);
  const { t, c } = makeCanvas(scene, key, f.W, f.H);
  // toạ độ góc lưới (gx, gy) trong texture
  const pt = (gx: number, gy: number): P => [f.ox + ((gx - gy) * TW) / 2, f.oy + ((gx + gy) * TH) / 2];
  const lvT = level; // 1 gỗ, 2 đá, 3 đá + vàng
  const hue = hash(e.key) % 360;
  const cat = e.props.category;

  const box = (x0: number, y0: number, x1: number, y1: number, hgt: number, wallCol: [number, number, number], topCol?: string) => {
    const [hh, ss, ll] = wallCol;
    const A = pt(x0, y0), B = pt(x1, y0), C = pt(x1, y1), D = pt(x0, y1);
    const up = (p: P): P => [p[0], p[1] - hgt];
    poly(c, [D, C, up(C), up(D)], hsl(hh, ss, ll - 4), 'rgba(0,0,0,.25)');
    poly(c, [C, B, up(B), up(C)], hsl(hh, ss, ll - 18), 'rgba(0,0,0,.25)');
    poly(c, [up(A), up(B), up(C), up(D)], topCol ?? hsl(hh, ss, ll + 8), 'rgba(0,0,0,.25)');
    return { A: up(A), B: up(B), C: up(C), D: up(D) };
  };
  const pyramid = (top: { A: P; B: P; C: P; D: P }, rise: number, col: number, sat = 55, lig = 45) => {
    const cx = (top.A[0] + top.C[0]) / 2;
    const cy = (top.A[1] + top.C[1]) / 2 - rise;
    const ap: P = [cx, cy];
    poly(c, [top.D, top.C, ap], hsl(col, sat, lig), 'rgba(0,0,0,.3)');
    poly(c, [top.C, top.B, ap], hsl(col, sat, lig - 14), 'rgba(0,0,0,.3)');
    return ap;
  };
  const flag = (p: P, col: string) => {
    c.fillStyle = '#4a3527';
    c.fillRect(p[0] - 1, p[1] - 22, 2, 22);
    poly(c, [[p[0] + 1, p[1] - 22], [p[0] + 14, p[1] - 18], [p[0] + 1, p[1] - 13]], col);
  };
  const ground = (col: string) => poly(c, [pt(0, 0), pt(w, 0), pt(w, h), pt(0, h)], col, 'rgba(0,0,0,.2)');
  const wood: [number, number, number] = [30, 40, 48];
  const stone: [number, number, number] = [210, 8, 62];
  const mat = lvT >= 2 ? stone : wood;
  const roofHue = lvT === 1 ? 42 : 215;
  const roofSat = lvT === 1 ? 45 : 55;
  const gold = '#ffd54a';
  const i = 0.12;

  if (cat === 'wall') {
    const top = box(i, i, w - i, h - i, 22 + lvT * 4, lvT === 1 ? [28, 45, 40] : [210, 6, 60 + lvT * 3]);
    if (lvT === 1) {
      // hàng cọc gỗ
      for (let k = 0; k < 4; k++) {
        const a = pt(0.2 + k * 0.2, h - i);
        poly(c, [[a[0] - 3, a[1] - 22], [a[0], a[1] - 30], [a[0] + 3, a[1] - 22]], '#8a5a34');
      }
    } else {
      for (let k = 0; k < 3; k++) {
        const a: P = [top.D[0] + (top.C[0] - top.D[0]) * (k / 3 + 0.08), top.D[1] + (top.C[1] - top.D[1]) * (k / 3 + 0.08)];
        c.fillStyle = hsl(210, 6, 70);
        c.fillRect(a[0], a[1] - 6, 6, 6);
      }
      if (lvT === 3) {
        c.strokeStyle = gold;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(top.D[0], top.D[1] + 4);
        c.lineTo(top.C[0], top.C[1] + 4);
        c.stroke();
      }
    }
  } else if (cat === 'gate') {
    const along = w >= h; // cổng nằm ngang theo x
    const L = along ? w : h;
    const sub = (a: number, b: number) => (along ? [a, i, b, h - i] : [i, a, w - i, b]) as [number, number, number, number];
    const hgt = 30 + lvT * 6;
    box(...sub(0.08, 0.95), hgt + 16, mat);
    box(...sub(0.95, L - 0.95), hgt, mat);
    const t2 = box(...sub(L - 0.95, L - 0.08), hgt + 16, mat);
    pyramid(t2, 16, roofHue, roofSat);
    // cửa gỗ ở mặt trước
    const mid = along ? pt(L / 2, h - i) : pt(w - i, L / 2);
    c.fillStyle = '#5b3a24';
    c.beginPath();
    c.moveTo(mid[0] - 12, mid[1]);
    c.lineTo(mid[0] - 12, mid[1] - 18);
    c.quadraticCurveTo(mid[0], mid[1] - 32, mid[0] + 12, mid[1] - 18);
    c.lineTo(mid[0] + 12, mid[1]);
    c.closePath();
    c.fill();
    c.strokeStyle = lvT >= 2 ? '#2a2a2a' : '#3e2516';
    c.lineWidth = 2;
    c.stroke();
    flag([mid[0], mid[1] - hgt - 6], lvT === 3 ? gold : '#3b82f6');
  } else if (cat === 'core') {
    ground(hsl(35, 30, 55));
    const t1 = box(0.3, 0.3, w - 0.3, h - 0.3, 34 + lvT * 6, mat);
    const t2 = box(0.8, 0.8, w - 0.8, h - 0.8, 26, mat);
    const ap = pyramid(t2, 34, lvT === 1 ? 10 : 215, 60, 45);
    flag(ap, lvT === 3 ? gold : '#e53935');
    // tháp góc
    for (const [gx, gy] of [[0.2, h - 0.2], [w - 0.2, 0.2], [w - 0.2, h - 0.2]] as P[]) {
      const p = pt(gx, gy);
      c.fillStyle = hsl(mat[0], mat[1], mat[2] - 10);
      c.fillRect(p[0] - 6, p[1] - 52 - lvT * 6, 12, 52 + lvT * 6);
      poly(c, [[p[0] - 8, p[1] - 52 - lvT * 6], [p[0], p[1] - 70 - lvT * 6], [p[0] + 8, p[1] - 52 - lvT * 6]], hsl(roofHue, roofSat, 45));
    }
    void t1;
  } else if (cat === 'defense') {
    const t1 = box(0.18, 0.18, w - 0.18, h - 0.18, 54 + lvT * 8, mat);
    const ap = pyramid(t1, 22, roofHue, roofSat);
    flag(ap, lvT === 3 ? gold : '#3b82f6');
    const fr = pt(w / 2, h - 0.18);
    c.fillStyle = '#222';
    c.fillRect(fr[0] - 2, fr[1] - 38, 4, 10);
  } else if (cat === 'economy') {
    const prod = e.props.produces;
    if (prod === 'food') {
      ground(hsl(40, 55, 40));
      c.strokeStyle = hsl(85, 60, 38);
      c.lineWidth = 3;
      for (let k = 1; k < 6; k++) {
        const a = pt(k * (w / 6), 0.1), b = pt(k * (w / 6), h - 0.1);
        c.beginPath();
        c.moveTo(a[0], a[1]);
        c.lineTo(b[0], b[1]);
        c.stroke();
      }
      const tt = box(0.15, 0.15, 0.95, 0.95, 18, wood);
      pyramid(tt, 14, 42, 50);
    } else if (prod === 'gold' || prod === 'stone') {
      ground(hsl(30, 20, 45));
      const g = pt(w / 2, h / 2);
      poly(c, [[g[0] - 40, g[1] + 6], [g[0] - 22, g[1] - 26], [g[0], g[1] - 36], [g[0] + 26, g[1] - 22], [g[0] + 40, g[1] + 6]], hsl(25, 12, 45), 'rgba(0,0,0,.3)');
      ell(c, g[0], g[1] - 4, 9, 11, '#2b2118');
      const col = prod === 'gold' ? gold : '#cfd6dc';
      for (let k = 0; k < 7; k++) ell(c, g[0] - 28 + ((k * 37) % 56), g[1] - 20 + ((k * 13) % 22), 3, 2.5, col);
      // xe goòng
      c.fillStyle = '#6b4a2e';
      c.fillRect(g[0] + 16, g[1] + 8, 18, 9);
      ell(c, g[0] + 25, g[1] + 6, 8, 3, col);
    } else {
      // xưởng gỗ
      ground(hsl(30, 25, 45));
      const tt = box(0.2, 0.2, w - 0.9, h - 0.2, 26, wood);
      pyramid(tt, 16, 30, 40);
      for (let k = 0; k < 3; k++) {
        const p = pt(w - 0.5, 0.5 + k * 0.4);
        ell(c, p[0], p[1] - 4, 10, 4, '#8a5a34', '#5e3e24');
        ell(c, p[0] + 9, p[1] - 4, 3, 4, '#d9b382');
      }
    }
    if (lvT >= 2) flag(pt(0.3, 0.3), lvT === 3 ? gold : '#3b82f6');
  } else if (cat === 'storage') {
    const tt = box(0.2, 0.2, w - 0.2, h - 0.2, 30 + lvT * 4, mat);
    pyramid(tt, 22, roofHue, roofSat);
    for (let k = 0; k < 2; k++) {
      const p = pt(w - 0.05, 0.6 + k * 0.6);
      c.fillStyle = '#9b6b3e';
      c.fillRect(p[0] - 6, p[1] - 12, 12, 12);
      c.strokeStyle = '#5e3e24';
      c.strokeRect(p[0] - 6, p[1] - 12, 12, 12);
    }
  } else {
    // quân sự: nhà + sân + cờ
    ground(hsl(35, 35, 52));
    const tt = box(0.25, 0.25, w - 0.45, h - 0.45, 30 + lvT * 6, mat);
    const ap = pyramid(tt, 24, lvT === 1 ? 42 : hue, lvT === 1 ? 45 : 55);
    flag(ap, lvT === 3 ? gold : hsl(hue, 70, 50));
    // giá vũ khí / hình nộm
    const p = pt(w - 0.25, h - 0.25);
    c.fillStyle = '#6b4a2e';
    c.fillRect(p[0] - 2, p[1] - 18, 3, 18);
    ell(c, p[0], p[1] - 20, 5, 5, '#c9a46a');
    if (e.props.spawns && /archer|lan_anh/.test(e.props.spawns)) {
      ell(c, p[0] - 22, p[1] - 14, 7, 7, '#fff', '#c62828');
      ell(c, p[0] - 22, p[1] - 14, 3, 3, '#c62828');
    }
  }
  t.refresh();
  return key;
}

/* ---------------- Lính / tướng / quái ---------------- */

export const UNIT_W = 48;
export const UNIT_H = 56;

export function unitTexture(scene: Phaser.Scene, e: Entity, level: number, team: 'ally' | 'enemy') {
  const key = `unit:${e.key}:${level}:${team}`;
  if (scene.textures.exists(key)) return key;
  const { t, c } = makeCanvas(scene, key, UNIT_W, UNIT_H);
  const cx = UNIT_W / 2;
  const fy = UNIT_H - 8; // chân
  ell(c, cx, fy + 2, 12, 5, 'rgba(0,0,0,.3)');
  const role = e.props.role;
  const general = e.props.unitClass === 'general';
  if (team === 'ally') {
    const armor = level >= 3 ? '#cfd8dc' : level === 2 ? '#90a4ae' : '#8d6e63';
    const tabard = general ? '#c62828' : '#1e63c9';
    if (general) poly(c, [[cx - 9, fy - 26], [cx + 9, fy - 26], [cx + 13, fy - 2], [cx - 13, fy - 2]], '#b71c1c');
    poly(c, [[cx - 7, fy], [cx - 9, fy - 22], [cx + 9, fy - 22], [cx + 7, fy]], armor, '#263238');
    poly(c, [[cx - 5, fy - 4], [cx - 7, fy - 20], [cx + 7, fy - 20], [cx + 5, fy - 4]], tabard);
    ell(c, cx, fy - 28, 7, 7, '#f1c27d', '#263238');
    // mũ
    c.beginPath();
    c.arc(cx, fy - 30, 7.5, Math.PI, 0);
    c.fillStyle = level >= 2 ? '#78909c' : '#6d4c41';
    c.fill();
    if (general || level === 3) {
      poly(c, [[cx - 5, fy - 37], [cx - 3, fy - 43], [cx, fy - 38], [cx + 3, fy - 43], [cx + 5, fy - 37]], '#ffd54a');
    }
    c.lineWidth = 2.5;
    if (role === 'ranged') {
      c.strokeStyle = '#6d4c41';
      c.beginPath();
      c.arc(cx + 10, fy - 16, 11, -1.2, 1.2);
      c.stroke();
      c.strokeStyle = '#ddd';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx + 14, fy - 27);
      c.lineTo(cx + 14, fy - 5);
      c.stroke();
    } else if (role === 'tank') {
      c.strokeStyle = '#8d6e63';
      c.beginPath();
      c.moveTo(cx + 11, fy + 2);
      c.lineTo(cx + 11, fy - 44);
      c.stroke();
      poly(c, [[cx + 8, fy - 44], [cx + 11, fy - 52], [cx + 14, fy - 44]], '#cfd8dc');
      poly(c, [[cx - 16, fy - 22], [cx - 6, fy - 22], [cx - 6, fy - 6], [cx - 11, fy - 2], [cx - 16, fy - 6]], '#1e63c9', '#0d2c5c');
    } else {
      c.strokeStyle = '#cfd8dc';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(cx + 10, fy - 12);
      c.lineTo(cx + 17, fy - (general ? 40 : 32));
      c.stroke();
      ell(c, cx - 11, fy - 14, 6, 8, level >= 2 ? '#1e63c9' : '#8d6e63', '#263238');
    }
  } else {
    drawMonster(c, e, level, cx, fy);
  }
  t.refresh();
  return key;
}

function drawMonster(c: Ctx, e: Entity, level: number, cx: number, fy: number) {
  const dark = level >= 3;
  switch (e.key) {
    case 'wolf':
      ell(c, cx, fy - 10, 15, 8, dark ? '#37474f' : '#78909c', '#263238');
      ell(c, cx + 13, fy - 17, 7, 6, dark ? '#37474f' : '#78909c', '#263238');
      poly(c, [[cx + 10, fy - 22], [cx + 12, fy - 29], [cx + 15, fy - 22]], '#546e7a');
      ell(c, cx + 16, fy - 18, 1.5, 1.5, '#ff1744');
      c.fillStyle = '#455a64';
      for (const dx of [-9, -3, 5, 10]) c.fillRect(cx + dx, fy - 4, 3, 6);
      break;
    case 'bat_swarm':
      for (const [dx, dy] of [[-8, -24], [8, -30], [0, -16]]) {
        poly(c, [[cx + dx - 12, fy + dy - 4], [cx + dx, fy + dy + 2], [cx + dx + 12, fy + dy - 4], [cx + dx + 6, fy + dy + 4], [cx + dx, fy + dy + 6], [cx + dx - 6, fy + dy + 4]], dark ? '#4a148c' : '#7b1fa2');
        ell(c, cx + dx, fy + dy + 2, 3, 4, '#311b92');
        ell(c, cx + dx - 1, fy + dy + 1, 0.8, 0.8, '#ff5252');
      }
      break;
    case 'orc':
      poly(c, [[cx - 11, fy], [cx - 13, fy - 26], [cx + 13, fy - 26], [cx + 11, fy]], dark ? '#4e342e' : '#8d4a2b', '#3e2723');
      ell(c, cx, fy - 32, 9, 8, '#7cb342', '#33691e');
      poly(c, [[cx - 9, fy - 36], [cx - 14, fy - 46], [cx - 5, fy - 38]], '#efebe9');
      poly(c, [[cx + 9, fy - 36], [cx + 14, fy - 46], [cx + 5, fy - 38]], '#efebe9');
      c.fillStyle = '#5d4037';
      c.fillRect(cx + 12, fy - 34, 4, 26);
      ell(c, cx + 14, fy - 36, 6, 5, '#795548');
      break;
    case 'troll_king':
      poly(c, [[cx - 16, fy], [cx - 19, fy - 30], [cx + 19, fy - 30], [cx + 16, fy]], '#5d4037', '#3e2723');
      ell(c, cx, fy - 38, 13, 11, '#689f38', '#33691e');
      poly(c, [[cx - 9, fy - 47], [cx - 6, fy - 54], [cx - 2, fy - 48], [cx + 2, fy - 54], [cx + 6, fy - 48], [cx + 9, fy - 54], [cx + 10, fy - 46]], '#ffd54a');
      ell(c, cx - 5, fy - 38, 2, 2, '#ff1744');
      ell(c, cx + 5, fy - 38, 2, 2, '#ff1744');
      c.fillStyle = '#4e342e';
      c.fillRect(cx + 17, fy - 40, 5, 36);
      break;
    case 'goblin': {
      poly(c, [[cx - 6, fy], [cx - 7, fy - 15], [cx + 7, fy - 15], [cx + 6, fy]], '#6d4c41');
      ell(c, cx, fy - 21, 7, 7, dark ? '#33691e' : '#8bc34a', '#33691e');
      poly(c, [[cx - 6, fy - 23], [cx - 14, fy - 27], [cx - 6, fy - 19]], '#8bc34a');
      poly(c, [[cx + 6, fy - 23], [cx + 14, fy - 27], [cx + 6, fy - 19]], '#8bc34a');
      ell(c, cx - 2.5, fy - 22, 1.3, 1.3, '#ff1744');
      ell(c, cx + 2.5, fy - 22, 1.3, 1.3, '#ff1744');
      c.strokeStyle = '#9e9e9e';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(cx + 8, fy - 8);
      c.lineTo(cx + 13, fy - 18);
      c.stroke();
      break;
    }
    default: {
      const h = hash(e.key) % 360;
      const s = 0.8 + (e.props.size ?? 1) * 0.2;
      ell(c, cx, fy - 14 * s, 11 * s, 13 * s, hsl(h, 50, 40), '#222');
      ell(c, cx - 4, fy - 18 * s, 2, 2, '#ff1744');
      ell(c, cx + 4, fy - 18 * s, 2, 2, '#ff1744');
    }
  }
}

/* ---------------- Cây & vật trang trí ---------------- */

export function decoTexture(scene: Phaser.Scene, e: Entity, level: number) {
  const key = `deco:${e.key}:${level}`;
  if (scene.textures.exists(key)) return key;
  const { t, c } = makeCanvas(scene, key, TW, 80);
  const cx = TW / 2;
  const fy = 80 - TH / 2;
  const s = 0.7 + level * 0.15;
  ell(c, cx, fy + 2, 14 * s, 6 * s, 'rgba(0,0,0,.25)');
  switch (e.props.category) {
    case 'tree':
      c.fillStyle = '#6d4c41';
      c.fillRect(cx - 3 * s, fy - 20 * s, 6 * s, 20 * s);
      if (e.key.includes('pine')) {
        for (let k = 0; k < 3; k++) poly(c, [[cx - (18 - k * 4) * s, fy - (14 + k * 14) * s], [cx, fy - (40 + k * 14) * s], [cx + (18 - k * 4) * s, fy - (14 + k * 14) * s]], hsl(140, 45, 26 + k * 5), '#1b4d2e');
      } else {
        ell(c, cx, fy - 34 * s, 18 * s, 16 * s, '#3f8f3a', '#2e6b2a');
        ell(c, cx - 6 * s, fy - 38 * s, 8 * s, 6 * s, '#5fb050');
      }
      break;
    case 'rock':
      poly(c, [[cx - 16 * s, fy], [cx - 12 * s, fy - 14 * s], [cx - 2 * s, fy - 20 * s], [cx + 12 * s, fy - 14 * s], [cx + 16 * s, fy]], '#8e979e', '#5f6a72');
      poly(c, [[cx - 2 * s, fy - 20 * s], [cx + 12 * s, fy - 14 * s], [cx + 16 * s, fy], [cx + 2 * s, fy]], '#6f7a82');
      break;
    case 'bush':
      ell(c, cx - 6, fy - 7, 9 * s, 8 * s, '#4caf50', '#2e7d32');
      ell(c, cx + 6, fy - 8, 9 * s, 9 * s, '#43a047', '#2e7d32');
      break;
    case 'flower':
      for (let k = 0; k < 6; k++) ell(c, cx - 12 + ((k * 9) % 24), fy - 4 - ((k * 5) % 8), 2.5, 2.5, ['#e91e63', '#ffeb3b', '#fff', '#9c27b0'][k % 4]);
      break;
    case 'fence':
      c.fillStyle = '#8d6e63';
      for (let k = 0; k < 3; k++) c.fillRect(cx - 18 + k * 16, fy - 18 + k * 4, 4, 18);
      c.fillRect(cx - 18, fy - 14, 36, 3);
      break;
    case 'prop':
      ell(c, cx, fy - 10, 16 * s, 12 * s, '#e0b84f', '#a87f2a');
      break;
    default:
      ell(c, cx, fy - 10, 10, 10, hsl(hash(e.key), 40, 50));
  }
  t.refresh();
  return key;
}

/* ---------------- Biểu tượng cho giao diện (data URL) ---------------- */

const iconCache = new Map<string, string>();

export function textureDataURL(scene: Phaser.Scene, key: string) {
  if (iconCache.has(key)) return iconCache.get(key)!;
  const tex = scene.textures.get(key);
  const src = tex.getSourceImage() as HTMLCanvasElement | HTMLImageElement;
  let url = '';
  if (src instanceof HTMLCanvasElement) url = src.toDataURL();
  else if (src instanceof HTMLImageElement) url = src.src;
  iconCache.set(key, url);
  return url;
}

export function chestIcon(e: Entity) {
  const key = `chest:${e.key}`;
  if (iconCache.has(key)) return iconCache.get(key)!;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 56;
  const c = cv.getContext('2d')!;
  const col = e.props.rarity === 'epic' || /gold/.test(e.key) ? ['#ffca28', '#c79100'] : e.props.rarity === 'rare' ? ['#b0bec5', '#607d8b'] : ['#a1673a', '#6d4024'];
  ell(c, 32, 50, 24, 5, 'rgba(0,0,0,.3)');
  c.fillStyle = col[0];
  c.fillRect(10, 24, 44, 24);
  c.beginPath();
  c.moveTo(10, 26);
  c.quadraticCurveTo(32, 2, 54, 26);
  c.closePath();
  c.fillStyle = col[1];
  c.fill();
  c.fillStyle = '#3e2723';
  c.fillRect(10, 24, 44, 3);
  c.fillRect(18, 14, 3, 34);
  c.fillRect(43, 14, 3, 34);
  c.fillStyle = '#ffd54a';
  c.fillRect(28, 26, 8, 10);
  const url = cv.toDataURL();
  iconCache.set(key, url);
  return url;
}

export function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ảnh upload từ admin: khoá texture */
export function uploadedKey(type: string, key: string, level: number) {
  return `img:${type}:${key}:${level}`;
}

export function preloadUploaded(scene: Phaser.Scene, entities: Entity[]) {
  for (const e of entities)
    for (const l of e.levels) if (l.image) scene.load.image(uploadedKey(e.type, e.key, l.level), l.image);
}

export function hasUploaded(scene: Phaser.Scene, e: Entity, level: number) {
  const l = lvl(e, level);
  return !!l.image && scene.textures.exists(uploadedKey(e.type, e.key, l.level));
}
