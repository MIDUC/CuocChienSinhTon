/**
 * Định nghĩa các loại dữ liệu game và cấu trúc JSON của từng bản ghi.
 * Đây là nguồn duy nhất: trang admin đọc thông tin này qua GET /api/meta.
 */

export const ENTITY_TYPES = ['building', 'troop', 'general', 'monster', 'resource', 'chest'] as const;
export type EntityTypeKey = (typeof ENTITY_TYPES)[number];

/** Một phần thưởng trong rương. item dạng "resource:gold", "troop:swordsman", "general:tran_hung", "chest:wooden_chest" */
export interface Reward {
  item: string;
  min: number;
  max: number;
  /** Tỉ lệ rơi 0..1 */
  chance: number;
}

export interface LevelData {
  level: number;
  /** Chỉ số của cấp này, ví dụ { hp: 800, damage: 20 } */
  stats: Record<string, number>;
  /** Chi phí để xây / nâng lên cấp này, theo key tài nguyên, ví dụ { gold: 200, wood: 100 } */
  cost: Record<string, number>;
  /** Phần thưởng (chỉ dùng cho rương) */
  rewards?: Reward[];
  /** Đường dẫn ảnh đã upload (ví dụ /assets/building/barracks/lv1-1700000000.png). null = dùng ảnh placeholder */
  image: string | null;
  /** Mô tả ngoại hình riêng của cấp này (tiếng Anh) để ghép vào prompt vẽ ảnh */
  artNote: string;
}

export interface EntityData {
  key: string;
  type: EntityTypeKey;
  name: string;
  description: string;
  /** Mô tả chủ thể để vẽ ảnh (tiếng Anh cho công cụ AI hiểu tốt nhất) */
  artSubject: string;
  /** Thuộc tính cố định không đổi theo cấp, ví dụ { size: 2, spawns: "swordsman" } */
  props: Record<string, string | number | boolean>;
  levels: LevelData[];
}

export interface FieldDef {
  key: string;
  label: string;
  hint?: string;
}

export interface TypeDef {
  type: EntityTypeKey;
  label: string;
  /** Thư mục trong /data chứa file JSON của loại này */
  folder: string;
  icon: string;
  /** Các chỉ số gợi ý khi tạo mới / thêm nhanh */
  stats: FieldDef[];
  /** Các thuộc tính cố định gợi ý */
  props: FieldDef[];
  /** Có chi phí theo cấp không */
  hasCost: boolean;
  /** Có danh sách phần thưởng không (rương) */
  hasRewards: boolean;
}

export const TYPE_DEFS: Record<EntityTypeKey, TypeDef> = {
  building: {
    type: 'building',
    label: 'Công trình',
    folder: 'buildings',
    icon: '🏰',
    hasCost: true,
    hasRewards: false,
    stats: [
      { key: 'hp', label: 'Máu' },
      { key: 'buildTimeSec', label: 'Thời gian xây (giây)' },
      { key: 'coverRadius', label: 'Bán kính bao phủ (ô)', hint: 'Nhà lính / nhà tướng: quái vào vùng này thì quân ra đánh' },
      { key: 'troopCount', label: 'Số lính xuất trận' },
      { key: 'respawnSec', label: 'Hồi sinh lính (giây)' },
      { key: 'damage', label: 'Sát thương' },
      { key: 'attackRange', label: 'Tầm bắn (ô)' },
      { key: 'attackSpeed', label: 'Tốc độ đánh (lần/giây)' },
      { key: 'production', label: 'Sản lượng / giờ' },
      { key: 'capacity', label: 'Sức chứa' },
    ],
    props: [
      { key: 'category', label: 'Nhóm', hint: 'core | military | defense | economy | storage | wall' },
      { key: 'size', label: 'Kích thước (ô)', hint: '2 = chiếm 2×2 ô' },
      { key: 'spawns', label: 'Xuất quân', hint: 'key của lính hoặc tướng, ví dụ swordsman' },
      { key: 'produces', label: 'Sản xuất tài nguyên', hint: 'key tài nguyên, ví dụ gold' },
      { key: 'maxCount', label: 'Số lượng tối đa' },
    ],
  },
  troop: {
    type: 'troop',
    label: 'Lính',
    folder: 'troops',
    icon: '🗡️',
    hasCost: true,
    hasRewards: false,
    stats: [
      { key: 'hp', label: 'Máu' },
      { key: 'damage', label: 'Sát thương' },
      { key: 'armor', label: 'Giáp' },
      { key: 'attackRange', label: 'Tầm đánh (ô)' },
      { key: 'attackSpeed', label: 'Tốc độ đánh (lần/giây)' },
      { key: 'moveSpeed', label: 'Tốc độ chạy (ô/giây)' },
    ],
    props: [
      { key: 'role', label: 'Vai trò', hint: 'melee | ranged | tank | support' },
      { key: 'size', label: 'Kích thước (ô)' },
    ],
  },
  general: {
    type: 'general',
    label: 'Tướng',
    folder: 'generals',
    icon: '👑',
    hasCost: true,
    hasRewards: false,
    stats: [
      { key: 'hp', label: 'Máu' },
      { key: 'damage', label: 'Sát thương' },
      { key: 'armor', label: 'Giáp' },
      { key: 'attackRange', label: 'Tầm đánh (ô)' },
      { key: 'attackSpeed', label: 'Tốc độ đánh (lần/giây)' },
      { key: 'moveSpeed', label: 'Tốc độ chạy (ô/giây)' },
      { key: 'auraRadius', label: 'Bán kính hào quang (ô)' },
      { key: 'auraBonusPct', label: 'Tăng sức mạnh quân xung quanh (%)' },
      { key: 'skillCooldownSec', label: 'Hồi chiêu (giây)' },
    ],
    props: [
      { key: 'role', label: 'Vai trò' },
      { key: 'skill', label: 'Tên chiêu thức' },
      { key: 'size', label: 'Kích thước (ô)' },
    ],
  },
  monster: {
    type: 'monster',
    label: 'Quái vật',
    folder: 'monsters',
    icon: '👹',
    hasCost: false,
    hasRewards: false,
    stats: [
      { key: 'hp', label: 'Máu' },
      { key: 'damage', label: 'Sát thương' },
      { key: 'armor', label: 'Giáp' },
      { key: 'attackRange', label: 'Tầm đánh (ô)' },
      { key: 'attackSpeed', label: 'Tốc độ đánh (lần/giây)' },
      { key: 'moveSpeed', label: 'Tốc độ chạy (ô/giây)' },
      { key: 'goldDrop', label: 'Vàng rơi ra' },
    ],
    props: [
      { key: 'role', label: 'Kiểu', hint: 'melee | ranged | flying | boss' },
      { key: 'target', label: 'Ưu tiên tấn công', hint: 'nearest | buildings | walls | core' },
      { key: 'size', label: 'Kích thước (ô)' },
    ],
  },
  resource: {
    type: 'resource',
    label: 'Tài nguyên',
    folder: 'resources',
    icon: '💰',
    hasCost: false,
    hasRewards: false,
    stats: [
      { key: 'startAmount', label: 'Số lượng ban đầu' },
      { key: 'baseCapacity', label: 'Sức chứa cơ bản' },
    ],
    props: [
      { key: 'rarity', label: 'Độ hiếm', hint: 'common | rare | premium' },
      { key: 'color', label: 'Màu đại diện', hint: '#f5c542' },
    ],
  },
  chest: {
    type: 'chest',
    label: 'Rương',
    folder: 'chests',
    icon: '🎁',
    hasCost: false,
    hasRewards: true,
    stats: [
      { key: 'unlockTimeSec', label: 'Thời gian mở (giây)' },
      { key: 'gemSkipCost', label: 'Giá mở ngay (ngọc)' },
      { key: 'rolls', label: 'Số lượt quay thưởng' },
    ],
    props: [
      { key: 'rarity', label: 'Độ hiếm', hint: 'common | rare | epic | legendary' },
      { key: 'source', label: 'Nhận từ', hint: 'wave | boss | shop | daily' },
    ],
  },
};

export function isEntityType(v: string): v is EntityTypeKey {
  return (ENTITY_TYPES as readonly string[]).includes(v);
}

/** Chuẩn hoá dữ liệu bất kỳ thành EntityData hợp lệ (điền giá trị mặc định, sắp xếp cấp). Ném lỗi nếu thiếu thông tin bắt buộc. */
export function normalizeEntity(raw: any, forcedType?: EntityTypeKey): EntityData {
  const type = forcedType ?? raw?.type;
  if (!type || !isEntityType(type)) throw new Error(`Loại không hợp lệ: ${type}`);
  const key = String(raw?.key ?? '').trim();
  if (!/^[a-z0-9_]+$/.test(key)) throw new Error(`Key "${key}" chỉ được dùng chữ thường, số và dấu gạch dưới`);
  const name = String(raw?.name ?? '').trim();
  if (!name) throw new Error('Thiếu tên');

  const numMap = (o: any): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(o ?? {})) {
      const n = Number(v);
      if (k && Number.isFinite(n)) out[k] = n;
    }
    return out;
  };

  const levelsRaw: any[] = Array.isArray(raw?.levels) && raw.levels.length ? raw.levels : [{ level: 1 }];
  const levels: LevelData[] = levelsRaw
    .map((l, i) => {
      const lv: LevelData = {
        level: Number(l?.level) || i + 1,
        stats: numMap(l?.stats),
        cost: numMap(l?.cost),
        image: typeof l?.image === 'string' && l.image ? l.image : null,
        artNote: String(l?.artNote ?? ''),
      };
      if (TYPE_DEFS[type as EntityTypeKey].hasRewards) {
        lv.rewards = (Array.isArray(l?.rewards) ? l.rewards : []).map((r: any) => ({
          item: String(r?.item ?? ''),
          min: Number(r?.min) || 0,
          max: Number(r?.max) || 0,
          chance: Math.min(1, Math.max(0, Number(r?.chance ?? 1))),
        }));
      }
      return lv;
    })
    .sort((a, b) => a.level - b.level);

  const props: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw?.props ?? {})) {
    if (!k) continue;
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') props[k] = v;
  }

  return {
    key,
    type: type as EntityTypeKey,
    name,
    description: String(raw?.description ?? ''),
    artSubject: String(raw?.artSubject ?? ''),
    props,
    levels,
  };
}
