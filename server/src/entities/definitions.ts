/**
 * Định nghĩa các loại dữ liệu game và cấu trúc JSON của từng bản ghi.
 * Đây là nguồn duy nhất: trang admin đọc thông tin này qua GET /api/meta.
 */

export const ENTITY_TYPES = ['building', 'troop', 'monster', 'resource', 'chest', 'terrain', 'decoration', 'artifact', 'equipment'] as const;
export type EntityTypeKey = (typeof ENTITY_TYPES)[number];

/** Một phần thưởng trong rương. item dạng "resource:gold", "troop:swordsman", "troop:tran_hung" (tướng cũng là lính), "chest:wooden_chest" */
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
  /** Chỉ số của lính do nhà này sinh ra, ở cấp nhà này (nhà lính / nhà tướng). Ghi đè chỉ số trong mục Lính. */
  troopStats?: Record<string, number>;
  /** Chi phí tạo lại 1 lính ở cấp nhà này (lính chết là mất, không tự hồi sinh), theo key tài nguyên */
  trainCost?: Record<string, number>;
  /** Công dụng đặc biệt ở cấp này (cổ vật, trang bị) */
  effects?: Effect[];
  /** Đường dẫn ảnh đã upload (ví dụ /assets/building/barracks/lv1-1700000000.png). null = dùng ảnh placeholder */
  image: string | null;
  /** Mô tả ngoại hình riêng của cấp này (tiếng Anh) để ghép vào prompt vẽ ảnh */
  artNote: string;
}

/** Một công dụng đặc biệt, ví dụ { type: 'lifesteal', value: 10 } = hút 10% sát thương thành máu */
export interface Effect {
  type: string;
  /** Độ mạnh, đơn vị tuỳ công dụng (xem EFFECT_TYPES) */
  value: number;
  /** Tỉ lệ kích hoạt 0..1 (1 = luôn luôn) */
  chance: number;
  /** Thời gian hiệu lực (giây), 0 = tức thì / vĩnh viễn */
  durationSec: number;
  /** Bán kính (ô), 0 = chỉ 1 mục tiêu */
  radius: number;
  /** Ghi chú tự do */
  note?: string;
}

export interface EffectTypeDef {
  type: string;
  label: string;
  /** Đơn vị của value */
  unit: string;
  /** Trường nào có ý nghĩa với công dụng này */
  uses: ('chance' | 'durationSec' | 'radius')[];
  desc: string;
}

export const EFFECT_TYPES: EffectTypeDef[] = [
  { type: 'lifesteal', label: 'Hút máu', unit: '% sát thương', uses: [], desc: 'Hồi máu bằng một phần sát thương gây ra' },
  { type: 'crit', label: 'Chí mạng', unit: '% sát thương thêm', uses: ['chance'], desc: 'Có tỉ lệ gây thêm sát thương' },
  { type: 'splash', label: 'Sát thương lan', unit: '% sát thương', uses: ['radius'], desc: 'Gây sát thương cho quái xung quanh mục tiêu' },
  { type: 'slow', label: 'Làm chậm', unit: '% tốc độ', uses: ['chance', 'durationSec'], desc: 'Giảm tốc độ chạy của quái' },
  { type: 'stun', label: 'Gây choáng', unit: '', uses: ['chance', 'durationSec'], desc: 'Quái đứng yên không đánh được' },
  { type: 'burn', label: 'Thiêu đốt', unit: 'sát thương / giây', uses: ['chance', 'durationSec'], desc: 'Gây sát thương theo thời gian' },
  { type: 'poison', label: 'Độc', unit: 'sát thương / giây', uses: ['chance', 'durationSec'], desc: 'Gây sát thương theo thời gian, giảm hồi máu' },
  { type: 'knockback', label: 'Đẩy lùi', unit: 'ô', uses: ['chance'], desc: 'Đẩy quái lùi lại' },
  { type: 'armorBreak', label: 'Phá giáp', unit: 'giáp', uses: ['chance', 'durationSec'], desc: 'Giảm giáp của quái' },
  { type: 'thorns', label: 'Phản đòn', unit: '% sát thương nhận', uses: [], desc: 'Trả lại một phần sát thương cho kẻ đánh' },
  { type: 'shield', label: 'Khiên chắn', unit: 'máu ảo', uses: ['durationSec'], desc: 'Tạo khiên hấp thụ sát thương khi bắt đầu trận' },
  { type: 'regen', label: 'Hồi máu', unit: 'máu / giây', uses: [], desc: 'Tự hồi máu liên tục' },
  { type: 'healAura', label: 'Hào quang hồi máu', unit: 'máu / giây', uses: ['radius'], desc: 'Hồi máu cho lính đồng minh xung quanh' },
  { type: 'buffAura', label: 'Hào quang tăng sát thương', unit: '% sát thương', uses: ['radius'], desc: 'Tăng sát thương cho lính đồng minh xung quanh' },
  { type: 'dodge', label: 'Né đòn', unit: '% tỉ lệ', uses: [], desc: 'Có tỉ lệ né hoàn toàn đòn đánh' },
  { type: 'revive', label: 'Hồi sinh 1 lần', unit: '% máu', uses: ['chance'], desc: 'Khi chết có tỉ lệ sống lại với % máu (1 lần mỗi trận)' },
  { type: 'goldBonus', label: 'Thêm vàng khi hạ quái', unit: '%', uses: [], desc: 'Tăng vàng rơi ra từ quái bị hạ' },
];

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
  /** Có công dụng đặc biệt theo cấp không (cổ vật, trang bị) */
  hasEffects?: boolean;
  /** Ghi chú hiển thị trên trang danh sách */
  note?: string;
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
      { key: 'troopCount', label: 'Số lính tối đa', hint: 'Nhà lính: số lính đứng quanh nhà (vd 1, 3, 6, 9, 16)' },
      { key: 'statPoints', label: 'Điểm cộng nhận khi lên cấp này', hint: 'Người chơi tự phân bổ vào chỉ số lính' },
      { key: 'troopLevel', label: 'Cấp của lính', hint: 'Lính sinh ra ở cấp này (lấy chỉ số + ảnh của cấp đó)' },
      { key: 'trainTimeSec', label: 'Thời gian tạo 1 lính (giây)', hint: 'Lính chết là mất; người chơi trả tài nguyên để tạo lại' },
      { key: 'trainQueue', label: 'Số lính tạo cùng lúc' },
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
      { key: 'garrisonFormation', label: 'Đội hình đứng chờ', hint: 'ring = vây quanh nhà | grid = xếp khối trước cửa' },
      { key: 'garrisonSpacing', label: 'Khoảng cách giữa lính (ô)', hint: '1 = mỗi lính 1 ô' },
      { key: 'engageMode', label: 'Cách ra đánh', hint: 'all = cả đội lao ra | split = chia đều theo số quái' },
      { key: 'chaseRadius', label: 'Đuổi thêm ngoài vùng (ô)' },
      { key: 'returnWhenClear', label: 'Hết địch thì quay về', hint: 'true | false' },
      { key: 'rallySelectable', label: 'Người chơi chọn điểm đóng quân', hint: 'true = được kéo cờ đóng quân trong vùng bao phủ' },
      { key: 'rallyX', label: 'Điểm đóng quân mặc định X (ô, so với tâm nhà)' },
      { key: 'rallyY', label: 'Điểm đóng quân mặc định Y (ô, so với tâm nhà)' },
      { key: 'artifactSlots', label: 'Số ô trang bị cổ vật', hint: '1 – 10' },
      { key: 'artifactSlotUnlocks', label: 'Cấp nhà mở từng ô cổ vật', hint: 'ví dụ 2,4,5,7,8 = ô 1 mở ở cấp 2, ô 2 ở cấp 4…; mặc định chưa mở ô nào' },
      { key: 'statPointValues', label: 'Giá trị 1 điểm cộng', hint: 'hp:20,damage:3,armor:1 — chỉ số nào có trong danh sách thì người chơi được cộng điểm' },
    ],
  },
  troop: {
    type: 'troop',
    label: 'Lính & tướng',
    folder: 'troops',
    icon: '🗡️',
    hasCost: true,
    hasRewards: false,
    note: 'Tướng là một loại lính đặc biệt (Loại đơn vị = general): mạnh hơn, có chiêu thức và hào quang. Nhà sinh ra tướng chỉ sinh đúng 1 đơn vị. Vị trí trang bị = các ô trang bị mà loại lính này mặc được (lính thường: cả đội trong nhà dùng chung bộ trang bị).',
    stats: [
      { key: 'hp', label: 'Máu' },
      { key: 'damage', label: 'Sát thương' },
      { key: 'armor', label: 'Giáp' },
      { key: 'attackRange', label: 'Tầm đánh (ô)' },
      { key: 'attackSpeed', label: 'Tốc độ đánh (lần/giây)' },
      { key: 'moveSpeed', label: 'Tốc độ chạy (ô/giây)' },
      { key: 'auraRadius', label: 'Bán kính hào quang (ô)', hint: 'thường dùng cho tướng' },
      { key: 'auraBonusPct', label: 'Tăng sức mạnh quân xung quanh (%)' },
      { key: 'skillCooldownSec', label: 'Hồi chiêu (giây)' },
    ],
    props: [
      { key: 'unitClass', label: 'Loại đơn vị', hint: 'soldier = lính thường | general = tướng (nhà chỉ sinh 1)' },
      { key: 'role', label: 'Vai trò', hint: 'melee | ranged | tank | support' },
      { key: 'size', label: 'Kích thước (ô)' },
      { key: 'skill', label: 'Tên chiêu thức' },
      { key: 'equipSlots', label: 'Vị trí trang bị', hint: 'weapon,armor,helmet,boots,ring' },
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
  terrain: {
    type: 'terrain',
    label: 'Địa hình',
    folder: 'terrains',
    icon: '🟩',
    hasCost: false,
    hasRewards: false,
    note: 'Mỗi loại địa hình là 1 ô vuông trên bản đồ. Mỗi “cấp” ở đây là một biến thể ảnh (cỏ 1, cỏ 2…) để bản đồ không bị lặp; game chọn ngẫu nhiên giữa các biến thể.',
    stats: [
      { key: 'moveCost', label: 'Độ khó di chuyển', hint: '1 = bình thường, 2 = chậm gấp đôi' },
      { key: 'spawnWeight', label: 'Tỉ lệ xuất hiện khi sinh bản đồ' },
    ],
    props: [
      { key: 'walkable', label: 'Đi được', hint: 'true | false' },
      { key: 'buildable', label: 'Xây được', hint: 'true | false' },
      { key: 'layer', label: 'Lớp', hint: 'ground | water | road' },
      { key: 'color', label: 'Màu đại diện', hint: '#6cc24a' },
    ],
  },
  decoration: {
    type: 'decoration',
    label: 'Cây & vật trang trí',
    folder: 'decorations',
    icon: '🌲',
    hasCost: false,
    hasRewards: false,
    note: 'Cây, đá, bụi, hàng rào, vật thể trên bản đồ. Mỗi “cấp” là một biến thể hoặc giai đoạn (cây non → cây lớn). Vật cản có thể chặt / phá để lấy tài nguyên.',
    stats: [
      { key: 'hp', label: 'Độ bền (khi chặt / phá)' },
      { key: 'clearTimeSec', label: 'Thời gian dọn (giây)' },
      { key: 'dropAmount', label: 'Lượng tài nguyên rơi ra' },
      { key: 'spawnWeight', label: 'Tỉ lệ xuất hiện khi sinh bản đồ' },
    ],
    props: [
      { key: 'category', label: 'Nhóm', hint: 'tree | rock | bush | flower | fence | prop' },
      { key: 'size', label: 'Kích thước (ô)' },
      { key: 'blocking', label: 'Chặn đường', hint: 'true | false' },
      { key: 'clearable', label: 'Dọn được', hint: 'true | false' },
      { key: 'drops', label: 'Tài nguyên rơi ra', hint: 'key tài nguyên, ví dụ wood' },
      { key: 'placeOn', label: 'Đặt trên địa hình', hint: 'grass, sand…' },
    ],
  },
  artifact: {
    type: 'artifact',
    label: 'Cổ vật',
    folder: 'artifacts',
    icon: '🏺',
    hasCost: true,
    hasRewards: false,
    hasEffects: true,
    note: 'Cổ vật trang bị vào ô cổ vật của nhà lính để tăng chỉ số cho lính của nhà đó. Chỉ số ở đây là phần CỘNG THÊM: số thường = cộng thẳng, đuôi Pct = cộng theo %. Chi phí theo cấp = chi phí nâng cổ vật lên cấp đó.',
    stats: [
      { key: 'hp', label: 'Máu +' },
      { key: 'hpPct', label: 'Máu +%' },
      { key: 'damage', label: 'Sát thương +' },
      { key: 'damagePct', label: 'Sát thương +%' },
      { key: 'armor', label: 'Giáp +' },
      { key: 'attackSpeedPct', label: 'Tốc độ đánh +%' },
      { key: 'moveSpeedPct', label: 'Tốc độ chạy +%' },
      { key: 'attackRange', label: 'Tầm đánh + (ô)' },
      { key: 'trainTimePct', label: 'Giảm thời gian tạo lính %' },
      { key: 'trainCostPct', label: 'Giảm chi phí tạo lính %' },
    ],
    props: [
      { key: 'rarity', label: 'Độ hiếm', hint: 'common | rare | epic | legendary' },
      { key: 'appliesTo', label: 'Áp dụng cho', hint: 'all | melee | ranged | tank | hoặc key lính, ví dụ archer' },
      { key: 'unique', label: 'Chỉ trang bị 1 cái mỗi nhà', hint: 'true | false' },
    ],
  },
  equipment: {
    type: 'equipment',
    label: 'Trang bị',
    folder: 'equipments',
    icon: '🛡️',
    hasCost: true,
    hasRewards: false,
    hasEffects: true,
    note: 'Trang bị mặc cho tướng và lính (tướng mặc riêng; lính thường thì cả đội trong một nhà dùng chung), mỗi món chiếm 1 vị trí: vũ khí, giáp, mũ, giày, nhẫn. Chỉ số = phần cộng thêm (đuôi Pct = %). Cấp = cấp cường hoá của món đồ, chi phí theo cấp = chi phí cường hoá.',
    stats: [
      { key: 'hp', label: 'Máu +' },
      { key: 'hpPct', label: 'Máu +%' },
      { key: 'damage', label: 'Sát thương +' },
      { key: 'damagePct', label: 'Sát thương +%' },
      { key: 'armor', label: 'Giáp +' },
      { key: 'attackSpeedPct', label: 'Tốc độ đánh +%' },
      { key: 'moveSpeedPct', label: 'Tốc độ chạy +%' },
      { key: 'attackRange', label: 'Tầm đánh + (ô)' },
      { key: 'skillCooldownPct', label: 'Giảm hồi chiêu %' },
      { key: 'auraBonusPct', label: 'Tăng hào quang tướng %' },
    ],
    props: [
      { key: 'slot', label: 'Vị trí', hint: 'weapon | armor | helmet | boots | ring' },
      { key: 'equipFor', label: 'Dành cho', hint: 'both | general | soldier' },
      { key: 'role', label: 'Chỉ cho vai trò', hint: 'all | melee | ranged | tank' },
      { key: 'rarity', label: 'Độ hiếm', hint: 'common | rare | epic | legendary' },
      { key: 'setName', label: 'Thuộc bộ', hint: 'tên bộ trang bị (nếu có)' },
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
      if (l?.troopStats && typeof l.troopStats === 'object') lv.troopStats = numMap(l.troopStats);
      if (l?.trainCost && typeof l.trainCost === 'object') lv.trainCost = numMap(l.trainCost);
      if (TYPE_DEFS[type as EntityTypeKey].hasEffects) {
        lv.effects = (Array.isArray(l?.effects) ? l.effects : [])
          .filter((x: any) => x && x.type)
          .map((x: any) => ({
            type: String(x.type),
            value: Number(x.value) || 0,
            chance: Math.min(1, Math.max(0, Number(x.chance ?? 1))),
            durationSec: Number(x.durationSec) || 0,
            radius: Number(x.radius) || 0,
            ...(x.note ? { note: String(x.note) } : {}),
          }));
      }
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
