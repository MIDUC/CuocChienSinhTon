import { EntityData } from '../entities/definitions';

/**
 * Sinh ảnh SVG tạm (placeholder) theo góc nhìn isometric cho mỗi thực thể / cấp,
 * để trang admin và game có hình hiển thị trước khi có ảnh thật.
 */

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const hsl = (h: number, s: number, l: number) => `hsl(${h % 360} ${s}% ${l}%)`;
const pts = (p: number[][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** Ô cỏ hình thoi + bề dày */
function tile(cx: number, cy: number, hw: number, hh: number, thick = 10, hue = 100) {
  return `
  <polygon points="${pts([[cx - hw, cy], [cx, cy + hh], [cx, cy + hh + thick], [cx - hw, cy + thick]])}" fill="${hsl(30, 45, 38)}"/>
  <polygon points="${pts([[cx, cy + hh], [cx + hw, cy], [cx + hw, cy + thick], [cx, cy + hh + thick]])}" fill="${hsl(30, 45, 30)}"/>
  <polygon points="${pts([[cx - hw, cy], [cx, cy - hh], [cx + hw, cy], [cx, cy + hh]])}" fill="${hsl(hue, 55, 52)}" stroke="${hsl(hue, 50, 42)}" stroke-width="2"/>`;
}

/** Khối hộp isometric: trả về các mặt trái/phải/trên */
function box(cx: number, cy: number, hw: number, hh: number, h: number, hue: number, sat = 35, light = 70) {
  return `
  <polygon points="${pts([[cx - hw, cy], [cx, cy + hh], [cx, cy + hh - h], [cx - hw, cy - h]])}" fill="${hsl(hue, sat, light - 8)}"/>
  <polygon points="${pts([[cx, cy + hh], [cx + hw, cy], [cx + hw, cy - h], [cx, cy + hh - h]])}" fill="${hsl(hue, sat, light - 22)}"/>
  <polygon points="${pts([[cx - hw, cy - h], [cx, cy - hh - h], [cx + hw, cy - h], [cx, cy + hh - h]])}" fill="${hsl(hue, sat, light + 8)}"/>`;
}

function label(name: string, level: number, maxLevel: number) {
  const stars = '★'.repeat(Math.min(level, 10));
  return `
  <rect x="8" y="8" rx="10" width="${Math.max(64, 18 + level * 0)}" height="26" fill="rgba(20,24,40,.78)"/>
  <text x="18" y="27" font-size="16" font-weight="700" fill="#ffd54a" font-family="system-ui,sans-serif">Lv ${level}</text>
  <text x="128" y="250" text-anchor="middle" font-size="15" font-weight="700" fill="#fff" stroke="rgba(0,0,0,.55)" stroke-width="3" paint-order="stroke" font-family="system-ui,sans-serif">${esc(name)}</text>
  ${maxLevel > 1 ? `<text x="248" y="27" text-anchor="end" font-size="13" fill="#ffd54a" stroke="rgba(0,0,0,.5)" stroke-width="2" paint-order="stroke" font-family="system-ui,sans-serif">${stars}</text>` : ''}`;
}

function building(e: EntityData, level: number, max: number) {
  const hue = hash(e.key) % 360;
  const t = max > 1 ? (level - 1) / (max - 1) : 0;
  const cx = 128;
  const cy = 176;
  let body = tile(cx, cy, 124, 62);
  const isWall = e.props.category === 'wall';
  if (isWall) {
    const h = 30 + t * 30;
    body += box(cx, cy, 110, 18, h, 30, 8, 72);
    for (let i = -3; i <= 3; i++) body += box(cx + i * 28, cy + i * -4.5 + 0, 9, 4.5, h + 10, 30, 8, 76);
    return body;
  }
  const hw = 66 + t * 14;
  const hh = hw / 2;
  const h = 42 + t * 40;
  body += box(cx, cy, hw, hh, h, 35, 25, 78);
  // cửa sổ theo số tầng (hình bình hành nằm trên mặt trái / phải)
  const floors = 1 + Math.round(t * 2);
  const win = (side: -1 | 1, u: number, v: number) => {
    const P = (uu: number, vv: number) =>
      side < 0 ? [cx - hw + uu * hw, cy + uu * hh - vv] : [cx + uu * hw, cy + hh - uu * hh - vv];
    return `<polygon points="${pts([P(u, v), P(u + 0.16, v), P(u + 0.16, v + 16), P(u, v + 16)])}" fill="${hsl(210, 45, side < 0 ? 28 : 20)}"/>`;
  };
  for (let f = 0; f < floors; f++) {
    const v = 12 + f * (h / floors);
    body += win(-1, 0.25, v) + win(-1, 0.6, v) + win(1, 0.25, v) + win(1, 0.6, v);
  }
  body += `<polygon points="${pts([[cx - hw * 0.45, cy + hh * 0.55], [cx - hw * 0.2, cy + hh * 0.8], [cx - hw * 0.2, cy + hh * 0.8 - 24], [cx - hw * 0.45, cy + hh * 0.55 - 24]])}" fill="#5b3a24"/>`;
  // mái chóp
  const top = cy - h;
  const apex = top - 30 - t * 18;
  body += `
  <polygon points="${pts([[cx - hw - 6, top], [cx, top + hh + 4], [cx, apex]])}" fill="${hsl(hue, 60, 52)}"/>
  <polygon points="${pts([[cx, top + hh + 4], [cx + hw + 6, top], [cx, apex]])}" fill="${hsl(hue, 60, 40)}"/>`;
  if (level >= Math.ceil(max / 2) && max > 1) {
    body += `<line x1="${cx}" y1="${apex}" x2="${cx}" y2="${apex - 26}" stroke="#5b4636" stroke-width="3"/>
    <polygon points="${pts([[cx, apex - 26], [cx + 22, apex - 20], [cx, apex - 13]])}" fill="${hsl(hue + 180, 70, 55)}"/>`;
  }
  return body;
}

function character(e: EntityData, level: number, max: number) {
  const hue = hash(e.key) % 360;
  const t = max > 1 ? (level - 1) / (max - 1) : 0;
  const cx = 128;
  const isMonster = e.type === 'monster';
  const isGeneral = e.type === 'general';
  const skin = isMonster ? hsl(hue, 45, 45) : hsl(28, 55, 72);
  const cloth = isMonster ? hsl(hue + 20, 35, 35) : hsl(hue, 60, 48);
  const scale = 0.85 + t * 0.25 + (isGeneral ? 0.1 : 0);
  let g = tile(cx, 196, 64, 32, 6);
  g += `<ellipse cx="${cx}" cy="196" rx="${34 * scale}" ry="${14 * scale}" fill="rgba(0,0,0,.25)"/>`;
  g += `<g transform="translate(${cx} 196) scale(${scale}) translate(${-cx} -196)">`;
  g += `<rect x="${cx - 26}" y="118" width="52" height="74" rx="22" fill="${cloth}"/>`;
  g += `<rect x="${cx - 26}" y="150" width="52" height="10" fill="${hsl(hue, 30, 25)}" opacity=".5"/>`;
  g += `<circle cx="${cx}" cy="100" r="28" fill="${skin}"/>`;
  if (isMonster) {
    g += `<polygon points="${pts([[cx - 24, 84], [cx - 34, 56], [cx - 12, 76]])}" fill="#f2e6c9"/><polygon points="${pts([[cx + 24, 84], [cx + 34, 56], [cx + 12, 76]])}" fill="#f2e6c9"/>`;
    g += `<circle cx="${cx - 10}" cy="98" r="5" fill="#ffeb3b"/><circle cx="${cx + 10}" cy="98" r="5" fill="#ffeb3b"/>`;
  } else {
    g += `<circle cx="${cx - 9}" cy="100" r="3.5" fill="#222"/><circle cx="${cx + 9}" cy="100" r="3.5" fill="#222"/>`;
    g += `<path d="M${cx - 30} 92 Q${cx} ${50 - t * 10} ${cx + 30} 92 Z" fill="${hsl(210, 10, 62 + t * 10)}"/>`;
  }
  if (isGeneral) {
    g += `<polygon points="${pts([[cx - 20, 70], [cx - 20, 50], [cx - 10, 60], [cx, 44], [cx + 10, 60], [cx + 20, 50], [cx + 20, 70]])}" fill="#ffc83d" stroke="#b8860b" stroke-width="2"/>`;
    g += `<path d="M${cx - 26} 124 L${cx - 46} 186 L${cx - 20} 180 Z" fill="${hsl(hue + 180, 60, 40)}"/>`;
  }
  // vũ khí
  g += `<rect x="${cx + 30}" y="${96 - t * 8}" width="7" height="${84 + t * 8}" rx="3" fill="${isMonster ? '#6d4c41' : hsl(210, 10, 75)}" transform="rotate(14 ${cx + 33} 150)"/>`;
  g += `</g>`;
  return g;
}

function resource(e: EntityData, level: number, max: number) {
  const color = typeof e.props.color === 'string' ? e.props.color : hsl(hash(e.key) % 360, 70, 55);
  const t = max > 1 ? (level - 1) / (max - 1) : 0;
  const count = 1 + Math.round(t * 4);
  let g = `<ellipse cx="128" cy="190" rx="84" ry="26" fill="rgba(0,0,0,.18)"/>`;
  const spots = [[128, 150], [92, 168], [164, 168], [110, 120], [148, 122]];
  for (let i = count - 1; i >= 0; i--) {
    const [x, y] = spots[i];
    g += `<polygon points="${pts([[x, y - 46], [x + 34, y - 10], [x + 22, y + 26], [x - 22, y + 26], [x - 34, y - 10]])}" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="3"/>`;
    g += `<polygon points="${pts([[x, y - 46], [x + 34, y - 10], [x, y - 2], [x - 34, y - 10]])}" fill="#fff" opacity=".35"/>`;
  }
  return g;
}

function chest(e: EntityData, level: number, max: number) {
  const t = max > 1 ? (level - 1) / (max - 1) : 0;
  const rarityHue: Record<string, number> = { common: 28, rare: 210, epic: 280, legendary: 45 };
  const hue = rarityHue[String(e.props.rarity)] ?? hash(e.key) % 360;
  const cx = 128;
  const cy = 172;
  let g = `<ellipse cx="${cx}" cy="${cy + 26}" rx="90" ry="30" fill="rgba(0,0,0,.2)"/>`;
  if (t > 0) g += `<circle cx="${cx}" cy="${cy - 40}" r="${70 + t * 30}" fill="${hsl(hue, 90, 70)}" opacity="${0.15 + t * 0.2}"/>`;
  g += box(cx, cy, 72, 36, 48, hue, 55, 52);
  g += box(cx, cy - 48, 72, 36, 26, hue, 55, 60);
  g += `<polygon points="${pts([[cx - 8, cy + 36 - 40], [cx + 8, cy + 36 - 40], [cx + 8, cy + 36 - 74], [cx - 8, cy + 36 - 74]])}" fill="#ffd54a" stroke="#a37400" stroke-width="2"/>`;
  g += `<line x1="${cx - 72}" y1="${cy - 48}" x2="${cx}" y2="${cy - 12}" stroke="#ffd54a" stroke-width="4"/><line x1="${cx}" y1="${cy - 12}" x2="${cx + 72}" y2="${cy - 48}" stroke="#c9a227" stroke-width="4"/>`;
  return g;
}

function terrain(e: EntityData, level: number) {
  const color = typeof e.props.color === 'string' ? e.props.color : hsl(hash(e.key) % 360, 50, 55);
  const cx = 128;
  const cy = 150;
  let g = `
  <polygon points="${pts([[cx - 124, cy], [cx, cy + 62], [cx, cy + 82], [cx - 124, cy + 20]])}" fill="${hsl(30, 40, 36)}"/>
  <polygon points="${pts([[cx, cy + 62], [cx + 124, cy], [cx + 124, cy + 20], [cx, cy + 82]])}" fill="${hsl(30, 40, 28)}"/>
  <polygon points="${pts([[cx - 124, cy], [cx, cy - 62], [cx + 124, cy], [cx, cy + 62]])}" fill="${color}" stroke="rgba(0,0,0,.18)" stroke-width="2"/>`;
  // chấm hoạ tiết khác nhau theo biến thể
  let r = hash(e.key + level);
  for (let i = 0; i < 10 + level * 4; i++) {
    r = (Math.imul(r, 1103515245) + 12345) >>> 0;
    const u = (r % 1000) / 1000 - 0.5;
    const v = ((r >>> 10) % 1000) / 1000 - 0.5;
    const x = cx + (u + v) * 124 * 0.85;
    const y = cy + (v - u) * 62 * 0.85;
    g += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="5" ry="2.5" fill="rgba(0,0,0,.12)"/>`;
  }
  return g;
}

function decoration(e: EntityData, level: number, max: number) {
  const t = max > 1 ? (level - 1) / (max - 1) : 0;
  const cat = String(e.props.category ?? 'prop');
  const cx = 128;
  const base = 196;
  let g = `<ellipse cx="${cx}" cy="${base}" rx="${46 + t * 20}" ry="${18 + t * 8}" fill="rgba(0,0,0,.22)"/>`;
  if (cat === 'tree') {
    const s = 0.7 + t * 0.45;
    const pine = /pine|thông/i.test(e.key + e.name);
    g += `<rect x="${cx - 8 * s}" y="${base - 50 * s}" width="${16 * s}" height="${50 * s}" fill="#7a4e2d"/>`;
    if (pine) {
      for (let i = 0; i < 3; i++) {
        const y = base - 40 * s - i * 34 * s;
        const w = (58 - i * 14) * s;
        g += `<polygon points="${pts([[cx - w, y], [cx, y - 56 * s], [cx + w, y]])}" fill="${hsl(140, 45, 30 + i * 6)}"/>`;
      }
    } else {
      g += `<circle cx="${cx}" cy="${base - 100 * s}" r="${54 * s}" fill="${hsl(110, 50, 40)}"/>`;
      g += `<circle cx="${cx - 26 * s}" cy="${base - 82 * s}" r="${34 * s}" fill="${hsl(110, 50, 45)}"/>`;
      g += `<circle cx="${cx + 22 * s}" cy="${base - 118 * s}" r="${28 * s}" fill="${hsl(110, 55, 55)}"/>`;
    }
  } else if (cat === 'rock') {
    const s = 0.7 + t * 0.5;
    g += `<polygon points="${pts([[cx - 50 * s, base], [cx - 34 * s, base - 46 * s], [cx + 6 * s, base - 64 * s], [cx + 46 * s, base - 36 * s], [cx + 54 * s, base]])}" fill="${hsl(210, 8, 60)}"/>`;
    g += `<polygon points="${pts([[cx + 6 * s, base - 64 * s], [cx + 46 * s, base - 36 * s], [cx + 54 * s, base], [cx + 10 * s, base]])}" fill="${hsl(210, 8, 48)}"/>`;
  } else if (cat === 'bush' || cat === 'flower') {
    const s = 0.7 + t * 0.4;
    for (const [dx, dy, r] of [[-24, -20, 26], [22, -18, 24], [0, -38, 28]]) g += `<circle cx="${cx + dx * s}" cy="${base + dy * s}" r="${r * s}" fill="${hsl(115, 45, 42)}"/>`;
    if (cat === 'flower') for (const [dx, dy] of [[-30, -30], [10, -50], [26, -24], [-6, -20]]) g += `<circle cx="${cx + dx * s}" cy="${base + dy * s}" r="${6 * s}" fill="${hsl(hash(e.key) % 360, 80, 65)}"/>`;
  } else if (cat === 'fence') {
    for (let i = -2; i <= 2; i++) g += `<rect x="${cx + i * 26 - 4}" y="${base - 46 + i * 13 - 10}" width="8" height="48" fill="#8a5a33"/>`;
    g += `<line x1="${cx - 60}" y1="${base - 60}" x2="${cx + 60}" y2="${base}" stroke="#a06a3e" stroke-width="7"/>`;
    g += `<line x1="${cx - 60}" y1="${base - 40}" x2="${cx + 60}" y2="${base + 20}" stroke="#a06a3e" stroke-width="7"/>`;
  } else {
    g += box(cx, base - 10, 34, 17, 40 + t * 20, hash(e.key) % 360, 35, 62);
  }
  return g;
}

export function placeholderSvg(e: EntityData, level: number): string {
  const max = Math.max(1, e.levels.length);
  const lv = Math.max(1, Math.min(level, max));
  let body = '';
  switch (e.type) {
    case 'building':
      body = building(e, lv, max);
      break;
    case 'troop':
    case 'general':
    case 'monster':
      body = character(e, lv, max);
      break;
    case 'resource':
      body = resource(e, lv, max);
      break;
    case 'chest':
      body = chest(e, lv, max);
      break;
    case 'terrain':
      body = terrain(e, lv);
      break;
    case 'decoration':
      body = decoration(e, lv, max);
      break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <!-- placeholder: ${esc(e.type)}/${esc(e.key)} level ${lv} -->
  ${body}
  ${label(e.name, lv, max)}
</svg>`;
}
