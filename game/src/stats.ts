import { Effect, Entity, get, lvl, parseKV, parseList } from './data';
import { BuildingSave, Item } from './state';

/**
 * Chỉ số chiến đấu cuối cùng của lính / tướng trong một nhà:
 *   chỉ số theo cấp nhà (levels[].troopStats, trống thì lấy mục Lính ở troopLevel)
 * + trang bị (cả đội dùng chung) + cổ vật trong ô của nhà + điểm cộng × giá trị mỗi điểm.
 * Chỉ số đuôi Pct cộng theo %.
 */
export interface CombatStats {
  hp: number;
  damage: number;
  armor: number;
  attackRange: number;
  attackSpeed: number;
  moveSpeed: number;
  auraRadius: number;
  auraBonusPct: number;
  skillCooldownSec: number;
  wallRangeBonus: number;
  wallDamagePct: number;
  effects: Effect[];
}

export function troopKeyOf(b: BuildingSave, be: Entity): string | undefined {
  return b.general || be.props.spawns;
}

export function isGeneralHall(be: Entity) {
  const t = be.props.spawns ? get('troop', be.props.spawns) : undefined;
  return t?.props.unitClass === 'general' || be.props.rallyZone === 'territory';
}

/** Tổng điểm cộng nhận được tới cấp hiện tại */
export function totalStatPoints(be: Entity, level: number) {
  let s = 0;
  for (let l = 1; l <= level; l++) s += Number(lvl(be, l).stats.statPoints ?? 0);
  return s;
}

export function slotUnlockLevels(be: Entity): number[] {
  const n = Number(be.props.artifactSlots ?? 0);
  const list = parseList(be.props.artifactSlotUnlocks);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(list[i] ?? i + 1);
  return out;
}

export function roleMatches(applies: string | undefined, role: string | undefined) {
  if (!applies || applies === 'all') return true;
  if (applies === 'melee') return role === 'melee' || role === 'tank';
  return applies === role;
}

export function itemEntity(it: Item) {
  return get(it.type, it.key);
}

export function computeStats(b: BuildingSave, items: Item[]): CombatStats | null {
  const be = get('building', b.key);
  if (!be) return null;
  const tk = troopKeyOf(b, be);
  const te = tk ? get('troop', tk) : undefined;
  if (!te) return null;
  const bl = lvl(be, b.level);
  const troopLevel = Number(bl.stats.troopLevel ?? 1);
  const base: Record<string, number> = { ...lvl(te, troopLevel).stats };
  // nhà tướng chọn tướng khác loại mặc định: dùng chỉ số của tướng, không ghi đè bằng troopStats của nhà
  const useHouse = !b.general || b.general === be.props.spawns;
  if (useHouse && bl.troopStats) for (const [k, v] of Object.entries(bl.troopStats)) if (v !== undefined && v !== null && !isNaN(Number(v))) base[k] = Number(v);
  const flat: Record<string, number> = {};
  const pct: Record<string, number> = {};
  const effects: Effect[] = [];
  const add = (stats: Record<string, number>) => {
    for (const [k, v] of Object.entries(stats)) {
      if (k.endsWith('Pct') && !(k in base)) pct[k.slice(0, -3)] = (pct[k.slice(0, -3)] ?? 0) + Number(v);
      else flat[k] = (flat[k] ?? 0) + Number(v);
    }
  };
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const id of Object.values(b.equipment ?? {})) {
    const it = id != null ? byId.get(id) : undefined;
    const ie = it && itemEntity(it);
    if (!it || !ie) continue;
    const l = lvl(ie, it.level);
    add(l.stats);
    effects.push(...(l.effects ?? []));
  }
  const unlocks = slotUnlockLevels(be);
  (b.artifacts ?? []).forEach((id, i) => {
    if (id == null || (unlocks[i] ?? 99) > b.level) return;
    const it = byId.get(id);
    const ie = it && itemEntity(it);
    if (!it || !ie || !roleMatches(ie.props.appliesTo, te.props.role)) return;
    const l = lvl(ie, it.level);
    add(l.stats);
    effects.push(...(l.effects ?? []));
  });
  const values = parseKV(be.props.statPointValues);
  for (const [k, n] of Object.entries(b.statAlloc ?? {})) if (values[k]) add({ [k]: values[k] * n });

  const fin = (k: string, def = 0) => {
    const v = (base[k] ?? def) + (flat[k] ?? 0);
    return v * (1 + (pct[k] ?? 0) / 100);
  };
  return {
    hp: Math.round(fin('hp', 100)),
    damage: fin('damage', 10),
    armor: fin('armor'),
    attackRange: fin('attackRange', 1),
    attackSpeed: Math.max(0.1, fin('attackSpeed', 1)),
    moveSpeed: Math.max(0.3, fin('moveSpeed', 1.5)),
    auraRadius: fin('auraRadius'),
    auraBonusPct: fin('auraBonusPct'),
    skillCooldownSec: Math.max(3, fin('skillCooldownSec', 15) * (1 - (pct.skillCooldown ?? 0) / 100)),
    wallRangeBonus: fin('wallRangeBonus'),
    wallDamagePct: fin('wallDamagePct'),
    effects,
  };
}

/** Thời gian tạo 1 lính (giây, chưa nhân hệ số) có tính giảm % từ cổ vật */
export function trainTime(b: BuildingSave, items: Item[]) {
  const be = get('building', b.key)!;
  let t = Number(lvl(be, b.level).stats.trainTimeSec ?? 20);
  const byId = new Map(items.map((i) => [i.id, i]));
  const unlocks = slotUnlockLevels(be);
  let red = 0;
  (b.artifacts ?? []).forEach((id, i) => {
    if (id == null || (unlocks[i] ?? 99) > b.level) return;
    const it = byId.get(id);
    const ie = it && itemEntity(it);
    if (ie) red += Number(lvl(ie, it!.level).stats.trainTimePct ?? 0);
  });
  return t * Math.max(0.2, 1 - red / 100);
}

export function equipSlotsOf(b: BuildingSave): string[] {
  const be = get('building', b.key);
  const tk = be && troopKeyOf(b, be);
  const te = tk ? get('troop', tk) : undefined;
  return String(te?.props.equipSlots ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function canEquip(item: Item, b: BuildingSave) {
  const ie = itemEntity(item);
  const be = get('building', b.key);
  const tk = be && troopKeyOf(b, be);
  const te = tk ? get('troop', tk) : undefined;
  if (!ie || !te) return false;
  const cls = te.props.unitClass === 'general' ? 'general' : 'soldier';
  const ef = ie.props.equipFor ?? 'both';
  if (ef !== 'both' && ef !== cls) return false;
  if (!roleMatches(ie.props.role === 'all' ? undefined : ie.props.role, te.props.role)) return false;
  return equipSlotsOf(b).includes(ie.props.slot);
}
