/**
 * Dữ liệu game: lấy từ server (/api/game-data — dữ liệu sửa trên trang admin, kèm ảnh upload).
 * Không có server thì dùng bản sao file JSON trong data/ được đóng gói sẵn lúc build.
 */

export interface Effect {
  type: string;
  value: number;
  chance: number;
  durationSec: number;
  radius: number;
}

export interface Reward {
  item: string;
  min: number;
  max: number;
  chance: number;
}

export interface Level {
  level: number;
  stats: Record<string, number>;
  cost: Record<string, number>;
  image: string | null;
  troopStats?: Record<string, number>;
  trainCost?: Record<string, number>;
  rewards?: Reward[];
  effects?: Effect[];
}

export interface Entity {
  key: string;
  type: string;
  name: string;
  description?: string;
  props: Record<string, any>;
  levels: Level[];
}

export type GameData = Record<string, Entity[]>;

const TYPES = ['building', 'troop', 'monster', 'resource', 'chest', 'terrain', 'decoration', 'artifact', 'equipment'];
const DIR_TO_TYPE: Record<string, string> = {
  buildings: 'building',
  troops: 'troop',
  monsters: 'monster',
  resources: 'resource',
  chests: 'chest',
  terrains: 'terrain',
  decorations: 'decoration',
  artifacts: 'artifact',
  equipments: 'equipment',
};

let DATA: GameData = {};
export let dataSource: 'server' | 'local' = 'local';

export async function loadGameData(): Promise<GameData> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch('/api/game-data', { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
      const d = (await r.json()) as GameData;
      if (d.building?.length) {
        DATA = d;
        dataSource = 'server';
        return DATA;
      }
    }
  } catch {
    /* không có server — dùng file */
  }
  const files = import.meta.glob('../../data/*/*.json', { eager: true, import: 'default' }) as Record<string, Entity>;
  const out: GameData = {};
  for (const t of TYPES) out[t] = [];
  for (const [path, e] of Object.entries(files)) {
    const dir = path.split('/').slice(-2)[0];
    const type = DIR_TO_TYPE[dir];
    if (!type || !e?.key) continue;
    out[type].push({ ...e, type });
  }
  DATA = out;
  dataSource = 'local';
  return DATA;
}

export function all(type: string): Entity[] {
  return DATA[type] ?? [];
}

export function get(type: string, key: string): Entity | undefined {
  return all(type).find((e) => e.key === key);
}

export function lvl(e: Entity, level: number): Level {
  const l = Math.max(1, Math.min(level, e.levels.length));
  return e.levels[l - 1];
}

export function maxLevel(e: Entity) {
  return e.levels.length;
}

export function resName(key: string) {
  return get('resource', key)?.name ?? key;
}

export function resColor(key: string) {
  return get('resource', key)?.props?.color ?? '#ccc';
}

/** "hp:20,damage:3" -> {hp:20, damage:3} */
export function parseKV(s: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of String(s ?? '').split(',')) {
    const [k, v] = part.split(':').map((x) => x.trim());
    if (k && v && !isNaN(Number(v))) out[k] = Number(v);
  }
  return out;
}

export function parseList(s: string | undefined): number[] {
  return String(s ?? '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => !isNaN(x) && x > 0);
}

export const STAT_LABEL: Record<string, string> = {
  hp: 'Máu',
  damage: 'Sát thương',
  armor: 'Giáp',
  attackRange: 'Tầm đánh',
  attackSpeed: 'Tốc đánh',
  moveSpeed: 'Tốc chạy',
  coverRadius: 'Vùng bao phủ',
  troopCount: 'Số lính',
  production: 'Sản lượng/phút',
  capacity: 'Sức chứa',
  auraRadius: 'Bán kính hào quang',
  auraBonusPct: 'Hào quang +% ST',
  hpPct: 'Máu %',
  damagePct: 'Sát thương %',
  moveSpeedPct: 'Tốc chạy %',
  attackSpeedPct: 'Tốc đánh %',
  trainTimePct: 'Giảm thời gian tạo %',
  skillCooldownPct: 'Giảm hồi chiêu %',
  skillCooldownSec: 'Hồi chiêu (giây)',
  wallRangeBonus: 'Tầm thêm trên tường',
  wallDamagePct: 'ST thêm trên tường %',
};

export const EFFECT_LABEL: Record<string, string> = {
  lifesteal: 'Hút máu',
  crit: 'Chí mạng',
  splash: 'Sát thương lan',
  slow: 'Làm chậm',
  stun: 'Gây choáng',
  burn: 'Thiêu đốt',
  poison: 'Độc',
  knockback: 'Đẩy lùi',
  armorBreak: 'Phá giáp',
  thorns: 'Phản đòn',
  shield: 'Khiên chắn',
  regen: 'Hồi máu',
  healAura: 'Hào quang hồi máu',
  buffAura: 'Hào quang tăng ST',
  dodge: 'Né đòn',
  revive: 'Hồi sinh 1 lần',
  goldBonus: 'Thêm vàng',
};

export function effectText(e: Effect) {
  const parts = [`${EFFECT_LABEL[e.type] ?? e.type} ${e.value}`];
  if (e.chance < 1) parts.push(`${Math.round(e.chance * 100)}%`);
  if (e.durationSec) parts.push(`${e.durationSec}s`);
  if (e.radius) parts.push(`r${e.radius}`);
  return parts.join(' · ');
}
