import { mulberry } from './art';
import { all, get, lvl } from './data';
import { BuildingSave, CFG, DecoSave, SaveState, startResources } from './state';

/** Tạo bản đồ mới: địa hình ngẫu nhiên, hồ nước, cây/đá, thành chính ở giữa, 3 cổng quái ở mép bản đồ. */
export function newState(seed = (Math.random() * 1e9) | 0): SaveState {
  const n = CFG.MAP;
  const rnd = mulberry(seed);
  const terr = new Array<string>(n * n).fill(get('terrain', 'grass') ? 'grass' : all('terrain')[0]?.key ?? 'grass');
  const c = n / 2;
  const spawns = [
    { x: 0, y: Math.floor(c) },
    { x: Math.floor(c), y: 0 },
    { x: n - 1, y: Math.floor(c) - 3 },
  ];
  const nearSpawn = (x: number, y: number, r: number) => spawns.some((s) => Math.hypot(s.x - x, s.y - y) < r);

  // vệt đất / cát / nền đá
  const patches = ['dirt', 'sand', 'stone_ground'].filter((k) => get('terrain', k));
  for (let i = 0; i < 9 && patches.length; i++) {
    const k = patches[Math.floor(rnd() * patches.length)];
    const px = rnd() * n;
    const py = rnd() * n;
    const r = 1.5 + rnd() * 2.5;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - px, (y - py) * 1.2) < r + rnd() * 0.8) terr[y * n + x] = k;
  }
  // nền đá quanh thành
  if (get('terrain', 'stone_ground'))
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.abs(x - c + 0.5) <= 2.6 && Math.abs(y - c + 0.5) <= 2.6) terr[y * n + x] = 'stone_ground';
  // hồ nước ở góc dưới (xa cổng quái)
  if (get('terrain', 'water')) {
    const lx = n * (0.72 + rnd() * 0.1);
    const ly = n * (0.75 + rnd() * 0.1);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const d = Math.hypot(x - lx, y - ly);
        if (d < 2.6 + rnd() * 0.9 && !nearSpawn(x, y, 4)) terr[y * n + x] = 'water';
      }
  }
  // đường đất từ cổng quái vào gần thành (chỉ để nhìn, đi nhanh hơn)
  if (get('terrain', 'road'))
    for (const s of spawns) {
      let x = s.x;
      let y = s.y;
      let guard = 0;
      while (Math.hypot(x - c, y - c) > 6 && guard++ < 100) {
        if (terr[y * n + x] !== 'water') terr[y * n + x] = 'road';
        if (Math.abs(x - c) > Math.abs(y - c)) x += Math.sign(c - x);
        else y += Math.sign(c - y);
        if (rnd() < 0.25) {
          if (Math.abs(x - c) > Math.abs(y - c)) y += Math.sign(c - y);
          else x += Math.sign(c - x);
        }
        x = Math.max(0, Math.min(n - 1, x));
        y = Math.max(0, Math.min(n - 1, y));
      }
    }

  const hall = { x: Math.floor(c) - 1, y: Math.floor(c) - 1 };
  const buildings: BuildingSave[] = [];
  let id = 1;
  const add = (key: string, x: number, y: number, extra: Partial<BuildingSave> = {}) => {
    const e = get('building', key);
    if (!e) return;
    const w = Number(e.props.footprintW ?? e.props.size ?? 1);
    const h = Number(e.props.footprintH ?? e.props.size ?? 1);
    const troops = e.props.spawns ? Number(lvl(e, 1).stats.troopCount ?? 0) : 0;
    buildings.push({
      id: id++,
      key,
      x,
      y,
      w,
      h,
      level: 1,
      ruined: false,
      buildLeft: 0,
      buildTotal: 0,
      upgrading: false,
      troops,
      queue: 0,
      queueProgress: [],
      rally: { x: Number(e.props.rallyX ?? 0), y: Number(e.props.rallyY ?? 0) },
      artifacts: new Array(Number(e.props.artifactSlots ?? 0)).fill(null),
      equipment: {},
      statAlloc: {},
      stored: 0,
      ...extra,
    });
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (terr[yy * n + xx] === 'water' || terr[yy * n + xx] === 'road') terr[yy * n + xx] = 'stone_ground';
  };
  add('town_hall', hall.x, hall.y);
  add('barracks', hall.x - 3, hall.y);
  add('farm', hall.x + 4, hall.y + 2);
  add('gold_mine', hall.x, hall.y + 4);

  const occupied = (x: number, y: number) => buildings.some((b) => x >= b.x - 1 && x < b.x + b.w + 1 && y >= b.y - 1 && y < b.y + b.h + 1);

  // cây, đá, bụi
  const decos: DecoSave[] = [];
  const pool = all('decoration').filter((d) => Number(lvl(d, 1).stats.spawnWeight ?? 0) > 0 || d.props.category === 'tree');
  const totalW = pool.reduce((s, d) => s + Number(lvl(d, 1).stats.spawnWeight ?? 20), 0);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const t = terr[y * n + x];
      if (t === 'water' || t === 'road') continue;
      if (Math.hypot(x - c, y - c) < 6.5 || nearSpawn(x, y, 3) || occupied(x, y)) continue;
      const edge = Math.min(x, y, n - 1 - x, n - 1 - y);
      const p = edge < 3 ? 0.22 : 0.08;
      if (rnd() > p || !pool.length) continue;
      let r = rnd() * totalW;
      let pick = pool[0];
      for (const d of pool) {
        r -= Number(lvl(d, 1).stats.spawnWeight ?? 20);
        if (r <= 0) {
          pick = d;
          break;
        }
      }
      decos.push({ x, y, key: pick.key, level: 1 + Math.floor(rnd() * pick.levels.length) });
    }

  return {
    version: 1,
    seed,
    wave: 0,
    prepLeft: CFG.PREP_TIME_FIRST,
    resources: startResources(),
    buildings,
    items: [],
    chests: get('chest', 'wooden_chest') ? [{ id: 1, key: 'wooden_chest', level: 1, unlockLeft: null }] : [],
    reserves: {},
    terrain: terr,
    decorations: decos,
    spawns,
    nextId: 100,
    stats: { kills: 0, bestWave: 0 },
  };
}
