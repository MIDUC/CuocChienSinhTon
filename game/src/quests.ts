import { get } from './data';
import type { GameScene } from './GameScene';

/**
 * Nhiệm vụ / thành tựu: hoàn thành để nhận thưởng (tài nguyên, ngọc, rương).
 * Phần thưởng dạng "resource:gold" / "chest:silver_chest".
 */
export interface Quest {
  id: string;
  text: string;
  target: number;
  progress: (g: GameScene) => number;
  reward: Record<string, number>;
}

const count = (g: GameScene, key: string, minLevel = 1) => g.s.buildings.filter((b) => b.key === key && b.level >= minLevel && !(b.buildLeft > 0 && !b.upgrading)).length;
const troops = (g: GameScene) => g.units.filter((u) => u.team === 'ally' && u.alive).length;

export const QUESTS: Quest[] = [
  { id: 'wall10', text: 'Xây 10 đoạn tường thành', target: 10, progress: (g) => count(g, 'wall'), reward: { 'resource:stone': 300 } },
  { id: 'tower1', text: 'Xây 1 Tháp cung', target: 1, progress: (g) => count(g, 'archer_tower'), reward: { 'resource:gold': 200 } },
  { id: 'range1', text: 'Xây Trường bắn cung', target: 1, progress: (g) => count(g, 'archery_range'), reward: { 'resource:wood': 300 } },
  { id: 'gate1', text: 'Xây Cổng thành', target: 1, progress: (g) => count(g, 'gate'), reward: { 'resource:gold': 150, 'resource:stone': 150 } },
  { id: 'hall1', text: 'Xây Nhà tướng, chiêu mộ tướng', target: 1, progress: (g) => count(g, 'general_hall'), reward: { 'resource:gem': 10 } },
  { id: 'eco4', text: 'Có 4 công trình kinh tế', target: 4, progress: (g) => g.s.buildings.filter((b) => ['economy'].includes(get('building', b.key)?.props.category)).length, reward: { 'resource:gold': 300 } },
  { id: 'th2', text: 'Nâng Thành chính lên cấp 2', target: 2, progress: (g) => g.townHall()?.s.level ?? 1, reward: { 'chest:silver_chest': 1 } },
  { id: 'th3', text: 'Nâng Thành chính lên cấp 3', target: 3, progress: (g) => g.townHall()?.s.level ?? 1, reward: { 'chest:golden_chest': 1, 'resource:gem': 20 } },
  { id: 'army10', text: 'Có 10 lính cùng lúc', target: 10, progress: troops, reward: { 'resource:food': 400 } },
  { id: 'army25', text: 'Có 25 lính cùng lúc', target: 25, progress: troops, reward: { 'resource:gem': 15 } },
  { id: 'w3', text: 'Vượt qua đợt 3', target: 3, progress: (g) => g.s.wave, reward: { 'resource:gold': 300, 'resource:gem': 5 } },
  { id: 'w5', text: 'Vượt qua đợt 5 (đánh bại trùm)', target: 5, progress: (g) => g.s.wave, reward: { 'chest:silver_chest': 1 } },
  { id: 'w10', text: 'Vượt qua đợt 10', target: 10, progress: (g) => g.s.wave, reward: { 'chest:golden_chest': 1, 'resource:gem': 20 } },
  { id: 'w15', text: 'Vượt qua đợt 15', target: 15, progress: (g) => g.s.wave, reward: { 'resource:gem': 40 } },
  { id: 'w20', text: 'Vượt qua đợt 20 — Huyền thoại thủ thành', target: 20, progress: (g) => g.s.wave, reward: { 'resource:gem': 80, 'chest:golden_chest': 1 } },
  { id: 'k50', text: 'Hạ 50 quái', target: 50, progress: (g) => g.s.stats.kills, reward: { 'resource:gold': 250 } },
  { id: 'k300', text: 'Hạ 300 quái', target: 300, progress: (g) => g.s.stats.kills, reward: { 'resource:gem': 15 } },
  { id: 'k1000', text: 'Hạ 1000 quái', target: 1000, progress: (g) => g.s.stats.kills, reward: { 'resource:gem': 40 } },
  { id: 'c3', text: 'Mở 3 rương', target: 3, progress: (g) => g.s.stats.chestsOpened, reward: { 'resource:gem': 5 } },
  { id: 'c10', text: 'Mở 10 rương', target: 10, progress: (g) => g.s.stats.chestsOpened, reward: { 'chest:silver_chest': 1 } },
  { id: 'clear10', text: 'Dọn 10 cây hoặc đá', target: 10, progress: (g) => g.s.stats.cleared, reward: { 'resource:wood': 200, 'resource:stone': 100 } },
  { id: 'item3', text: 'Sở hữu 3 cổ vật / trang bị', target: 3, progress: (g) => g.s.items.length, reward: { 'resource:gem': 10 } },
  { id: 'spell5', text: 'Dùng phép 5 lần', target: 5, progress: (g) => g.s.stats.spellsCast, reward: { 'resource:gem': 5 } },
];

export function claimable(g: GameScene) {
  return QUESTS.filter((q) => !g.s.quests.includes(q.id) && q.progress(g) >= q.target);
}

export function rewardText(r: Record<string, number>) {
  return Object.entries(r)
    .map(([k, v]) => {
      const [kind, key] = k.split(':');
      const name = get(kind, key)?.name ?? key;
      return `${v} ${name}`;
    })
    .join(', ');
}
