import { all, get, lvl } from './data';

/** Hệ số thời gian (dữ liệu admin tính bằng giây "thật"; game rút ngắn cho nhịp chơi nhanh) */
export const CFG = {
  MAP: 28,
  BUILD_TIME_SCALE: 0.2,
  TRAIN_TIME_SCALE: 0.25,
  CHEST_TIME_SCALE: 0.1,
  CLEAR_TIME_SCALE: 0.3,
  PREP_TIME: 75,
  PREP_TIME_FIRST: 120,
  CHEST_SLOTS: 4,
  SELL_REFUND: 0.5,
  REPAIR_COST: 0.3,
  TERRITORY_BASE: 9,
  MIN_DAMAGE_PCT: 0.1,
};

export interface BuildingSave {
  id: number;
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  level: number;
  ruined: boolean;
  /** giây còn lại để xây / nâng cấp xong (0 = xong) */
  buildLeft: number;
  buildTotal: number;
  upgrading: boolean;
  /** lính còn sống thuộc nhà này */
  troops: number;
  /** máu từng lính còn sống (theo thứ tự), rỗng = đầy máu */
  troopHp?: number[];
  /** số lính đang chờ tạo */
  queue: number;
  queueProgress: number[];
  rally: { x: number; y: number };
  /** id vật phẩm trong túi đồ, theo ô cổ vật */
  artifacts: (number | null)[];
  /** trang bị theo vị trí (weapon/armor/...) — dùng chung cho cả đội */
  equipment: Record<string, number | null>;
  /** điểm cộng đã phân */
  statAlloc: Record<string, number>;
  /** tướng (key troop) cho nhà tướng */
  general?: string;
  /** tài nguyên đã sản xuất, chờ thu hoạch */
  stored: number;
}

export interface Item {
  id: number;
  type: 'artifact' | 'equipment';
  key: string;
  level: number;
}

export interface ChestSave {
  id: number;
  key: string;
  level: number;
  /** null = chưa mở khoá; số = giây còn lại */
  unlockLeft: number | null;
}

export interface DecoSave {
  x: number;
  y: number;
  key: string;
  level: number;
  clearing?: number;
}

export interface SaveState {
  version: 1;
  seed: number;
  wave: number;
  prepLeft: number;
  resources: Record<string, number>;
  buildings: BuildingSave[];
  items: Item[];
  chests: ChestSave[];
  reserves: Record<string, number>;
  terrain: string[];
  decorations: DecoSave[];
  spawns: { x: number; y: number }[];
  nextId: number;
  stats: { kills: number; bestWave: number; chestsOpened: number; cleared: number; spellsCast: number; lost: number };
  /** id nhiệm vụ đã nhận thưởng */
  quests: string[];
  /** 0.75 dễ · 1 thường · 1.35 khó */
  difficulty: number;
  savedAt: number;
}

const SAVE_KEY = 'cuocchiensinhton-save-v1';
const BACKUP_KEY = 'cuocchiensinhton-wave-backup-v1';

export function saveGame(s: SaveState) {
  s.savedAt = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* bỏ qua */
  }
}

export function saveWaveBackup(s: SaveState) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(s));
  } catch {
    /* bỏ qua */
  }
}

export function loadWaveBackup(): SaveState | null {
  try {
    const t = localStorage.getItem(BACKUP_KEY);
    return t ? normalize(JSON.parse(t)) : null;
  } catch {
    return null;
  }
}

export function loadGame(): SaveState | null {
  try {
    const t = localStorage.getItem(SAVE_KEY);
    if (!t) return null;
    const s = JSON.parse(t) as SaveState;
    if (s.version !== 1 || !s.terrain?.length) return null;
    // bỏ công trình không còn trong dữ liệu admin
    s.buildings = s.buildings.filter((b) => get('building', b.key));
    return normalize(s);
  } catch {
    return null;
  }
}

/** Bổ sung trường mới cho bản lưu cũ */
export function normalize(s: SaveState): SaveState {
  s.stats = Object.assign({ kills: 0, bestWave: 0, chestsOpened: 0, cleared: 0, spellsCast: 0, lost: 0 }, s.stats ?? {});
  s.quests = s.quests ?? [];
  s.difficulty = s.difficulty ?? 1;
  s.savedAt = s.savedAt ?? Date.now();
  return s;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    /* bỏ qua */
  }
}

export function startResources() {
  const r: Record<string, number> = {};
  for (const e of all('resource')) r[e.key] = Number(lvl(e, 1).stats.startAmount ?? 0);
  return r;
}

export function resourceCap(key: string, buildings: BuildingSave[]) {
  const e = get('resource', key);
  let cap = Number(e ? lvl(e, 1).stats.baseCapacity ?? 5000 : 5000);
  if (cap >= 999999) return Infinity;
  for (const b of buildings) {
    if (b.ruined || (b.buildLeft > 0 && !b.upgrading)) continue;
    const be = get('building', b.key);
    if (!be) continue;
    const cat = be.props.category;
    if (cat === 'core' || cat === 'storage') cap += Number(lvl(be, b.level).stats.capacity ?? 0);
  }
  return cap;
}

export function canAfford(res: Record<string, number>, cost: Record<string, number> | undefined) {
  if (!cost) return true;
  return Object.entries(cost).every(([k, v]) => !v || (res[k] ?? 0) >= v);
}

export function pay(res: Record<string, number>, cost: Record<string, number> | undefined) {
  if (!cost) return;
  for (const [k, v] of Object.entries(cost)) if (v) res[k] = (res[k] ?? 0) - v;
}

export function costText(cost: Record<string, number> | undefined) {
  if (!cost) return '';
  return Object.entries(cost)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v} ${get('resource', k)?.name ?? k}`)
    .join(', ');
}
