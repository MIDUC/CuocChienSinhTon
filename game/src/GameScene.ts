import Phaser from 'phaser';
import { garrisonSpots, clampRally } from '../../admin/src/formation';
import { buildingFrame, buildingTexture, decoTexture, hasUploaded, preloadUploaded, terrainTexture, unitTexture, uploadedKey, UNIT_H, UNIT_W } from './art';
import { all, Effect, Entity, get, lvl, maxLevel } from './data';
import { iso, grid, TW, TH, depthOf, dist } from './iso';
import { newState } from './mapgen';
import { astar, Cell } from './path';
import { BuildingSave, canAfford, CFG, clearSave, loadGame, loadWaveBackup, pay, resourceCap, SaveState, saveGame, saveWaveBackup, Item } from './state';
import { canEquip, CombatStats, computeStats, isGeneralHall, slotUnlockLevels, totalStatPoints, trainTime, troopKeyOf } from './stats';
import type { UI } from './ui';
import { play } from './sfx';
import { QUESTS } from './quests';

export interface SpellDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cost: Record<string, number>;
  cd: number;
  radius?: number;
  key: string;
}

/** Phép của người chơi (dùng trong trận) */
export interface WaveMod {
  id: string;
  name: string;
  icon: string;
  desc: string;
  hp?: number;
  dmg?: number;
  armor?: number;
  speed?: number;
  count?: number;
  gold?: number;
  tint?: number;
}

/** Biến cố đợt: từ đợt 4, khoảng 1/3 số đợt có thêm một biến cố (cố định theo bản đồ) */
export const WAVE_MODS: WaveMod[] = [
  { id: 'blood', name: 'Trăng máu', icon: '🌕', desc: 'Quái +25% sát thương, vàng rơi ×1.5', dmg: 1.25, gold: 1.5, tint: 0x8b0000 },
  { id: 'iron', name: 'Giáp sắt', icon: '⛓️', desc: 'Quái +4 giáp — cần sát thương lớn', armor: 4 },
  { id: 'swarm', name: 'Bầy đàn', icon: '🐜', desc: 'Số quái ×1.5 nhưng máu −25%', count: 1.5, hp: 0.75 },
  { id: 'haste', name: 'Cuồng phong', icon: '💨', desc: 'Quái chạy nhanh hơn 30%', speed: 1.3 },
  { id: 'night', name: 'Đêm đen', icon: '🌑', desc: 'Quái +20% máu, rương thưởng tăng 1 cấp', hp: 1.2, tint: 0x0a1030 },
];

export const SPELLS: SpellDef[] = [
  { id: 'meteor', name: 'Mưa thiên thạch', icon: '☄️', desc: 'Gây 300 sát thương trong bán kính 2 ô và làm choáng 1.5 giây', cost: { gem: 3 }, cd: 40, radius: 2, key: 'Q' },
  { id: 'freeze', name: 'Băng giá', icon: '❄️', desc: 'Làm chậm 60% mọi quái trong bán kính 3 ô trong 5 giây', cost: { wood: 150 }, cd: 35, radius: 3, key: 'W' },
  { id: 'heal', name: 'Hồi sinh lực', icon: '💚', desc: 'Hồi 60% máu cho toàn bộ lính, tướng và 25% máu công trình', cost: { food: 150 }, cd: 45, key: 'E' },
  { id: 'warcry', name: 'Hiệu lệnh xung phong', icon: '📯', desc: 'Toàn quân +35% sát thương và tốc chạy trong 12 giây', cost: { gold: 150 }, cd: 60, key: 'F' },
];

/* ================= Đơn vị (lính, tướng, quái) ================= */

let UID = 1;

export class Unit {
  id = UID++;
  alive = true;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  cd = Math.random() * 0.5;
  skillCd = 3;
  path: Cell[] | null = null;
  pathKey = '';
  pathAt = -99;
  target: Unit | null = null;
  targetB: BRT | null = null;
  blocker: Unit | null = null;
  slowPct = 0;
  slowUntil = 0;
  stunUntil = 0;
  dots: { dps: number; until: number }[] = [];
  abVal = 0;
  abUntil = 0;
  shield = 0;
  revived = false;
  auraMul = 1;
  onWall = false;
  spot = 0;
  goalId = 0;
  sprite!: Phaser.GameObjects.Image;
  bar!: Phaser.GameObjects.Graphics;
  lastHit = -99;
  elite = false;
  constructor(
    public team: 'ally' | 'enemy',
    public ent: Entity,
    public level: number,
    public st: CombatStats,
    x: number,
    y: number,
    public home: BRT | null = null,
  ) {
    this.hp = st.hp;
    this.maxHp = st.hp;
    this.x = x;
    this.y = y;
  }
  get role(): string {
    return this.ent.props.role;
  }
  get flying() {
    return this.ent.props.pathMode === 'fly' || this.role === 'flying';
  }
  get melee() {
    return this.role !== 'ranged' && this.st.attackRange <= 2;
  }
  get general() {
    return this.ent.props.unitClass === 'general';
  }
  get size() {
    return Number(this.ent.props.size ?? 1);
  }
}

/** Công trình đang chạy trên bản đồ */
export interface BRT {
  s: BuildingSave;
  e: Entity;
  sprite: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
  hp: number;
  maxHp: number;
  soldiers: Unit[];
  cd: number;
  bubble?: Phaser.GameObjects.Text;
  flag?: Phaser.GameObjects.Text;
  stats: CombatStats | null;
}

type Mode =
  | { kind: 'none' }
  | { kind: 'build'; key: string; w: number; h: number }
  | { kind: 'rally'; id: number }
  | { kind: 'spell'; id: string }
  | { kind: 'move'; id: number; w: number; h: number };

const ENEMY_TINT_HIT = 0xff8080;

export class GameScene extends Phaser.Scene {
  s!: SaveState;
  n = CFG.MAP;
  ui!: UI;
  bld = new Map<number, BRT>();
  units: Unit[] = [];
  occ!: Int32Array;
  decoMap = new Map<number, { d: SaveState['decorations'][number]; img: Phaser.GameObjects.Image }>();
  gridVer = 1;
  phase: 'build' | 'battle' | 'over' = 'build';
  spawnQueue: { key: string; level: number; sp: number; hpMul: number }[] = [];
  spawnT = 0;
  mode: Mode = { kind: 'none' };
  selected: { kind: 'building'; id: number } | { kind: 'deco'; cell: number } | { kind: 'unit'; u: Unit } | null = null;
  spellCd: Record<string, number> = {};
  warcryUntil = 0;
  waveStat = { kills: 0, lost: 0, gold: 0 };
  curMod: WaveMod | null = null;
  shots: { g: Phaser.GameObjects.Graphics; sx: number; sy: number; t: Unit; age: number; dur: number; onHit: () => void; done?: boolean }[] = [];
  pending: { at: number; fn: () => void }[] = [];
  tintRect?: Phaser.GameObjects.Rectangle;
  speed = 1;
  t = 0;
  hover = { x: -1, y: -1 };
  ghost?: Phaser.GameObjects.Image;
  ghostG!: Phaser.GameObjects.Graphics;
  coverG!: Phaser.GameObjects.Graphics;
  fxG!: Phaser.GameObjects.Graphics;
  terrainLayer!: Phaser.GameObjects.Container;
  spawnMarks: Phaser.GameObjects.GameObject[] = [];
  spawnGfx: Phaser.GameObjects.Graphics[] = [];
  saveT = 0;
  uiT = 0;
  dragWall = false;
  lastWallCell = -1;
  waveKills = 0;

  constructor() {
    super('game');
  }

  preload() {
    for (const t of ['building', 'troop', 'monster', 'decoration', 'terrain']) preloadUploaded(this, all(t));
    this.load.on('loaderror', () => {
      /* ảnh upload lỗi -> dùng ảnh tạm */
    });
  }

  create() {
    const loaded = loadGame();
    this.s = loaded ?? newState();
    this.n = Math.round(Math.sqrt(this.s.terrain.length));
    const away = loaded ? this.offlineProgress() : '';
    this.input.mouse?.disableContextMenu();
    this.terrainLayer = this.add.container(0, 0).setDepth(-100000);
    this.coverG = this.add.graphics().setDepth(-50000);
    this.ghostG = this.add.graphics().setDepth(-40000);
    this.fxG = this.add.graphics().setDepth(900000);
    this.buildWorld();
    this.fitCamera();
    this.scale.on('resize', () => this.fitCamera());
    this.setupInput();
    this.ui.bind(this);
    this.ui.refresh(true);
    if (!loaded) this.ui.difficultyPicker();
    else this.ui.toast(away || 'Đã tải lại thành của bạn.', 6000);
  }

  /** Thời gian vắng mặt: mỏ vẫn sản xuất, rương vẫn mở khoá, công trình vẫn xây (tối đa 8 giờ) */
  offlineProgress(): string {
    const sec = Math.min(8 * 3600, (Date.now() - (this.s.savedAt ?? Date.now())) / 1000);
    if (sec < 30) return '';
    const got: Record<string, number> = {};
    for (const b of this.s.buildings) {
      const e = get('building', b.key);
      if (!e || b.ruined) continue;
      const l = lvl(e, b.level).stats;
      if (b.buildLeft > 0) b.buildLeft = Math.max(0.5, b.buildLeft - sec);
      if (e.props.produces && !(b.buildLeft > 0 && !b.upgrading)) {
        const before = b.stored ?? 0;
        b.stored = Math.min(Number(l.capacity ?? 1000), before + (Number(l.production ?? 0) / 60) * sec);
        got[e.props.produces] = (got[e.props.produces] ?? 0) + Math.floor(b.stored - before);
      }
    }
    const c = this.s.chests.find((x) => x.unlockLeft != null && x.unlockLeft > 0);
    if (c) c.unlockLeft = Math.max(0, c.unlockLeft! - sec);
    const parts = Object.entries(got)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v} ${get('resource', k)?.name ?? k}`);
    const mins = Math.round(sec / 60);
    return `Bạn vắng mặt ${mins >= 60 ? `${Math.floor(mins / 60)} giờ ${mins % 60} phút` : `${mins} phút`}.${parts.length ? ` Các mỏ đã sản xuất: ${parts.join(', ')} — bấm vào để thu hoạch.` : ''}`;
  }

  /* ================= Dựng thế giới ================= */

  buildWorld() {
    for (const b of this.bld.values()) this.destroyBRT(b);
    this.bld.clear();
    for (const u of this.units) this.destroyUnit(u);
    this.units = [];
    this.terrainLayer.removeAll(true);
    for (const v of this.decoMap.values()) v.img.destroy();
    this.decoMap.clear();
    this.spawnMarks.forEach((m) => m.destroy());
    this.spawnMarks = [];
    this.spawnGfx = [];
    const n = this.n;
    this.occ = new Int32Array(n * n);
    // địa hình
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const k = this.s.terrain[y * n + x];
        const e = get('terrain', k) ?? all('terrain')[0];
        if (!e) continue;
        const variant = ((x * 7 + y * 13) % 5 === 0 ? 1 : 0) as number;
        const p = iso(x, y);
        let img: Phaser.GameObjects.Image;
        if (hasUploaded(this, e, 1)) {
          img = this.add.image(p.x, p.y, uploadedKey('terrain', e.key, 1)).setOrigin(0.5, 0);
          img.setDisplaySize(TW, (TW * img.height) / img.width);
        } else img = this.add.image(p.x, p.y, terrainTexture(this, e, variant)).setOrigin(0.5, 0);
        this.terrainLayer.add(img);
      }
    // cổng quái
    for (const sp of this.s.spawns) {
      const p = iso(sp.x + 0.5, sp.y + 0.5);
      const g = this.add.graphics().setDepth(depthOf(sp.x, sp.y) - 1);
      g.fillStyle(0x7b1fa2, 0.55);
      g.fillEllipse(p.x, p.y, 54, 27);
      g.lineStyle(3, 0xff1744, 0.9);
      g.strokeEllipse(p.x, p.y, 54, 27);
      const tx = this.add.text(p.x, p.y - 26, '☠', { fontSize: '22px', color: '#ff5252', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(800000);
      this.tweens.add({ targets: g, scaleX: 1.08, scaleY: 1.08, yoyo: true, repeat: -1, duration: 900 });
      g.setPosition(p.x, p.y);
      g.clear();
      g.fillStyle(0x7b1fa2, 0.55);
      g.fillEllipse(0, 0, 54, 27);
      g.lineStyle(3, 0xff1744, 0.9);
      g.strokeEllipse(0, 0, 54, 27);
      this.spawnMarks.push(g, tx);
      this.spawnGfx.push(g);
      (g as any).label = tx;
    }
    this.updateSpawnMarks();
    for (const d of this.s.decorations) this.addDeco(d);
    for (const b of this.s.buildings) this.addBRT(b);
    for (const b of this.bld.values()) this.spawnGarrison(b);
  }

  /** Cổng quái sẽ hoạt động ở đợt tới sáng rõ, cổng chưa hoạt động mờ đi */
  activeSpawns(n = this.s.wave + 1) {
    return Math.min(this.s.spawns.length, 1 + Math.floor((n - 1) / 3));
  }

  updateSpawnMarks() {
    const k = this.activeSpawns();
    this.spawnGfx.forEach((g, i) => {
      g.setAlpha(i < k ? 1 : 0.25);
      (g as any).label?.setAlpha(i < k ? 1 : 0.3);
    });
  }

  fitCamera() {
    const cam = this.cameras.main;
    const n = this.n;
    const W = n * TW + 40;
    const H = n * TH + 120;
    const vw = this.scale.width;
    const vh = this.scale.height;
    const topPad = 56;
    const botPad = 96;
    const zoom = Math.min(vw / W, (vh - topPad - botPad) / H);
    cam.setZoom(zoom);
    cam.centerOn(0, (n * TH) / 2 - 30 + (botPad - topPad) / 2 / zoom);
  }

  addDeco(d: SaveState['decorations'][number]) {
    const e = get('decoration', d.key);
    if (!e) return;
    const p = iso(d.x + 0.5, d.y + 0.5);
    let img: Phaser.GameObjects.Image;
    if (hasUploaded(this, e, d.level)) {
      img = this.add.image(p.x, p.y + TH / 2, uploadedKey('decoration', e.key, d.level)).setOrigin(0.5, 0.93);
      img.setScale(TW / img.width);
    } else img = this.add.image(p.x, p.y + TH / 2, decoTexture(this, e, d.level)).setOrigin(0.5, 1);
    img.setDepth(depthOf(d.x + 0.5, d.y + 0.5));
    this.decoMap.set(d.y * this.n + d.x, { d, img });
  }

  addBRT(s: BuildingSave) {
    const e = get('building', s.key)!;
    const sprite = this.add.image(0, 0, '__DEFAULT');
    const bar = this.add.graphics();
    const b: BRT = { s, e, sprite, bar, hp: 0, maxHp: 0, soldiers: [], cd: 0, stats: null };
    this.bld.set(s.id, b);
    this.refreshBRT(b, true);
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) this.occ[y * this.n + x] = s.id;
    this.gridVer++;
    return b;
  }

  refreshBRT(b: BRT, fullHp = false) {
    const { s, e } = b;
    const l = lvl(e, s.level);
    const maxHp = Number(l.stats.hp ?? 500);
    if (fullHp || !b.maxHp) b.hp = maxHp;
    else b.hp = Math.min(maxHp, b.hp + Math.max(0, maxHp - b.maxHp));
    b.maxHp = maxHp;
    const top = iso(s.x, s.y);
    if (hasUploaded(this, e, s.level)) {
      const bottom = iso(s.x + s.w, s.y + s.h);
      const left = iso(s.x, s.y + s.h);
      const right = iso(s.x + s.w, s.y);
      b.sprite.setTexture(uploadedKey('building', e.key, s.level));
      b.sprite.setOrigin(0.5, 0.93);
      b.sprite.setPosition((left.x + right.x) / 2, bottom.y);
      b.sprite.setScale((right.x - left.x) / b.sprite.width);
    } else {
      const f = buildingFrame(s.w, s.h);
      b.sprite.setTexture(buildingTexture(this, e, s.level, s.w, s.h));
      b.sprite.setOrigin(f.ox / f.W, f.oy / f.H);
      b.sprite.setPosition(top.x, top.y);
      b.sprite.setScale(1);
    }
    b.sprite.setDepth(depthOf(s.x + s.w - 0.5, s.y + s.h - 0.5) + 2);
    b.bar.setDepth(800000);
    b.stats = e.props.spawns ? computeStats(s, this.s.items) : null;
    this.styleBRT(b);
  }

  styleBRT(b: BRT) {
    const building = b.s.buildLeft > 0 && !b.s.upgrading;
    if (b.s.ruined) b.sprite.setTint(0x555555).setAlpha(0.55);
    else if (building) b.sprite.setTint(0xb0b0b0).setAlpha(0.6);
    else b.sprite.clearTint().setAlpha(1);
  }

  destroyBRT(b: BRT) {
    b.sprite.destroy();
    b.bar.destroy();
    b.bubble?.destroy();
    b.flag?.destroy();
  }

  centerOf(b: BRT) {
    return { x: b.s.x + b.s.w / 2, y: b.s.y + b.s.h / 2 };
  }

  townHall(): BRT | undefined {
    for (const b of this.bld.values()) if (b.e.props.category === 'core') return b;
    return undefined;
  }

  active(b: BRT) {
    return !b.s.ruined && !(b.s.buildLeft > 0 && !b.s.upgrading);
  }

  /* ================= Lính đóng quân ================= */

  maxTroops(b: BRT) {
    return Number(lvl(b.e, b.s.level).stats.troopCount ?? 0);
  }

  /** Vị trí đứng chờ (toạ độ lưới) của từng chỗ trong đội hình */
  spots(b: BRT) {
    const p = b.e.props;
    const count = Math.max(1, this.maxTroops(b));
    const sp = garrisonSpots(count, b.s.w, p.garrisonFormation ?? 'ring', Number(p.garrisonSpacing ?? 1), b.s.rally ?? { x: 0, y: 0 });
    return sp.map((q) => ({ x: Math.max(0.3, Math.min(this.n - 0.3, b.s.x + q.x)), y: Math.max(0.3, Math.min(this.n - 0.3, b.s.y + q.y)) }));
  }

  zoneCenter(b: BRT) {
    const c = this.centerOf(b);
    return { x: c.x + (b.s.rally?.x ?? 0) * (b.e.props.rallyZone === 'territory' ? 1 : 0), y: c.y + (b.s.rally?.y ?? 0) * (b.e.props.rallyZone === 'territory' ? 1 : 0) };
  }

  coverRadius(b: BRT) {
    return Number(lvl(b.e, b.s.level).stats.coverRadius ?? 0);
  }

  territoryRadius() {
    const th = this.townHall();
    return CFG.TERRITORY_BASE + (th ? (th.s.level - 1) * 2 : 0);
  }

  spawnGarrison(b: BRT) {
    if (!b.e.props.spawns || !this.active(b) && !b.s.upgrading) return;
    const tk = troopKeyOf(b.s, b.e);
    const te = tk ? get('troop', tk) : undefined;
    if (!te || !b.stats) return;
    const spots = this.spots(b);
    const used = new Set(b.soldiers.filter((u) => u.alive).map((u) => u.spot));
    while (b.soldiers.filter((u) => u.alive).length < b.s.troops) {
      let idx = 0;
      while (used.has(idx)) idx++;
      used.add(idx);
      const spot = spots[idx % spots.length];
      const hpList = b.s.troopHp ?? [];
      const u = this.addUnit('ally', te, Number(lvl(b.e, b.s.level).stats.troopLevel ?? 1), b.stats, spot.x, spot.y, b);
      const k = b.soldiers.filter((x) => x.alive).length;
      if (hpList[k] && hpList[k] > 0) u.hp = Math.min(u.maxHp, hpList[k]);
      u.spot = idx;
      b.soldiers.push(u);
      this.applyStartShield(u);
    }
    b.soldiers = b.soldiers.filter((u) => u.alive);
  }

  /** Lính mới tạo xong: đi từ cửa nhà ra chỗ đứng */
  addTrainedSoldier(b: BRT) {
    const tk = troopKeyOf(b.s, b.e);
    const te = tk ? get('troop', tk) : undefined;
    if (!te || !b.stats) return;
    const used = new Set(b.soldiers.map((u) => u.spot));
    let idx = 0;
    while (used.has(idx)) idx++;
    const door = { x: b.s.x + b.s.w / 2, y: b.s.y + b.s.h + 0.3 };
    const u = this.addUnit('ally', te, Number(lvl(b.e, b.s.level).stats.troopLevel ?? 1), b.stats, door.x, door.y, b);
    u.spot = idx;
    b.soldiers.push(u);
    this.floatText(door.x, door.y, `+1 ${te.name}`, '#7CFC00');
  }

  applyStartShield(u: Unit) {
    for (const ef of u.st.effects) if (ef.type === 'shield') u.shield = Math.max(u.shield, ef.value);
  }

  /** Chỉ số thay đổi (nâng cấp, trang bị, cổ vật, điểm cộng) -> cập nhật lính đang sống */
  restat(b: BRT) {
    b.stats = b.e.props.spawns ? computeStats(b.s, this.s.items) : null;
    if (!b.stats) return;
    const tk = troopKeyOf(b.s, b.e);
    const te = tk ? get('troop', tk) : undefined;
    for (const u of b.soldiers) {
      if (te && u.ent.key !== te.key) {
        u.ent = te;
      }
      const ratio = u.hp / u.maxHp;
      u.st = b.stats;
      u.maxHp = b.stats.hp;
      u.hp = Math.max(1, Math.round(ratio * u.maxHp));
      u.level = Number(lvl(b.e, b.s.level).stats.troopLevel ?? 1);
      u.sprite.setTexture(this.unitTex(u));
    }
  }

  unitTex(u: Unit) {
    if (hasUploaded(this, u.ent, u.level)) return uploadedKey(u.ent.type, u.ent.key, u.level);
    return unitTexture(this, u.ent, u.level, u.team);
  }

  addUnit(team: 'ally' | 'enemy', e: Entity, level: number, st: CombatStats, x: number, y: number, home: BRT | null = null) {
    const u = new Unit(team, e, level, st, x, y, home);
    const key = this.unitTex(u);
    u.sprite = this.add.image(0, 0, key).setOrigin(0.5, (UNIT_H - 8) / UNIT_H);
    if (key.startsWith('img:')) {
      u.sprite.setOrigin(0.5, 0.92);
      u.sprite.setScale((UNIT_W * (u.size > 1 ? 1.5 : 1)) / u.sprite.width);
    } else if (u.size > 1) u.sprite.setScale(1.45);
    else if (u.general) u.sprite.setScale(1.15);
    u.bar = this.add.graphics().setDepth(800001);
    this.units.push(u);
    this.placeUnit(u);
    return u;
  }

  destroyUnit(u: Unit) {
    u.sprite.destroy();
    u.bar.destroy();
  }

  placeUnit(u: Unit) {
    const p = iso(u.x, u.y);
    const lift = u.flying ? 18 : u.onWall ? 22 : 0;
    u.sprite.setPosition(p.x, p.y - lift);
    u.sprite.setDepth(depthOf(u.x, u.y) + (u.flying ? 5000 : 3) + (u.onWall ? 12 : 0));
    u.bar.clear();
    if (u.hp < u.maxHp || u.shield > 0) {
      const w = u.general || u.size > 1 ? 30 : 20;
      const y = p.y - lift - (u.size > 1 ? 72 : u.general ? 58 : 50);
      u.bar.fillStyle(0x000000, 0.6).fillRect(p.x - w / 2 - 1, y - 1, w + 2, 5);
      u.bar.fillStyle(u.team === 'ally' ? 0x4caf50 : 0xe53935, 1).fillRect(p.x - w / 2, y, (w * Math.max(0, u.hp)) / u.maxHp, 3);
      if (u.shield > 0) u.bar.fillStyle(0x80d8ff, 1).fillRect(p.x - w / 2, y - 3, Math.min(w, (w * u.shield) / u.maxHp), 2);
    }
  }

  /* ================= Ô lưới & đường đi ================= */

  inMap(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.n && y < this.n;
  }

  terrainAt(x: number, y: number) {
    return get('terrain', this.s.terrain[y * this.n + x]);
  }

  bAt(x: number, y: number): BRT | undefined {
    if (!this.inMap(x, y)) return undefined;
    const id = this.occ[y * this.n + x];
    return id ? this.bld.get(id) : undefined;
  }

  decoBlocks(x: number, y: number) {
    const d = this.decoMap.get(y * this.n + x);
    return !!d && !!get('decoration', d.d.key)?.props.blocking;
  }

  /** chi phí đi của quái; breakMode = cho phép đi xuyên công trình (sẽ phải phá) */
  enemyCost(breakMode: boolean) {
    return (x: number, y: number) => {
      const t = this.terrainAt(x, y);
      if (t && t.props.walkable === false) return Infinity;
      if (this.decoBlocks(x, y)) return Infinity;
      const b = this.bAt(x, y);
      if (b && !b.s.ruined) {
        if (b.e.props.enemyPassable) return 1;
        if (!breakMode) return Infinity;
        return 6 + b.hp / 150;
      }
      return Number(t ? lvl(t, 1).stats.moveCost ?? 1 : 1);
    };
  }

  allyBlocked(u: Unit, x: number, y: number) {
    if (!this.inMap(x, y)) return true;
    const t = this.terrainAt(x, y);
    if (t && t.props.walkable === false) return true;
    if (this.decoBlocks(x, y)) return true;
    const b = this.bAt(x, y);
    if (b && !b.s.ruined) {
      if (b.e.props.friendlyPassable) return false;
      if (u.ent.props.canClimbWalls && b.e.props.standable) return false;
      return !!b.e.props.blocksPath;
    }
    return false;
  }

  lineClear(u: Unit, tx: number, ty: number) {
    const d = dist(u.x, u.y, tx, ty);
    const steps = Math.ceil(d / 0.3);
    for (let i = 1; i <= steps; i++) {
      const px = u.x + ((tx - u.x) * i) / steps;
      const py = u.y + ((ty - u.y) * i) / steps;
      if (this.allyBlocked(u, Math.floor(px), Math.floor(py))) return false;
    }
    return true;
  }

  /** Di chuyển lính ta tới (tx,ty), tự tìm đường quanh tường */
  allyMove(u: Unit, tx: number, ty: number, dt: number) {
    const sp = this.speedOf(u) * dt;
    if (this.lineClear(u, tx, ty) || this.allyBlocked(u, Math.floor(u.x), Math.floor(u.y))) {
      this.stepToward(u, tx, ty, sp);
      return;
    }
    const key = `${Math.floor(tx)},${Math.floor(ty)}`;
    if (!u.path || u.pathKey !== key || this.t - u.pathAt > 1.5) {
      const gx = Math.floor(tx);
      const gy = Math.floor(ty);
      u.path = astar(this.n, { x: u.x, y: u.y }, (x, y) => Math.abs(x - gx) <= (this.allyBlocked(u, gx, gy) ? 1 : 0) && Math.abs(y - gy) <= (this.allyBlocked(u, gx, gy) ? 1 : 0), gx, gy, (x, y) => (this.allyBlocked(u, x, y) ? Infinity : 1), 3000);
      u.pathKey = key;
      u.pathAt = this.t;
    }
    if (!u.path || !u.path.length) {
      this.stepToward(u, tx, ty, sp);
      return;
    }
    const nx = u.path[0].x + 0.5;
    const ny = u.path[0].y + 0.5;
    if (dist(u.x, u.y, nx, ny) < 0.15) u.path.shift();
    if (u.path.length && !this.lineClear(u, tx, ty)) this.stepToward(u, nx, ny, sp);
    else this.stepToward(u, tx, ty, sp);
  }

  stepToward(u: Unit, tx: number, ty: number, sp: number) {
    const d = dist(u.x, u.y, tx, ty);
    if (d < 1e-3) return;
    const k = Math.min(1, sp / d);
    u.x += (tx - u.x) * k;
    u.y += (ty - u.y) * k;
    if (tx < u.x - 0.01) u.sprite.setFlipX(true);
    else if (tx > u.x + 0.01) u.sprite.setFlipX(false);
  }

  speedOf(u: Unit) {
    let s = u.st.moveSpeed;
    if (u.slowUntil > this.t) s *= 1 - u.slowPct / 100;
    if (u.team === 'ally' && this.warcryUntil > this.t) s *= 1.35;
    return Math.max(0.2, s);
  }

  /* ================= Vòng lặp ================= */

  update(_time: number, deltaMs: number) {
    if (this.phase === 'over') return;
    // mở hộp thoại thì tạm dừng
    const dt = this.ui.modalOpen() ? 0 : Math.min(0.1, deltaMs / 1000) * this.speed;
    if (dt <= 0) {
      this.uiT -= deltaMs / 1000;
      if (this.uiT <= 0) {
        this.uiT = 0.25;
        this.ui.refresh();
      }
      return;
    }
    this.t += dt;
    this.tickEconomy(dt);
    if (this.phase === 'build') {
      this.s.prepLeft -= dt;
      if (this.s.prepLeft <= 0) this.startWave();
      this.saveT -= dt;
      if (this.saveT <= 0) {
        this.saveT = 5;
        this.persist();
      }
    } else this.tickSpawns(dt);
    this.tickAllies(dt);
    this.tickEnemies(dt);
    this.tickTowers(dt);
    this.tickStatus(dt);
    this.tickShots(dt);
    this.cleanup();
    if (this.phase === 'battle') this.checkWaveEnd();
    for (const u of this.units) this.placeUnit(u);
    this.drawBars();
    this.drawSelection();
    this.uiT -= deltaMs / 1000;
    if (this.uiT <= 0) {
      this.uiT = 0.25;
      this.ui.refresh();
    }
  }

  tickEconomy(dt: number) {
    const s = this.s;
    for (const b of [...this.bld.values()]) {
      const bs = b.s;
      if (bs.buildLeft > 0) {
        bs.buildLeft -= dt;
        if (bs.buildLeft <= 0) {
          bs.buildLeft = 0;
          const wasUpgrade = bs.upgrading;
          if (bs.upgrading) {
            bs.level++;
            bs.upgrading = false;
            if (bs.artifacts.length < Number(b.e.props.artifactSlots ?? 0)) bs.artifacts.length = Number(b.e.props.artifactSlots);
          }
          this.refreshBRT(b, !wasUpgrade);
          if (!wasUpgrade && b.e.props.spawns) {
            bs.troops = this.maxTroops(b);
            this.restat(b);
            this.spawnGarrison(b);
          } else if (b.e.props.spawns) this.restat(b);
          this.gridVer++;
          const c = this.centerOf(b);
          if (wasUpgrade || b.e.props.category !== 'wall') this.floatText(c.x, c.y, wasUpgrade ? `${b.e.name} lên cấp ${bs.level}!` : `${b.e.name} xây xong`, '#ffd54a');
          this.ui.refresh(true);
        }
      }
      if (!this.active(b)) continue;
      const l = lvl(b.e, bs.level);
      // sản xuất
      const prod = b.e.props.produces;
      if (prod) {
        const cap = Number(l.stats.capacity ?? 1000);
        bs.stored = Math.min(cap, (bs.stored ?? 0) + (Number(l.stats.production ?? 0) / 60) * dt);
        this.updateBubble(b, bs.stored >= Math.max(10, cap * 0.15));
      }
      // tạo lính
      if (b.e.props.spawns && bs.queue > 0) {
        const parallel = Math.max(1, Number(l.stats.trainQueue ?? 1));
        const tt = trainTime(bs, s.items) * CFG.TRAIN_TIME_SCALE;
        while (bs.queueProgress.length < Math.min(parallel, bs.queue)) bs.queueProgress.push(0);
        for (let i = 0; i < bs.queueProgress.length; i++) {
          bs.queueProgress[i] += dt;
          if (bs.queueProgress[i] >= tt) {
            bs.queueProgress.splice(i, 1);
            i--;
            bs.queue--;
            bs.troops++;
            this.addTrainedSoldier(b);
          }
        }
      }
    }
    // rương
    const opening = s.chests.find((c) => c.unlockLeft != null && c.unlockLeft > 0);
    if (opening) opening.unlockLeft = Math.max(0, opening.unlockLeft! - dt);
    // dọn cây / đá
    for (const [cell, v] of [...this.decoMap.entries()]) {
      if (v.d.clearing == null) continue;
      v.d.clearing -= dt;
      v.img.setAlpha(0.5 + 0.5 * Math.abs(Math.sin(this.t * 4)));
      if (v.d.clearing <= 0) this.finishClear(cell);
    }
    // giới hạn kho
    for (const k of Object.keys(s.resources)) {
      const cap = resourceCap(k, s.buildings);
      if (s.resources[k] > cap) s.resources[k] = cap;
    }
  }

  updateBubble(b: BRT, show: boolean) {
    if (show && !b.bubble) {
      const c = iso(b.s.x + b.s.w / 2, b.s.y + b.s.h / 2);
      const icon = { gold: '🪙', wood: '🪵', stone: '🪨', food: '🌾', gem: '💎' }[b.e.props.produces as string] ?? '📦';
      b.bubble = this.add.text(c.x, c.y - 70, icon, { fontSize: '24px', backgroundColor: '#ffffffdd', padding: { x: 4, y: 2 } }).setOrigin(0.5).setDepth(850000);
      this.tweens.add({ targets: b.bubble, y: c.y - 78, yoyo: true, repeat: -1, duration: 600 });
    } else if (!show && b.bubble) {
      b.bubble.destroy();
      b.bubble = undefined;
    }
  }

  /* ================= Đợt quái ================= */

  waveMod(n: number): WaveMod | null {
    if (n < 4 || n % 5 === 0) return null;
    const h = Math.abs(Math.imul(this.s.seed ^ (n * 2654435761), 2246822519)) >>> 0;
    if (h % 3 !== 0) return null;
    return WAVE_MODS[(h >>> 3) % WAVE_MODS.length];
  }

  waveMonsters(n: number) {
    const ms = all('monster');
    const pick = (key: string, fb: (e: Entity) => boolean) => get('monster', key) ?? ms.find(fb);
    const goblin = pick('goblin', (e) => e.props.role === 'melee');
    const wolf = pick('wolf', (e) => e.props.role === 'melee');
    const orc = pick('orc', (e) => e.props.role === 'melee');
    const bat = pick('bat_swarm', (e) => e.props.pathMode === 'fly');
    const boss = pick('troll_king', (e) => e.props.role === 'boss');
    const level = Math.min(3, 1 + Math.floor((n - 1) / 4));
    const out: { e: Entity; count: number }[] = [];
    if (goblin) out.push({ e: goblin, count: 3 + n * 2 });
    if (wolf && n >= 3) out.push({ e: wolf, count: Math.floor(n * 0.8) });
    if (orc && n >= 3) out.push({ e: orc, count: Math.floor((n - 1) / 2) });
    if (bat && n >= 4) out.push({ e: bat, count: Math.floor(n / 2) });
    if (boss && n % 5 === 0) out.push({ e: boss, count: n / 5 });
    // các loại quái khác thêm trên admin cũng xuất hiện từ đợt 6
    for (const e of ms) if (![goblin, wolf, orc, bat, boss].includes(e) && n >= 6) out.push({ e, count: Math.floor(n / 3) });
    const mod = this.waveMod(n);
    if (mod?.count) for (const g of out) if (g.e.props.role !== 'boss') g.count = Math.ceil(g.count * mod.count);
    return { list: out, level, hpMul: 1 + 0.07 * (n - 1 - (level - 1) * 4), mod };
  }

  startWave() {
    if (this.phase !== 'build') return;
    this.persist();
    saveWaveBackup(this.s);
    this.phase = 'battle';
    this.s.merchant = null;
    const n = this.s.wave + 1;
    const w = this.waveMonsters(n);
    const spawnCount = this.activeSpawns(n);
    const q: typeof this.spawnQueue = [];
    let i = 0;
    for (const g of w.list) for (let k = 0; k < g.count; k++) q.push({ key: g.e.key, level: Math.min(w.level, maxLevel(g.e)), sp: i++ % spawnCount, hpMul: w.hpMul });
    // xáo trộn nhẹ, trùm ra cuối
    q.sort((a, b) => (get('monster', a.key)?.props.role === 'boss' ? 1 : 0) - (get('monster', b.key)?.props.role === 'boss' ? 1 : 0) || Math.random() - 0.5);
    this.spawnQueue = q;
    this.spawnT = 0;
    this.waveKills = 0;
    this.waveStat = { kills: 0, lost: 0, gold: 0 };
    this.curMod = w.mod;
    this.setTint(w.mod?.tint ?? null);
    play('horn');
    // khiên đầu trận
    for (const u of this.units) if (u.team === 'ally') {
      u.revived = false;
      this.applyStartShield(u);
    }
    this.ui.banner(`Đợt ${n}`, w.mod ? `${w.mod.icon} ${w.mod.name}: ${w.mod.desc}` : `${q.length} quái đang tới!`);
    this.ui.refresh(true);
  }

  tickSpawns(dt: number) {
    if (!this.spawnQueue.length) return;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 0.75;
    const m = this.spawnQueue.shift()!;
    const e = get('monster', m.key);
    if (!e) return;
    const l = lvl(e, m.level).stats;
    const n = this.s.wave + 1;
    const elite = n >= 3 && e.props.role !== 'boss' && Math.random() < 0.05 + n * 0.01;
    const diff = this.s.difficulty ?? 1;
    const mod = this.curMod;
    const st: CombatStats = {
      // trùm lần đầu xuất hiện yếu hơn, mạnh dần tới đợt 10
      hp: Math.round(Number(l.hp ?? 50) * m.hpMul * diff * (elite ? 2.5 : 1) * (mod?.hp ?? 1) * (e.props.role === 'boss' ? Math.min(1, 0.5 + n * 0.05) : 1)),
      damage: Number(l.damage ?? 5) * (0.5 + m.hpMul / 2) * (0.5 + diff / 2) * (elite ? 1.5 : 1) * (mod?.dmg ?? 1),
      armor: Number(l.armor ?? 0) + (elite ? 3 : 0) + (mod?.armor ?? 0),
      attackRange: Number(l.attackRange ?? 1),
      attackSpeed: Number(l.attackSpeed ?? 1),
      moveSpeed: Number(l.moveSpeed ?? 1.5) * (mod?.speed ?? 1),
      auraRadius: 0,
      auraBonusPct: 0,
      skillCooldownSec: 99,
      wallRangeBonus: 0,
      wallDamagePct: 0,
      effects: [],
    };
    const sp = this.s.spawns[m.sp] ?? this.s.spawns[0];
    const u = this.addUnit('enemy', e, m.level, st, sp.x + 0.5 + (Math.random() - 0.5) * 0.6, sp.y + 0.5 + (Math.random() - 0.5) * 0.6);
    if (elite) {
      u.elite = true;
      u.sprite.setScale(u.sprite.scaleX * 1.25);
    }
    u.sprite.setAlpha(0);
    this.tweens.add({ targets: u.sprite, alpha: 1, duration: 400 });
  }

  checkWaveEnd() {
    if (this.spawnQueue.length) return;
    if (this.units.some((u) => u.team === 'enemy' && u.alive)) return;
    // thắng đợt
    const n = ++this.s.wave;
    this.s.stats.bestWave = Math.max(this.s.stats.bestWave, n);
    this.phase = 'build';
    this.s.prepLeft = CFG.PREP_TIME;
    const ck = n % 10 === 0 && get('chest', 'golden_chest') ? 'golden_chest' : n % 5 === 0 && get('chest', 'silver_chest') ? 'silver_chest' : 'wooden_chest';
    const ce = get('chest', ck) ?? all('chest')[0];
    let msg = '';
    if (ce) {
      const level = Math.min(maxLevel(ce), 1 + Math.floor((n - 1) / 6) + (this.curMod?.id === 'night' ? 1 : 0));
      if (this.s.chests.length < CFG.CHEST_SLOTS) {
        this.s.chests.push({ id: this.s.nextId++, key: ce.key, level, unlockLeft: null });
        msg = `Nhận ${ce.name} cấp ${level}`;
      } else {
        const g = 100 * n;
        this.s.resources.gold = (this.s.resources.gold ?? 0) + g;
        msg = `Ô rương đầy — đổi thành ${g} vàng`;
      }
    }
    // hồi máu công trình còn đứng, lính sống sót
    for (const b of this.bld.values()) if (!b.s.ruined) b.hp = b.maxHp;
    for (const u of this.units) if (u.team === 'ally') {
      u.hp = u.maxHp;
      u.target = null;
      u.dots = [];
    }
    this.curMod = null;
    this.setTint(null);
    this.maybeMerchant(n);
    const ws = this.waveStat;
    this.ui.banner(`Thắng đợt ${n}!`, `${msg} · Hạ ${ws.kills} quái · ${ws.lost ? `mất ${ws.lost} lính` : 'không mất lính nào'} · +${ws.gold} vàng`);
    play('win');
    this.updateSpawnMarks();
    this.persist();
    this.ui.refresh(true);
  }

  gameOver() {
    this.phase = 'over';
    play('lose');
    this.ui.gameOver(this.s.wave + 1);
  }

  /* ================= Trí tuệ lính ta ================= */

  tickAllies(dt: number) {
    const enemies = this.units.filter((u) => u.team === 'enemy' && u.alive);
    // hào quang tướng
    const generals = this.units.filter((u) => u.team === 'ally' && u.alive && u.general && u.st.auraRadius > 0);
    for (const u of this.units) {
      if (u.team !== 'ally') continue;
      let bonus = 0;
      for (const g of generals) if (g !== u && dist(g.x, g.y, u.x, u.y) <= g.st.auraRadius) bonus = Math.max(bonus, g.st.auraBonusPct);
      for (const g of this.units)
        if (g.team === 'ally' && g.alive && g !== u)
          for (const ef of g.st.effects) if (ef.type === 'buffAura' && dist(g.x, g.y, u.x, u.y) <= (ef.radius || 3)) bonus += ef.value / Math.max(1, g.home?.soldiers.length ?? 1);
      u.auraMul = (1 + bonus / 100) * (this.warcryUntil > this.t ? 1.35 : 1);
    }
    for (const b of this.bld.values()) {
      if (!b.soldiers.length) continue;
      const center = this.zoneCenter(b);
      const R = this.coverRadius(b);
      const chase = R + Number(b.e.props.chaseRadius ?? 2);
      const inZone = enemies.filter((m) => dist(m.x, m.y, center.x, center.y) <= R + 0.5 * m.size);
      const spots = this.spots(b);
      const mode = b.e.props.engageMode ?? 'all';
      let k = 0;
      for (const u of b.soldiers) {
        if (!u.alive) continue;
        // giữ mục tiêu khi còn trong tầm đuổi
        if (u.target && (!u.target.alive || dist(u.target.x, u.target.y, center.x, center.y) > chase)) u.target = null;
        if (!u.target && inZone.length) {
          const cand = inZone.filter((m) => !m.flying || !u.melee || m.flying);
          if (mode === 'split') u.target = cand[k++ % cand.length] ?? null;
          else {
            let best: Unit | null = null;
            let bd = Infinity;
            for (const m of cand) {
              let d = dist(u.x, u.y, m.x, m.y);
              if (u.melee && m.blocker && m.blocker !== u && m.blocker.alive) d += 1.5;
              if (d < bd) {
                bd = d;
                best = m;
              }
            }
            u.target = best;
          }
        }
        this.allyAct(u, spots[u.spot % spots.length], dt, b);
      }
    }
  }

  allyAct(u: Unit, spot: { x: number; y: number }, dt: number, b: BRT) {
    const cellB = this.bAt(Math.floor(u.x), Math.floor(u.y));
    u.onWall = !!(cellB && !cellB.s.ruined && cellB.e.props.standable && u.ent.props.canClimbWalls);
    u.cd -= dt;
    u.skillCd -= dt;
    if (u.stunUntil > this.t) return;
    const m = u.target;
    if (m) {
      const range = u.st.attackRange + (u.onWall ? u.st.wallRangeBonus : 0) + 0.25 + (m.size - 1) * 0.4;
      const d = dist(u.x, u.y, m.x, m.y);
      if (d <= range) {
        if (u.melee && !m.flying && (!m.blocker || !m.blocker.alive || dist(m.blocker.x, m.blocker.y, m.x, m.y) > d)) m.blocker = u;
        if (m.x < u.x) u.sprite.setFlipX(true);
        else u.sprite.setFlipX(false);
        if (u.cd <= 0) {
          u.cd = 1 / u.st.attackSpeed;
          this.attack(u, m);
        }
        if (u.general && u.skillCd <= 0) {
          u.skillCd = u.st.skillCooldownSec;
          this.generalSkill(u, m);
        }
      } else {
        // cận chiến đứng chặn: tiến sát; tầm xa: chỉ tiến tới khi vào tầm
        const ang = Math.atan2(u.y - m.y, u.x - m.x);
        const want = u.melee ? Math.max(0.6, range - 0.35) : range - 0.3;
        this.allyMove(u, m.x + Math.cos(ang) * want, m.y + Math.sin(ang) * want, dt);
      }
      return;
    }
    // về chỗ đứng
    if (dist(u.x, u.y, spot.x, spot.y) > 0.08) this.allyMove(u, spot.x, spot.y, dt);
    else if (this.phase === 'build' || u.lastHit < this.t - 4) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.03 * dt);
    void b;
  }

  generalSkill(u: Unit, m: Unit) {
    const ranged = u.role === 'ranged';
    const r = ranged ? 2 : 1.6;
    const cx = ranged ? m.x : u.x;
    const cy = ranged ? m.y : u.y;
    this.ringFx(cx, cy, r, ranged ? 0x80d8ff : 0xffab40);
    play('skill');
    this.floatText(u.x, u.y - 0.5, String(u.ent.props.skill ?? 'Tuyệt kỹ').split('—')[0].trim(), '#ffd54a', 15);
    for (const e of this.units) {
      if (e.team !== 'enemy' || !e.alive || dist(e.x, e.y, cx, cy) > r) continue;
      this.damage(u, e, u.st.damage * 2.2, false);
      if (!ranged) this.knock(e, u.x, u.y, 1);
    }
  }

  /* ================= Trí tuệ quái ================= */

  goalFor(u: Unit): BRT | undefined {
    const th = this.townHall();
    const tg = u.ent.props.target;
    if (tg === 'buildings') {
      let best: BRT | undefined;
      let bd = Infinity;
      for (const b of this.bld.values()) {
        if (b.s.ruined || ['wall', 'gate'].includes(b.e.props.category)) continue;
        const d = this.distToB(u.x, u.y, b);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      return best ?? th;
    }
    return th && !th.s.ruined ? th : [...this.bld.values()].find((b) => !b.s.ruined);
  }

  distToB(x: number, y: number, b: BRT) {
    const dx = Math.max(b.s.x - x, 0, x - (b.s.x + b.s.w));
    const dy = Math.max(b.s.y - y, 0, y - (b.s.y + b.s.h));
    return Math.hypot(dx, dy);
  }

  tickEnemies(dt: number) {
    const allies = this.units.filter((u) => u.team === 'ally' && u.alive);
    for (const u of this.units) {
      if (u.team !== 'enemy' || !u.alive) continue;
      u.cd -= dt;
      if (u.stunUntil > this.t) continue;
      const reach = u.st.attackRange + 0.3 + (u.size - 1) * 0.4;
      // bị lính cận chiến chặn
      if (u.blocker && (!u.blocker.alive || dist(u.blocker.x, u.blocker.y, u.x, u.y) > u.blocker.st.attackRange + 0.9)) u.blocker = null;
      let foe: Unit | null = null;
      if (!u.flying) {
        if (u.blocker) foe = u.blocker;
        else {
          let bd = reach;
          for (const a of allies) {
            if (a.onWall) continue;
            const d = dist(a.x, a.y, u.x, u.y);
            if (d <= bd) {
              bd = d;
              foe = a;
            }
          }
        }
      }
      if (foe) {
        const d = dist(foe.x, foe.y, u.x, u.y);
        if (d <= reach) {
          if (u.cd <= 0) {
            u.cd = 1 / u.st.attackSpeed;
            this.attack(u, foe);
          }
        } else this.stepToward(u, foe.x, foe.y, this.speedOf(u) * dt);
        continue;
      }
      const goal = this.goalFor(u);
      if (!goal) continue;
      // đánh công trình: cận chiến phải đứng sát (không đánh xuyên tường)
      const bReach = 0.8 + (u.size - 1) * 0.5 + (u.st.attackRange > 1.5 ? u.st.attackRange - 1 : 0);
      if (this.distToB(u.x, u.y, goal) <= bReach) {
        this.hitBuilding(u, goal);
        continue;
      }
      if (u.flying) {
        const c = this.centerOf(goal);
        this.stepToward(u, c.x, c.y, this.speedOf(u) * dt);
        continue;
      }
      // đi theo đường; phá tường nếu đường đi xuyên qua
      if (!u.path || u.pathKey !== `${goal.s.id}:${this.gridVer}` || u.goalId !== goal.s.id) this.repath(u, goal);
      if (!u.path || !u.path.length) {
        const c = this.centerOf(goal);
        this.stepToward(u, c.x, c.y, this.speedOf(u) * dt);
        continue;
      }
      const next = u.path[0];
      const nb = this.bAt(next.x, next.y);
      if (nb && nb !== goal && !nb.s.ruined && !nb.e.props.enemyPassable && this.enemyCost(false)(next.x, next.y) === Infinity) {
        if (this.distToB(u.x, u.y, nb) <= bReach) {
          this.hitBuilding(u, nb);
          continue;
        }
      }
      const tx = next.x + 0.5;
      const ty = next.y + 0.5;
      if (dist(u.x, u.y, tx, ty) < 0.12) u.path.shift();
      else this.stepToward(u, tx, ty, this.speedOf(u) * dt);
    }
    // tách quái chồng lên nhau
    const en = this.units.filter((u) => u.team === 'enemy' && u.alive && !u.flying);
    for (let i = 0; i < en.length; i++)
      for (let j = i + 1; j < en.length; j++) {
        const a = en[i];
        const b = en[j];
        const d = dist(a.x, a.y, b.x, b.y);
        const min = 0.35 * (a.size + b.size) * 0.7;
        if (d < min && d > 1e-4) {
          const push = ((min - d) / d) * 0.25;
          const ax = (a.x - b.x) * push;
          const ay = (a.y - b.y) * push;
          if (this.enemyCost(false)(Math.floor(a.x + ax), Math.floor(a.y + ay)) < 99) {
            a.x += ax;
            a.y += ay;
          }
          if (this.enemyCost(false)(Math.floor(b.x - ax), Math.floor(b.y - ay)) < 99) {
            b.x -= ax;
            b.y -= ay;
          }
        }
      }
  }

  repath(u: Unit, goal: BRT) {
    const isGoal = (x: number, y: number) => this.distToB(x + 0.5, y + 0.5, goal) <= 0.75 + (u.size - 1) * 0.5;
    const c = this.centerOf(goal);
    const smash = u.ent.props.pathMode === 'smash';
    let p = smash ? null : astar(this.n, { x: u.x, y: u.y }, isGoal, c.x, c.y, this.enemyCost(false));
    if (!p) p = astar(this.n, { x: u.x, y: u.y }, isGoal, c.x, c.y, this.enemyCost(true), 8000);
    u.path = p;
    u.goalId = goal.s.id;
    u.pathKey = `${goal.s.id}:${this.gridVer}`;
  }

  hitBuilding(u: Unit, b: BRT) {
    if (u.cd > 0) return;
    u.cd = 1 / u.st.attackSpeed;
    const c = this.centerOf(b);
    if (c.x < u.x) u.sprite.setFlipX(true);
    else u.sprite.setFlipX(false);
    this.lunge(u, c.x, c.y);
    const dmg = Math.max(1, u.st.damage * (u.ent.props.target === 'walls' && ['wall', 'gate'].includes(b.e.props.category) ? 2 : 1));
    b.hp -= dmg;
    b.sprite.setTint(0xff9999);
    this.time.delayedCall(80, () => this.styleBRT(b));
    if (b.hp <= 0) this.ruin(b);
  }

  ruin(b: BRT) {
    b.hp = 0;
    b.s.ruined = true;
    b.s.buildLeft = 0;
    b.s.upgrading = false;
    b.s.queue = 0;
    b.s.queueProgress = [];
    this.styleBRT(b);
    this.gridVer++;
    const c = this.centerOf(b);
    this.floatText(c.x, c.y, `${b.e.name} bị phá!`, '#ff5252');
    this.cameras.main.shake(150, 0.004);
    play('break');
    this.puff(c.x, c.y, 0x8d6e63, 14);
    if (b.e.props.category === 'core') this.gameOver();
  }

  tickTowers(dt: number) {
    for (const b of this.bld.values()) {
      if (!this.active(b)) continue;
      const l = this.towerStats(b);
      if (!l) continue;
      b.cd -= dt;
      if (b.cd > 0) continue;
      const c = this.centerOf(b);
      const r = Number(l.attackRange ?? 4);
      let best: Unit | null = null;
      let bd = Infinity;
      for (const u of this.units) {
        if (u.team !== 'enemy' || !u.alive) continue;
        const d = dist(u.x, u.y, c.x, c.y);
        if (d <= r && d < bd) {
          bd = d;
          best = u;
        }
      }
      if (!best) continue;
      b.cd = 1 / Number(l.attackSpeed ?? 1);
      const target = best;
      const dmg = Number(l.damage);
      this.projectile(c.x, c.y, 2.2, target, () => this.damage(null, target, dmg, false));
    }
  }

  /** Chỉ số bắn của công trình; Thành chính chưa có chỉ số bắn trên admin thì tự bắn tên mặc định */
  towerStats(b: BRT): Record<string, number> | null {
    const l = lvl(b.e, b.s.level).stats;
    if (b.e.props.spawns) return null;
    if (l.damage) return l;
    if (b.e.props.category === 'core') return { damage: 22 + 14 * b.s.level, attackRange: 5, attackSpeed: 1.2 };
    return null;
  }

  tickStatus(dt: number) {
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.dots.length) {
        let d = 0;
        u.dots = u.dots.filter((x) => x.until > this.t);
        for (const x of u.dots) d += x.dps * dt;
        if (d > 0) {
          u.hp -= d;
          if (u.hp <= 0) this.kill(u, null);
        }
      }
      for (const ef of u.st.effects) {
        if (ef.type === 'regen') u.hp = Math.min(u.maxHp, u.hp + ef.value * dt);
        if (ef.type === 'healAura')
          for (const o of this.units) if (o.team === u.team && o.alive && dist(o.x, o.y, u.x, u.y) <= (ef.radius || 2)) o.hp = Math.min(o.maxHp, o.hp + (ef.value * dt) / 3);
      }
      if (u.abUntil < this.t) u.abVal = 0;
      if (u.stunUntil > this.t) u.sprite.setTint(0xaaaaff);
      else if (u.slowUntil > this.t) u.sprite.setTint(0x99ddff);
      else if (u.dots.length) u.sprite.setTint(0xffbb77);
      else if (this.t - u.lastHit < 0.12) u.sprite.setTint(ENEMY_TINT_HIT);
      else if (u.elite) u.sprite.setTint(0xffe082);
      else if (u.team === 'ally' && this.warcryUntil > this.t) u.sprite.setTint(0xffccbc);
      else u.sprite.clearTint();
    }
  }

  cleanup() {
    const dead = this.units.filter((u) => !u.alive);
    if (!dead.length) return;
    for (const u of dead) this.destroyUnit(u);
    this.units = this.units.filter((u) => u.alive);
    for (const b of this.bld.values()) b.soldiers = b.soldiers.filter((u) => u.alive);
  }

  /* ================= Sát thương ================= */

  attack(a: Unit, t: Unit) {
    if (a.melee) {
      this.lunge(a, t.x, t.y);
      play('hit');
      this.damage(a, t, a.st.damage, true);
    } else {
      play('arrow');
      const lift = a.onWall ? 0.8 : 0.45;
      this.projectile(a.x, a.y, lift, t, () => this.damage(a, t, a.st.damage, true));
    }
  }

  /** Sát thương = công − giáp (tối thiểu 10% công), cộng hiệu ứng trang bị / cổ vật */
  damage(a: Unit | null, t: Unit, base: number, allowSplash: boolean) {
    if (!t.alive) return;
    for (const ef of t.st.effects)
      if (ef.type === 'dodge' && Math.random() * 100 < ef.value) {
        this.floatText(t.x, t.y, 'Né!', '#ffffff', 12);
        return;
      }
    let raw = base * (a ? a.auraMul : 1);
    if (a?.onWall) raw *= 1 + a.st.wallDamagePct / 100;
    let crit = false;
    const effs: Effect[] = a ? a.st.effects : [];
    for (const ef of effs)
      if (ef.type === 'crit' && Math.random() < (ef.chance ?? 1)) {
        raw *= 1 + ef.value / 100;
        crit = true;
      }
    const armor = Math.max(0, t.st.armor - t.abVal);
    let dmg = Math.max(raw * CFG.MIN_DAMAGE_PCT, raw - armor, 1);
    if (t.shield > 0) {
      const ab = Math.min(t.shield, dmg);
      t.shield -= ab;
      dmg -= ab;
    }
    t.hp -= dmg;
    t.lastHit = this.t;
    if (crit) this.floatText(t.x, t.y, `${Math.round(dmg)}!`, '#ffeb3b', 14);
    if (a) {
      for (const ef of effs) {
        if (ef.chance !== undefined && ef.chance < 1 && !['crit', 'lifesteal', 'splash', 'dodge', 'thorns', 'regen', 'goldBonus', 'revive', 'shield', 'buffAura', 'healAura'].includes(ef.type) && Math.random() > ef.chance) continue;
        switch (ef.type) {
          case 'lifesteal':
            a.hp = Math.min(a.maxHp, a.hp + (dmg * ef.value) / 100);
            break;
          case 'slow':
            t.slowPct = Math.max(t.slowUntil > this.t ? t.slowPct : 0, ef.value);
            t.slowUntil = this.t + (ef.durationSec || 2);
            break;
          case 'stun':
            if (t.ent.props.role !== 'boss') t.stunUntil = this.t + (ef.durationSec || 1);
            break;
          case 'burn':
          case 'poison':
            t.dots.push({ dps: ef.value, until: this.t + (ef.durationSec || 3) });
            break;
          case 'knockback':
            this.knock(t, a.x, a.y, ef.value || 1);
            break;
          case 'armorBreak':
            t.abVal = Math.max(t.abVal, ef.value);
            t.abUntil = this.t + (ef.durationSec || 3);
            break;
          case 'splash':
            if (allowSplash)
              for (const o of this.units) if (o !== t && o.alive && o.team === t.team && dist(o.x, o.y, t.x, t.y) <= (ef.radius || 1)) this.damage(null, o, (base * ef.value) / 100, false);
            break;
        }
      }
      for (const ef of t.st.effects) if (ef.type === 'thorns' && a.alive) {
        a.hp -= (dmg * ef.value) / 100;
        if (a.hp <= 0) this.kill(a, null);
      }
    }
    if (t.hp <= 0) this.kill(t, a);
  }

  knock(t: Unit, fx: number, fy: number, cells: number) {
    if (t.ent.props.role === 'boss') return;
    const d = dist(t.x, t.y, fx, fy) || 1;
    const nx = t.x + ((t.x - fx) / d) * cells * 0.5;
    const ny = t.y + ((t.y - fy) / d) * cells * 0.5;
    if (this.inMap(Math.floor(nx), Math.floor(ny)) && this.enemyCost(false)(Math.floor(nx), Math.floor(ny)) < 99) {
      t.x = nx;
      t.y = ny;
      t.path = null;
    }
  }

  kill(u: Unit, by: Unit | null) {
    if (!u.alive) return;
    for (const ef of u.st.effects)
      if (ef.type === 'revive' && !u.revived && Math.random() < (ef.chance ?? 1)) {
        u.revived = true;
        u.hp = (u.maxHp * ef.value) / 100;
        this.floatText(u.x, u.y, 'Hồi sinh!', '#80ff80');
        return;
      }
    u.alive = false;
    u.hp = 0;
    if (u.team === 'enemy') {
      let gold = Number(lvl(u.ent, u.level).stats.goldDrop ?? 0);
      let bonus = 0;
      if (by) for (const ef of by.st.effects) if (ef.type === 'goldBonus') bonus += ef.value;
      gold = Math.round(gold * (1 + bonus / 100) * (u.elite ? 3 : 1) * (this.curMod?.gold ?? 1));
      this.waveStat.kills++;
      this.waveStat.gold += gold;
      if (u.elite) {
        const gem = 1 + Math.floor(Math.random() * 2);
        this.s.resources.gem = (this.s.resources.gem ?? 0) + gem;
        this.floatText(u.x, u.y - 0.6, `+${gem}💎`, '#e1bee7', 14);
      }
      this.puff(u.x, u.y, u.elite ? 0xffd54a : 0x9e9e9e);
      play('die');
      if (gold) {
        this.s.resources.gold = Math.min(resourceCap('gold', this.s.buildings), (this.s.resources.gold ?? 0) + gold);
        this.floatText(u.x, u.y, `+${gold}🪙`, '#ffd54a', 12);
      }
      this.s.stats.kills++;
      this.waveKills++;
    } else if (u.home) {
      const b = u.home;
      b.s.troops = Math.max(0, b.s.troops - 1);
      this.waveStat.lost++;
      this.s.stats.lost++;
      this.puff(u.x, u.y, 0x64b5f6);
      this.floatText(u.x, u.y, u.general ? `${u.ent.name} tử trận!` : 'Lính tử trận', '#ff8a80', 12);
    }
    this.tweens.add({ targets: u.sprite, alpha: 0, y: u.sprite.y - 10, duration: 300 });
    const sp = u.sprite;
    const bar = u.bar;
    u.sprite = this.add.image(-9999, -9999, '__DEFAULT').setVisible(false);
    u.bar = this.add.graphics();
    this.time.delayedCall(320, () => {
      sp.destroy();
      bar.destroy();
    });
  }

  /* ================= Hiệu ứng hình ================= */

  lunge(u: Unit, tx: number, ty: number) {
    const p = iso(u.x, u.y);
    const q = iso(tx, ty);
    const d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const spr = u.sprite;
    this.tweens.add({ targets: spr, x: spr.x + ((q.x - p.x) / d) * 6, y: spr.y + ((q.y - p.y) / d) * 3, duration: 70, yoyo: true });
  }

  /** Mũi tên bay theo thời gian game (không phụ thuộc tween) để sát thương luôn tính đúng khi tua nhanh / tạm dừng */
  projectile(x: number, y: number, lift: number, t: Unit, onHit: () => void) {
    const p = iso(x, y);
    const g = this.add.graphics().setDepth(900001);
    g.lineStyle(2, 0x5d4037, 1);
    g.lineBetween(-7, 0, 7, 0);
    g.fillStyle(0xeeeeee, 1).fillTriangle(7, -2, 11, 0, 7, 2);
    const sx = p.x;
    const sy = p.y - lift * 40;
    g.setPosition(sx, sy);
    const q = iso(t.x, t.y);
    const dur = Math.max(0.12, Math.hypot(q.x - p.x, q.y - p.y) * 0.0016);
    this.shots.push({ g, sx, sy, t, age: 0, dur, onHit });
  }

  tickShots(dt: number) {
    for (const s of this.shots) {
      s.age += dt;
      const k = Math.min(1, s.age / s.dur);
      const q = iso(s.t.x, s.t.y);
      const tx = q.x;
      const ty = q.y - (s.t.flying ? 30 : 16);
      const x = s.sx + (tx - s.sx) * k;
      const y = s.sy + (ty - s.sy) * k - Math.sin(k * Math.PI) * 18;
      s.g.setRotation(Math.atan2(y - s.g.y, x - s.g.x));
      s.g.setPosition(x, y);
      if (k >= 1) {
        s.g.destroy();
        s.done = true;
        s.onHit();
      }
    }
    if (this.shots.some((s) => s.done)) this.shots = this.shots.filter((s) => !s.done);
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= this.t);
      this.pending = this.pending.filter((p) => p.at > this.t);
      for (const p of due) p.fn();
    }
  }

  /** Hẹn giờ theo thời gian game */
  after(sec: number, fn: () => void) {
    this.pending.push({ at: this.t + sec, fn });
  }

  ringFx(x: number, y: number, r: number, color: number) {
    const g = this.add.graphics().setDepth(900002);
    this.circlePath(g, x, y, r, color, 0.35, 3);
    this.tweens.add({ targets: g, alpha: 0, duration: 500, onComplete: () => g.destroy() });
  }

  floatText(x: number, y: number, text: string, color: string, size = 14) {
    const p = iso(x, y);
    const t = this.add.text(p.x, p.y - 40, text, { fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000', strokeThickness: 3, fontFamily: 'system-ui, sans-serif' }).setOrigin(0.5).setDepth(950000);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
  }

  circlePath(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, fillA: number, lw = 2) {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const p = iso(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      pts.push(new Phaser.Math.Vector2(p.x, p.y));
    }
    g.fillStyle(color, fillA);
    g.fillPoints(pts, true);
    g.lineStyle(lw, color, Math.min(1, fillA * 3 + 0.3));
    g.strokePoints(pts, true);
  }

  drawBars() {
    for (const b of this.bld.values()) {
      b.bar.clear();
      const top = iso(b.s.x + b.s.w / 2, b.s.y + b.s.h / 2);
      const y = b.sprite.getBounds().top - 6;
      const w = 18 * (b.s.w + b.s.h);
      if (b.hp < b.maxHp && !b.s.ruined) {
        b.bar.fillStyle(0x000000, 0.6).fillRect(top.x - w / 2 - 1, y - 1, w + 2, 6);
        b.bar.fillStyle(0x66bb6a, 1).fillRect(top.x - w / 2, y, (w * b.hp) / b.maxHp, 4);
      }
      if (b.s.buildLeft > 0) {
        const pr = 1 - b.s.buildLeft / Math.max(0.01, b.s.buildTotal);
        b.bar.fillStyle(0x000000, 0.6).fillRect(top.x - w / 2 - 1, y + 7, w + 2, 6);
        b.bar.fillStyle(0xffca28, 1).fillRect(top.x - w / 2, y + 8, w * pr, 4);
      }
      if (b.s.queue > 0 && this.active(b)) {
        b.bar.fillStyle(0x000000, 0.6).fillRect(top.x - w / 2 - 1, y + 14, w + 2, 6);
        const tt = trainTime(b.s, this.s.items) * CFG.TRAIN_TIME_SCALE;
        b.bar.fillStyle(0x42a5f5, 1).fillRect(top.x - w / 2, y + 15, (w * Math.max(0, ...b.s.queueProgress, 0)) / tt, 4);
      }
    }
  }

  drawSelection() {
    const g = this.coverG;
    g.clear();
    const sel = this.selected?.kind === 'building' ? this.bld.get(this.selected.id) : undefined;
    const rallyB = this.mode.kind === 'rally' ? this.bld.get(this.mode.id) : sel;
    if (rallyB) {
      const b = rallyB;
      const pts = [iso(b.s.x, b.s.y), iso(b.s.x + b.s.w, b.s.y), iso(b.s.x + b.s.w, b.s.y + b.s.h), iso(b.s.x, b.s.y + b.s.h)];
      g.lineStyle(2, 0xffffff, 0.9).strokePoints(pts.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);
      if (b.e.props.spawns) {
        if (b.e.props.rallyZone === 'territory') {
          const th = this.townHall();
          if (th) this.circlePath(g, this.centerOf(th).x, this.centerOf(th).y, this.territoryRadius(), 0xffd54a, 0.05, 1);
        }
        const zc = this.zoneCenter(b);
        this.circlePath(g, zc.x, zc.y, this.coverRadius(b), 0x42a5f5, 0.13);
        const c = this.centerOf(b);
        const rp = { x: c.x + b.s.rally.x, y: c.y + b.s.rally.y };
        const p = iso(rp.x, rp.y);
        g.lineStyle(2, 0xffeb3b, 1).lineBetween(p.x, p.y, p.x, p.y - 26);
        g.fillStyle(0xffeb3b, 1).fillTriangle(p.x, p.y - 26, p.x + 14, p.y - 21, p.x, p.y - 16);
      }
      const l = this.towerStats(b);
      if (l?.damage && l.attackRange) {
        const c = this.centerOf(b);
        this.circlePath(g, c.x, c.y, Number(l.attackRange), 0xff7043, 0.1);
      }
    }
    if (this.selected?.kind === 'unit') {
      const u = this.selected.u;
      if (!u.alive) this.selected = null;
      else {
        const p = iso(u.x, u.y);
        g.lineStyle(2, u.team === 'enemy' ? 0xff5252 : 0x69f0ae, 1).strokeEllipse(p.x, p.y, 34 * u.size, 17 * u.size);
        if (u.team === 'enemy') this.circlePath(g, u.x, u.y, u.st.attackRange, 0xff5252, 0.06, 1);
      }
    }
    if (this.selected?.kind === 'deco') {
      const x = this.selected.cell % this.n;
      const y = Math.floor(this.selected.cell / this.n);
      const pts = [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)];
      g.lineStyle(2, 0xffffff, 0.9).strokePoints(pts.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);
    }
  }

  /* ================= Nhập liệu ================= */

  setupInput() {
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      const g = grid(w.x, w.y);
      this.hover = { x: Math.floor(g.x), y: Math.floor(g.y) };
      if (this.mode.kind === 'build') {
        this.drawGhost();
        if (this.dragWall && p.isDown) this.tryPlaceWallDrag();
      } else if (this.mode.kind === 'rally') this.drawRallyGhost(g.x, g.y);
      else if (this.mode.kind === 'spell') this.drawSpellGhost(g.x, g.y);
      else if (this.mode.kind === 'move') this.drawMoveGhost();
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) {
        this.cancelMode();
        return;
      }
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      const g = grid(w.x, w.y);
      this.hover = { x: Math.floor(g.x), y: Math.floor(g.y) };
      if (this.mode.kind === 'build') {
        const key = this.mode.key;
        if (this.place(key, this.hover.x, this.hover.y)) {
          const e = get('building', key)!;
          if (e.props.category === 'wall') {
            this.dragWall = true;
            this.lastWallCell = this.hover.y * this.n + this.hover.x;
          } else if (!p.event.shiftKey) this.cancelMode();
        }
        this.drawGhost();
        return;
      }
      if (this.mode.kind === 'rally') {
        this.setRally(this.mode.id, g.x, g.y);
        return;
      }
      if (this.mode.kind === 'spell') {
        this.castSpell(this.mode.id, g.x, g.y);
        return;
      }
      if (this.mode.kind === 'move') {
        this.doMove();
        return;
      }
      this.pick(w.x, w.y);
    });
    this.input.on('pointerup', () => {
      this.dragWall = false;
    });
    this.input.keyboard?.on('keydown-ESC', () => this.cancelMode());
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      const k = ev.key.toUpperCase();
      if (k === 'R' && (this.mode.kind === 'build' || this.mode.kind === 'move')) return this.rotateGhost();
      if (k === ' ') return this.setSpeed(this.speed === 0 ? 1 : 0);
      const sp = SPELLS.find((x) => x.key === k);
      if (sp) return this.startSpell(sp.id);
      if (/^[1-9]$/.test(k)) this.ui.hotkey(Number(k) - 1);
      if (k === 'TAB') {
        ev.preventDefault();
        this.ui.nextCat();
      }
    });
  }

  rotateGhost() {
    if (this.mode.kind === 'move') {
      const b = this.bld.get(this.mode.id);
      if (b?.e.props.category !== 'gate') return;
      this.mode = { ...this.mode, w: this.mode.h, h: this.mode.w };
      return this.drawMoveGhost();
    }
    if (this.mode.kind !== 'build') return;
    this.mode = { ...this.mode, w: this.mode.h, h: this.mode.w };
    this.drawGhost();
  }

  pick(wx: number, wy: number) {
    // quái / lính (bấm vào thân)
    const gp = grid(wx, wy + 16);
    let bu: Unit | null = null;
    let bd = 0.7;
    for (const u of this.units) {
      if (!u.alive) continue;
      const d = dist(u.x, u.y, gp.x, gp.y) - (u.size > 1 ? 0.4 : 0);
      if (d < bd) {
        bd = d;
        bu = u;
      }
    }
    if (bu) return this.select({ kind: 'unit', u: bu });
    // ưu tiên công trình vẽ phía trước (theo điểm ảnh)
    const list = [...this.bld.values()].sort((a, b) => b.sprite.depth - a.sprite.depth);
    for (const b of list) {
      const s = b.sprite;
      const bounds = s.getBounds();
      if (!bounds.contains(wx, wy)) continue;
      const lx = (wx - bounds.x) / s.scaleX;
      const ly = (wy - bounds.y) / s.scaleY;
      const a = this.textures.getPixelAlpha(Math.floor(lx), Math.floor(ly), s.texture.key);
      if (a > 20) {
        this.select({ kind: 'building', id: b.s.id });
        return;
      }
    }
    const g = grid(wx, wy);
    const x = Math.floor(g.x);
    const y = Math.floor(g.y);
    const b = this.bAt(x, y);
    if (b) return this.select({ kind: 'building', id: b.s.id });
    const cell = y * this.n + x;
    const d = this.decoMap.get(cell);
    if (d && get('decoration', d.d.key)?.props.clearable) return this.select({ kind: 'deco', cell });
    this.select(null);
  }

  select(sel: GameScene['selected']) {
    this.selected = sel;
    if (sel?.kind === 'building') {
      const b = this.bld.get(sel.id);
      if (b && b.s.stored >= 1 && this.active(b)) this.collect(b.s.id);
    }
    this.ui.refresh(true);
  }

  cancelMode() {
    if (this.mode.kind === 'none' && this.selected) this.selected = null;
    this.mode = { kind: 'none' };
    this.ghost?.destroy();
    this.ghost = undefined;
    this.ghostG.clear();
    this.dragWall = false;
    this.ui.refresh(true);
  }

  /* ================= Xây dựng ================= */

  countOf(key: string) {
    return this.s.buildings.filter((b) => b.key === key).length;
  }

  canBuildMore(e: Entity) {
    const max = Number(e.props.maxCount ?? 0);
    return !max || this.countOf(e.key) < max;
  }

  startBuild(key: string) {
    const e = get('building', key);
    if (!e) return;
    if (!this.canBuildMore(e)) return this.ui.toast(`Đã đạt số lượng tối đa ${e.props.maxCount} ${e.name}`);
    this.selected = null;
    this.mode = { kind: 'build', key, w: Number(e.props.footprintW ?? e.props.size ?? 1), h: Number(e.props.footprintH ?? e.props.size ?? 1) };
    this.ghost?.destroy();
    this.ghost = undefined;
    this.drawGhost();
    this.ui.refresh(true);
  }

  placeCheck(e: Entity, x: number, y: number, w: number, h: number): string | null {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        if (!this.inMap(xx, yy)) return 'Ngoài bản đồ';
        const t = this.terrainAt(xx, yy);
        if (t && t.props.buildable === false && !(t.props.layer === 'road' && ['wall', 'gate'].includes(e.props.category))) return `Không xây được trên ${t.name}`;
        if (this.bAt(xx, yy)) return 'Ô đã có công trình';
        if (this.decoBlocks(xx, yy)) return 'Cần dọn cây/đá trước';
        if (this.s.spawns.some((s) => Math.abs(s.x - xx) <= 1 && Math.abs(s.y - yy) <= 1)) return 'Quá gần cổng quái';
        if (this.units.some((u) => u.team === 'enemy' && u.alive && Math.floor(u.x) === xx && Math.floor(u.y) === yy)) return 'Có quái đứng đây';
      }
    return null;
  }

  drawGhost() {
    if (this.mode.kind !== 'build') return;
    const { key, w, h } = this.mode;
    const e = get('building', key)!;
    const x = this.hover.x - Math.floor((w - 1) / 2);
    const y = this.hover.y - Math.floor((h - 1) / 2);
    const err = this.placeCheck(e, x, y, w, h);
    const g = this.ghostG;
    g.clear();
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const pts = [iso(xx, yy), iso(xx + 1, yy), iso(xx + 1, yy + 1), iso(xx, yy + 1)].map((p) => new Phaser.Math.Vector2(p.x, p.y));
        g.fillStyle(err ? 0xff1744 : 0x00e676, 0.35).fillPoints(pts, true);
      }
    const cr = Number(lvl(e, 1).stats.coverRadius ?? 0) || Number(lvl(e, 1).stats.attackRange ?? 0);
    if (cr) this.circlePath(g, x + w / 2, y + h / 2, cr, e.props.spawns ? 0x42a5f5 : 0xff7043, 0.08);
    const f = buildingFrame(w, h);
    const tex = buildingTexture(this, e, 1, w, h);
    if (!this.ghost) this.ghost = this.add.image(0, 0, tex).setAlpha(0.6).setDepth(700000);
    this.ghost.setTexture(tex).setOrigin(f.ox / f.W, f.oy / f.H);
    const p = iso(x, y);
    this.ghost.setPosition(p.x, p.y);
    this.ghost.setTint(err ? 0xff8080 : 0xffffff);
    this.ui.hint(err ?? (e.props.category === 'gate' ? 'Nhấn R để xoay cổng · chuột phải / Esc để huỷ' : e.props.category === 'wall' ? 'Kéo chuột để xây cả dãy tường · chuột phải / Esc để huỷ' : 'Bấm để đặt · giữ Shift để đặt nhiều · Esc để huỷ'));
  }

  tryPlaceWallDrag() {
    if (this.mode.kind !== 'build') return;
    const cell = this.hover.y * this.n + this.hover.x;
    if (cell === this.lastWallCell) return;
    this.lastWallCell = cell;
    this.place(this.mode.key, this.hover.x, this.hover.y, true);
  }

  place(key: string, hx: number, hy: number, quiet = false): boolean {
    if (this.mode.kind !== 'build') return false;
    const { w, h } = this.mode;
    const e = get('building', key)!;
    const x = hx - Math.floor((w - 1) / 2);
    const y = hy - Math.floor((h - 1) / 2);
    const err = this.placeCheck(e, x, y, w, h);
    if (err) {
      if (!quiet) this.ui.toast(err);
      return false;
    }
    if (!this.canBuildMore(e)) {
      this.ui.toast(`Đã đạt số lượng tối đa ${e.name}`);
      this.cancelMode();
      return false;
    }
    const cost = lvl(e, 1).cost;
    if (!canAfford(this.s.resources, cost)) {
      this.ui.toast('Không đủ tài nguyên');
      return false;
    }
    pay(this.s.resources, cost);
    // dọn hoa / bụi không chặn
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const c = yy * this.n + xx;
        const d = this.decoMap.get(c);
        if (d) {
          d.img.destroy();
          this.decoMap.delete(c);
          this.s.decorations = this.s.decorations.filter((q) => q !== d.d);
        }
      }
    const bt = Number(lvl(e, 1).stats.buildTimeSec ?? 10) * CFG.BUILD_TIME_SCALE;
    const s: BuildingSave = {
      id: this.s.nextId++,
      key,
      x,
      y,
      w,
      h,
      level: 1,
      ruined: false,
      buildLeft: bt,
      buildTotal: bt,
      upgrading: false,
      troops: 0,
      queue: 0,
      queueProgress: [],
      rally: { x: Number(e.props.rallyX ?? 0), y: Number(e.props.rallyY ?? 0) },
      artifacts: new Array(Number(e.props.artifactSlots ?? 0)).fill(null),
      equipment: {},
      statAlloc: {},
      stored: 0,
    };
    this.s.buildings.push(s);
    const b = this.addBRT(s);
    this.styleBRT(b);
    play('build');
    this.ui.refresh(true);
    return true;
  }

  upgrade(id: number) {
    const b = this.bld.get(id);
    if (!b || b.s.buildLeft > 0 || b.s.ruined) return;
    if (b.s.level >= maxLevel(b.e)) return this.ui.toast('Đã đạt cấp tối đa');
    const th = this.townHall();
    if (b.e.props.category !== 'core' && th && b.s.level >= th.s.level + 1) return this.ui.toast(`Cần nâng Thành chính lên cấp ${b.s.level} trước`);
    const next = lvl(b.e, b.s.level + 1);
    if (!canAfford(this.s.resources, next.cost)) return this.ui.toast('Không đủ tài nguyên');
    pay(this.s.resources, next.cost);
    const bt = Number(next.stats.buildTimeSec ?? 10) * CFG.BUILD_TIME_SCALE;
    b.s.buildLeft = bt;
    b.s.buildTotal = bt;
    b.s.upgrading = true;
    this.ui.refresh(true);
  }

  sell(id: number) {
    const b = this.bld.get(id);
    if (!b || b.e.props.category === 'core') return;
    if (this.phase === 'battle') return this.ui.toast('Không thể dỡ công trình khi đang đánh');
    let refund: Record<string, number> = {};
    for (let l = 1; l <= b.s.level; l++) for (const [k, v] of Object.entries(lvl(b.e, l).cost)) refund[k] = (refund[k] ?? 0) + v;
    for (const k of Object.keys(refund)) refund[k] = Math.floor(refund[k] * (b.s.ruined ? 0.1 : CFG.SELL_REFUND));
    for (const [k, v] of Object.entries(refund)) this.s.resources[k] = (this.s.resources[k] ?? 0) + v;
    for (const u of b.soldiers) {
      u.alive = false;
    }
    this.cleanup();
    for (let y = b.s.y; y < b.s.y + b.s.h; y++) for (let x = b.s.x; x < b.s.x + b.s.w; x++) this.occ[y * this.n + x] = 0;
    this.destroyBRT(b);
    this.bld.delete(id);
    this.s.buildings = this.s.buildings.filter((q) => q.id !== id);
    this.gridVer++;
    this.selected = null;
    this.ui.refresh(true);
  }

  repairCost(b: BRT) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(lvl(b.e, b.s.level).cost)) if (v) out[k] = Math.ceil(v * CFG.REPAIR_COST);
    return out;
  }

  repair(id: number) {
    const b = this.bld.get(id);
    if (!b || !b.s.ruined) return;
    if (this.phase === 'battle' && b.e.props.category !== 'wall') return this.ui.toast('Chỉ sửa được tường khi đang đánh');
    const cost = this.repairCost(b);
    if (!canAfford(this.s.resources, cost)) return this.ui.toast('Không đủ tài nguyên');
    pay(this.s.resources, cost);
    b.s.ruined = false;
    b.hp = b.maxHp;
    this.styleBRT(b);
    this.gridVer++;
    this.spawnGarrison(b);
    this.ui.refresh(true);
  }

  collect(id: number) {
    const b = this.bld.get(id);
    if (!b || !b.e.props.produces) return;
    const k = b.e.props.produces;
    const cap = resourceCap(k, this.s.buildings);
    const room = Math.max(0, cap - (this.s.resources[k] ?? 0));
    const got = Math.floor(Math.min(room, b.s.stored));
    if (got <= 0) {
      if (b.s.stored >= 1) this.ui.toast('Kho đầy! Xây thêm Nhà kho hoặc nâng Thành chính.');
      return;
    }
    this.s.resources[k] = (this.s.resources[k] ?? 0) + got;
    b.s.stored -= got;
    const c = this.centerOf(b);
    this.floatText(c.x, c.y, `+${got} ${get('resource', k)?.name ?? k}`, '#ffffff');
    play('coin');
    this.updateBubble(b, false);
  }

  collectAll() {
    for (const b of this.bld.values()) if (b.e.props.produces && this.active(b) && b.s.stored >= 1) this.collect(b.s.id);
    this.ui.refresh(true);
  }

  /* ================= Lính: tạo, điểm đóng quân, trang bị ================= */

  train(id: number, count = 1) {
    const b = this.bld.get(id);
    if (!b || !b.e.props.spawns || !this.active(b)) return;
    const max = this.maxTroops(b);
    for (let i = 0; i < count; i++) {
      if (b.s.troops + b.s.queue >= max) return this.ui.toast('Nhà đã đủ lính');
      const tk = troopKeyOf(b.s, b.e)!;
      if ((this.s.reserves[tk] ?? 0) > 0) {
        this.s.reserves[tk]--;
        b.s.troops++;
        this.addTrainedSoldier(b);
        continue;
      }
      const cost = lvl(b.e, b.s.level).trainCost;
      if (!canAfford(this.s.resources, cost)) return this.ui.toast('Không đủ tài nguyên để tạo lính');
      pay(this.s.resources, cost);
      b.s.queue++;
    }
    this.ui.refresh(true);
  }

  startRally(id: number) {
    this.mode = { kind: 'rally', id };
    this.ui.hint('Bấm vào bản đồ để đặt điểm đóng quân (trong vùng xanh) · Esc để huỷ');
    this.ui.refresh(true);
  }

  drawRallyGhost(gx: number, gy: number) {
    if (this.mode.kind !== 'rally') return;
    const b = this.bld.get(this.mode.id);
    if (!b) return;
    const r = this.clampedRally(b, gx, gy);
    const c = this.centerOf(b);
    const p = iso(c.x + r.x, c.y + r.y);
    const g = this.ghostG;
    g.clear();
    g.lineStyle(2, 0xffffff, 1).lineBetween(p.x, p.y, p.x, p.y - 26);
    g.fillStyle(0xffffff, 0.8).fillTriangle(p.x, p.y - 26, p.x + 14, p.y - 21, p.x, p.y - 16);
  }

  clampedRally(b: BRT, gx: number, gy: number) {
    const c = this.centerOf(b);
    let r = { x: Math.round((gx - c.x) * 2) / 2, y: Math.round((gy - c.y) * 2) / 2 };
    if (b.e.props.rallyZone === 'territory') {
      const th = this.townHall();
      if (th) {
        const tc = this.centerOf(th);
        const rel = clampRally({ x: c.x + r.x - tc.x, y: c.y + r.y - tc.y }, this.territoryRadius());
        r = { x: tc.x + rel.x - c.x, y: tc.y + rel.y - c.y };
      }
    } else r = clampRally(r, this.coverRadius(b));
    return r;
  }

  setRally(id: number, gx: number, gy: number) {
    const b = this.bld.get(id);
    if (!b) return;
    if (!b.e.props.rallySelectable) return this.ui.toast('Nhà này không cho chọn điểm đóng quân');
    b.s.rally = this.clampedRally(b, gx, gy);
    for (const u of b.soldiers) u.path = null;
    this.mode = { kind: 'none' };
    this.ghostG.clear();
    this.ui.refresh(true);
  }

  resetRally(id: number) {
    const b = this.bld.get(id);
    if (!b) return;
    b.s.rally = { x: 0, y: 0 };
    this.ui.refresh(true);
  }

  allocPoint(id: number, stat: string, delta: number) {
    const b = this.bld.get(id);
    if (!b) return;
    const used = Object.values(b.s.statAlloc).reduce((a, c) => a + c, 0);
    const total = totalStatPoints(b.e, b.s.level);
    if (delta > 0 && used >= total) return;
    const cur = b.s.statAlloc[stat] ?? 0;
    if (delta < 0 && cur <= 0) return;
    b.s.statAlloc[stat] = cur + delta;
    this.restat(b);
    this.ui.refresh(true);
  }

  equippedWhere(itemId: number): BRT | undefined {
    for (const b of this.bld.values()) if (b.s.artifacts.includes(itemId) || Object.values(b.s.equipment).includes(itemId)) return b;
    return undefined;
  }

  unequipEverywhere(itemId: number) {
    for (const b of this.bld.values()) {
      let changed = false;
      b.s.artifacts = b.s.artifacts.map((x) => {
        if (x === itemId) changed = true;
        return x === itemId ? null : x;
      });
      for (const k of Object.keys(b.s.equipment))
        if (b.s.equipment[k] === itemId) {
          b.s.equipment[k] = null;
          changed = true;
        }
      if (changed) this.restat(b);
    }
  }

  setArtifact(id: number, slot: number, itemId: number | null) {
    const b = this.bld.get(id);
    if (!b) return;
    const unlock = slotUnlockLevels(b.e)[slot] ?? 99;
    if (unlock > b.s.level) return this.ui.toast(`Ô này mở ở cấp ${unlock}`);
    if (itemId != null) this.unequipEverywhere(itemId);
    while (b.s.artifacts.length <= slot) b.s.artifacts.push(null);
    b.s.artifacts[slot] = itemId;
    this.restat(b);
    this.ui.refresh(true);
  }

  setEquipment(id: number, slot: string, itemId: number | null) {
    const b = this.bld.get(id);
    if (!b) return;
    if (itemId != null) {
      const it = this.s.items.find((i) => i.id === itemId);
      if (!it || !canEquip(it, b.s)) return this.ui.toast('Không trang bị được cho loại lính này');
      this.unequipEverywhere(itemId);
    }
    b.s.equipment[slot] = itemId;
    this.restat(b);
    this.ui.refresh(true);
  }

  chooseGeneral(id: number, key: string) {
    const b = this.bld.get(id);
    if (!b) return;
    if (b.soldiers.some((u) => u.alive)) return this.ui.toast('Tướng hiện tại còn sống — chỉ đổi được khi nhà đang trống');
    b.s.general = key === b.e.props.spawns ? undefined : key;
    for (const [k, v] of Object.entries(b.s.equipment)) {
      const it = this.s.items.find((i) => i.id === v);
      if (it && !canEquip(it, b.s)) b.s.equipment[k] = null;
    }
    this.restat(b);
    this.ui.refresh(true);
  }

  /* ================= Kho báu: cổ vật & trang bị ================= */

  buyItem(type: 'artifact' | 'equipment', key: string) {
    const e = get(type, key);
    if (!e) return;
    if (e.props.unique && this.s.items.some((i) => i.key === key)) return this.ui.toast('Vật phẩm độc nhất — đã sở hữu');
    const cost = lvl(e, 1).cost;
    if (!canAfford(this.s.resources, cost)) return this.ui.toast('Không đủ tài nguyên');
    pay(this.s.resources, cost);
    this.s.items.push({ id: this.s.nextId++, type, key, level: 1 });
    this.ui.toast(`Đã có ${e.name}`);
    this.ui.refresh(true);
  }

  upgradeItem(itemId: number) {
    const it = this.s.items.find((i) => i.id === itemId);
    const e = it && get(it.type, it.key);
    if (!it || !e) return;
    if (it.level >= maxLevel(e)) return this.ui.toast('Đã tối đa');
    const cost = lvl(e, it.level + 1).cost;
    if (!canAfford(this.s.resources, cost)) return this.ui.toast('Không đủ tài nguyên');
    pay(this.s.resources, cost);
    it.level++;
    const b = this.equippedWhere(itemId);
    if (b) this.restat(b);
    this.ui.refresh(true);
  }

  /* ================= Rương ================= */

  unlockChest(id: number) {
    if (this.s.chests.some((c) => c.unlockLeft != null && c.unlockLeft > 0)) return this.ui.toast('Đang mở khoá một rương khác');
    const c = this.s.chests.find((x) => x.id === id);
    const e = c && get('chest', c.key);
    if (!c || !e) return;
    c.unlockLeft = Number(lvl(e, c.level).stats.unlockTimeSec ?? 60) * CFG.CHEST_TIME_SCALE;
    this.ui.refresh(true);
  }

  skipChest(id: number) {
    const c = this.s.chests.find((x) => x.id === id);
    const e = c && get('chest', c.key);
    if (!c || !e) return;
    const gems = Number(lvl(e, c.level).stats.gemSkipCost ?? 0);
    if ((this.s.resources.gem ?? 0) < gems) return this.ui.toast('Không đủ ngọc');
    this.s.resources.gem -= gems;
    c.unlockLeft = 0;
    this.openChest(id);
  }

  openChest(id: number) {
    const c = this.s.chests.find((x) => x.id === id);
    const e = c && get('chest', c.key);
    if (!c || !e || c.unlockLeft !== 0) return;
    const got: { label: string; amount: number; color?: string }[] = [];
    for (const r of lvl(e, c.level).rewards ?? []) {
      if (Math.random() > (r.chance ?? 1)) continue;
      const amount = Math.round(r.min + Math.random() * Math.max(0, r.max - r.min));
      if (amount <= 0) continue;
      const [kind, key] = String(r.item).split(':');
      if (kind === 'resource') {
        const cap = resourceCap(key, this.s.buildings);
        this.s.resources[key] = Math.min(cap, (this.s.resources[key] ?? 0) + amount);
        got.push({ label: get('resource', key)?.name ?? key, amount, color: get('resource', key)?.props.color });
      } else if (kind === 'troop') {
        this.s.reserves[key] = (this.s.reserves[key] ?? 0) + amount;
        got.push({ label: `${get('troop', key)?.name ?? key} (lính dự bị)`, amount, color: '#64b5f6' });
      } else if (kind === 'artifact' || kind === 'equipment') {
        const ie = get(kind, key);
        if (!ie) continue;
        for (let i = 0; i < amount; i++) this.s.items.push({ id: this.s.nextId++, type: kind, key, level: 1 });
        got.push({ label: ie.name, amount, color: '#ce93d8' });
      } else if (kind === 'chest') {
        if (this.s.chests.length < CFG.CHEST_SLOTS + 1) this.s.chests.push({ id: this.s.nextId++, key, level: 1, unlockLeft: null });
        got.push({ label: get('chest', key)?.name ?? key, amount: 1 });
      }
    }
    this.s.chests = this.s.chests.filter((x) => x.id !== id);
    this.s.stats.chestsOpened++;
    play('chest');
    this.ui.chestResult(e, c.level, got);
    this.persist();
    this.ui.refresh(true);
  }

  /* ================= Cây, đá ================= */

  clearDeco(cell: number) {
    const v = this.decoMap.get(cell);
    const e = v && get('decoration', v.d.key);
    if (!v || !e || !e.props.clearable || v.d.clearing != null) return;
    const t = Number(lvl(e, v.d.level).stats.clearTimeSec ?? 5) * CFG.CLEAR_TIME_SCALE;
    v.d.clearing = t;
    this.ui.refresh(true);
  }

  finishClear(cell: number) {
    const v = this.decoMap.get(cell);
    if (!v) return;
    const e = get('decoration', v.d.key);
    const drop = e?.props.drops;
    const amt = Number(e ? lvl(e, v.d.level).stats.dropAmount ?? 0 : 0);
    if (drop && amt) {
      this.s.resources[drop] = Math.min(resourceCap(drop, this.s.buildings), (this.s.resources[drop] ?? 0) + amt);
      this.floatText(v.d.x + 0.5, v.d.y + 0.5, `+${amt} ${get('resource', drop)?.name ?? drop}`, '#ffffff');
    }
    v.img.destroy();
    this.decoMap.delete(cell);
    this.s.decorations = this.s.decorations.filter((d) => d !== v.d);
    this.s.stats.cleared++;
    play('coin');
    this.gridVer++;
    if (this.selected?.kind === 'deco' && this.selected.cell === cell) this.selected = null;
    this.ui.refresh(true);
  }

  /* ================= Phép ================= */

  spellReady(id: string) {
    return (this.spellCd[id] ?? 0) <= this.t;
  }

  startSpell(id: string) {
    const sp = SPELLS.find((x) => x.id === id);
    if (!sp) return;
    if (this.phase !== 'battle') return this.ui.toast('Chỉ dùng phép khi đang có quái tấn công');
    if (!this.spellReady(id)) return this.ui.toast('Phép đang hồi');
    if (!canAfford(this.s.resources, sp.cost)) return this.ui.toast('Không đủ tài nguyên');
    if (sp.radius) {
      this.mode = { kind: 'spell', id };
      this.ui.hint(`Bấm vào bản đồ để dùng ${sp.name} · Esc để huỷ`);
      this.ui.refresh(true);
    } else this.castSpell(id, 0, 0);
  }

  castSpell(id: string, gx: number, gy: number) {
    const sp = SPELLS.find((x) => x.id === id)!;
    if (!canAfford(this.s.resources, sp.cost)) return this.ui.toast('Không đủ tài nguyên');
    pay(this.s.resources, sp.cost);
    this.spellCd[id] = this.t + sp.cd;
    this.s.stats.spellsCast++;
    const enemies = this.units.filter((u) => u.team === 'enemy' && u.alive);
    switch (id) {
      case 'meteor': {
        const p = iso(gx, gy);
        const rock = this.add.circle(p.x, p.y - 400, 16, 0xff7043).setStrokeStyle(4, 0xffd54a).setDepth(950000);
        this.tweens.add({ targets: rock, y: p.y, duration: 450, onComplete: () => rock.destroy() });
        this.after(0.45, () => {
          {
            rock.destroy();
            play('spell');
            this.cameras.main.shake(250, 0.008);
            this.ringFx(gx, gy, sp.radius!, 0xff5722);
            this.puff(gx, gy, 0xff7043, 22);
            for (const e of this.units)
              if (e.team === 'enemy' && e.alive && dist(e.x, e.y, gx, gy) <= sp.radius!) {
                if (e.ent.props.role !== 'boss') e.stunUntil = this.t + 1.5;
                this.damage(null, e, 300, false);
              }
          }
        });
        break;
      }
      case 'freeze':
        play('spell');
        this.ringFx(gx, gy, sp.radius!, 0x80d8ff);
        for (const e of enemies)
          if (dist(e.x, e.y, gx, gy) <= sp.radius!) {
            e.slowPct = 60;
            e.slowUntil = this.t + 5;
          }
        break;
      case 'heal':
        play('skill');
        for (const u of this.units)
          if (u.team === 'ally' && u.alive) {
            u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.6);
            this.floatText(u.x, u.y, '+', '#69f0ae', 16);
          }
        for (const b of this.bld.values()) if (!b.s.ruined) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.25);
        break;
      case 'warcry':
        play('horn');
        this.warcryUntil = this.t + 12;
        this.ui.banner('Xung phong!', 'Toàn quân +35% sát thương và tốc chạy');
        break;
    }
    if (this.mode.kind === 'spell') this.mode = { kind: 'none' };
    this.ghostG.clear();
    this.ui.refresh(true);
  }

  drawSpellGhost(gx: number, gy: number) {
    if (this.mode.kind !== 'spell') return;
    const id = this.mode.id;
    const sp = SPELLS.find((x) => x.id === id);
    this.ghostG.clear();
    if (sp?.radius) this.circlePath(this.ghostG, gx, gy, sp.radius, sp.id === 'freeze' ? 0x80d8ff : 0xff5722, 0.2);
  }

  /* ================= Di chuyển công trình ================= */

  startMove(id: number) {
    const b = this.bld.get(id);
    if (!b) return;
    if (this.phase === 'battle') return this.ui.toast('Không thể di chuyển khi đang đánh');
    this.mode = { kind: 'move', id, w: b.s.w, h: b.s.h };
    this.ui.hint('Bấm vào chỗ mới để chuyển công trình · R để xoay (cổng) · Esc để huỷ');
    this.drawMoveGhost();
    this.ui.refresh(true);
  }

  moveTarget() {
    if (this.mode.kind !== 'move') return null;
    const { w, h, id } = this.mode;
    const b = this.bld.get(id)!;
    const x = this.hover.x - Math.floor((w - 1) / 2);
    const y = this.hover.y - Math.floor((h - 1) / 2);
    // tạm bỏ chỗ cũ để kiểm tra
    for (let yy = b.s.y; yy < b.s.y + b.s.h; yy++) for (let xx = b.s.x; xx < b.s.x + b.s.w; xx++) this.occ[yy * this.n + xx] = 0;
    const err = this.placeCheck(b.e, x, y, w, h);
    for (let yy = b.s.y; yy < b.s.y + b.s.h; yy++) for (let xx = b.s.x; xx < b.s.x + b.s.w; xx++) this.occ[yy * this.n + xx] = id;
    return { b, x, y, w, h, err };
  }

  drawMoveGhost() {
    const m = this.moveTarget();
    if (!m) return;
    const g = this.ghostG;
    g.clear();
    for (let yy = m.y; yy < m.y + m.h; yy++)
      for (let xx = m.x; xx < m.x + m.w; xx++) {
        const pts = [iso(xx, yy), iso(xx + 1, yy), iso(xx + 1, yy + 1), iso(xx, yy + 1)].map((p) => new Phaser.Math.Vector2(p.x, p.y));
        g.fillStyle(m.err ? 0xff1744 : 0x00e676, 0.35).fillPoints(pts, true);
      }
    const cr = this.coverRadius(m.b) || Number(lvl(m.b.e, m.b.s.level).stats.attackRange ?? 0);
    if (cr) this.circlePath(g, m.x + m.w / 2, m.y + m.h / 2, cr, 0x42a5f5, 0.08);
    if (m.err) this.ui.hint(m.err);
  }

  doMove() {
    const m = this.moveTarget();
    if (!m) return;
    if (m.err) return this.ui.toast(m.err);
    const { b } = m;
    for (let yy = b.s.y; yy < b.s.y + b.s.h; yy++) for (let xx = b.s.x; xx < b.s.x + b.s.w; xx++) this.occ[yy * this.n + xx] = 0;
    b.s.x = m.x;
    b.s.y = m.y;
    b.s.w = m.w;
    b.s.h = m.h;
    for (let yy = b.s.y; yy < b.s.y + b.s.h; yy++) for (let xx = b.s.x; xx < b.s.x + b.s.w; xx++) this.occ[yy * this.n + xx] = b.s.id;
    b.bubble?.destroy();
    b.bubble = undefined;
    this.refreshBRT(b);
    this.gridVer++;
    for (const u of b.soldiers) u.path = null;
    play('build');
    this.mode = { kind: 'none' };
    this.ghostG.clear();
    this.ui.refresh(true);
  }

  /** Nâng cấp mọi công trình cùng loại & cùng cấp (vd. tất cả tường) đến khi hết tài nguyên */
  upgradeAll(id: number) {
    const b0 = this.bld.get(id);
    if (!b0) return;
    let n = 0;
    const lv = b0.s.level;
    for (const b of this.bld.values()) {
      if (b.s.key !== b0.s.key || b.s.level !== lv || b.s.buildLeft > 0 || b.s.ruined || b.s.level >= maxLevel(b.e)) continue;
      const next = lvl(b.e, b.s.level + 1);
      if (!canAfford(this.s.resources, next.cost)) break;
      this.upgrade(b.s.id);
      if (b.s.upgrading) n++;
    }
    this.ui.toast(n ? `Đang nâng cấp ${n} ${b0.e.name}` : 'Không nâng cấp được (thiếu tài nguyên hoặc cần nâng Thành chính)');
  }

  repairAll() {
    let n = 0;
    for (const b of this.bld.values())
      if (b.s.ruined && canAfford(this.s.resources, this.repairCost(b)) && (this.phase !== 'battle' || b.e.props.category === 'wall')) {
        this.repair(b.s.id);
        n++;
      }
    this.ui.toast(n ? `Đã sửa ${n} công trình` : 'Không có gì để sửa hoặc không đủ tài nguyên');
  }

  ruinedCount() {
    let n = 0;
    for (const b of this.bld.values()) if (b.s.ruined) n++;
    return n;
  }

  /* ================= Nhiệm vụ ================= */

  claimQuest(id: string) {
    const q = QUESTS.find((x) => x.id === id);
    if (!q || this.s.quests.includes(id) || q.progress(this) < q.target) return;
    this.s.quests.push(id);
    for (const [k, v] of Object.entries(q.reward)) {
      const [kind, key] = k.split(':');
      if (kind === 'resource') this.s.resources[key] = Math.min(resourceCap(key, this.s.buildings), (this.s.resources[key] ?? 0) + v);
      else if (kind === 'chest' && get('chest', key)) for (let i = 0; i < v; i++) this.s.chests.push({ id: this.s.nextId++, key, level: 1, unlockLeft: null });
    }
    play('chest');
    this.ui.toast(`Hoàn thành: ${q.text}`);
    this.persist();
    this.ui.refresh(true);
  }

  /** Phủ màu bầu trời theo biến cố (đêm, trăng máu) */
  setTint(color: number | null) {
    if (!this.tintRect) {
      const n = this.n;
      this.tintRect = this.add.rectangle(0, (n * TH) / 2, n * TW + 600, n * TH + 800, 0x000000, 0).setDepth(899000);
    }
    this.tweens.add({ targets: this.tintRect, fillAlpha: color == null ? 0 : 0.28, duration: 1200 });
    if (color != null) this.tintRect.fillColor = color;
  }

  /* ================= Thương nhân ================= */

  maybeMerchant(n: number) {
    this.s.merchant = null;
    if (n < 2 || Math.random() > 0.45) return;
    const basic = ['gold', 'wood', 'stone', 'food'].filter((k) => get('resource', k));
    const offers: NonNullable<SaveState['merchant']>['offers'] = [];
    const amt = (base: number) => Math.round((base * (1 + n * 0.15)) / 10) * 10;
    for (let i = 0; i < 2 && basic.length > 1; i++) {
      const a = basic[Math.floor(Math.random() * basic.length)];
      let b = a;
      while (b === a) b = basic[Math.floor(Math.random() * basic.length)];
      const give = amt(200);
      offers.push({ give: { [a]: give }, get: { [b]: Math.round(give * (0.8 + Math.random() * 0.4)) } });
    }
    if (get('resource', 'gem')) offers.push({ give: { gold: amt(400) }, get: { gem: 3 + Math.floor(n / 4) } });
    const troopKeys = this.s.buildings.map((b) => get('building', b.key)?.props.spawns).filter((k) => k && get('troop', k)?.props.unitClass !== 'general');
    if (troopKeys.length) {
      const k = troopKeys[Math.floor(Math.random() * troopKeys.length)];
      offers.push({ give: { gold: amt(150) }, get: { ['troop:' + k]: 2 } });
    }
    this.s.merchant = { wave: n, offers };
    this.time.delayedCall(2800, () => this.ui.toast('🐪 Một thương nhân vừa ghé thành! Bấm nút Thương nhân để xem hàng.', 4000));
  }

  trade(i: number) {
    const m = this.s.merchant;
    const o = m?.offers[i];
    if (!o || o.used) return;
    if (!canAfford(this.s.resources, o.give)) return this.ui.toast('Không đủ tài nguyên');
    pay(this.s.resources, o.give);
    for (const [k, v] of Object.entries(o.get)) {
      if (k.startsWith('troop:')) {
        const t = k.slice(6);
        this.s.reserves[t] = (this.s.reserves[t] ?? 0) + v;
      } else this.s.resources[k] = Math.min(resourceCap(k, this.s.buildings), (this.s.resources[k] ?? 0) + v);
    }
    o.used = true;
    play('coin');
    this.ui.refresh(true);
  }

  /* ================= Hiệu ứng khói ================= */

  puff(x: number, y: number, color: number, count = 7) {
    const p = iso(x, y);
    for (let i = 0; i < count; i++) {
      const c = this.add.circle(p.x, p.y - 12, 3 + Math.random() * 4, color, 0.9).setDepth(940000);
      const a = Math.random() * Math.PI * 2;
      const d = 10 + Math.random() * 18;
      this.tweens.add({ targets: c, x: p.x + Math.cos(a) * d, y: p.y - 12 + Math.sin(a) * d * 0.5 - 10, alpha: 0, scale: 0.3, duration: 450 + Math.random() * 250, onComplete: () => c.destroy() });
    }
  }

  /* ================= Lưu / tải ================= */

  persist() {
    for (const b of this.bld.values()) {
      if (!b.e.props.spawns) continue;
      b.s.troops = b.soldiers.filter((u) => u.alive).length + 0;
      b.s.troopHp = b.soldiers.filter((u) => u.alive).map((u) => Math.round(u.hp));
    }
    saveGame(this.s);
  }

  setSpeed(n: number) {
    this.speed = n;
    this.tweens.timeScale = Math.max(0.0001, n);
    this.time.timeScale = Math.max(0.0001, n);
    this.ui.refresh(true);
  }

  callWave() {
    if (this.phase === 'build') this.startWave();
  }

  newGame(difficulty = this.s?.difficulty ?? 1) {
    clearSave();
    this.s = newState(undefined, difficulty);
    this.restart();
  }

  retryWave() {
    const b = loadWaveBackup();
    if (!b) return this.newGame();
    this.s = b;
    this.s.prepLeft = 20;
    this.restart();
  }

  restart() {
    this.phase = 'build';
    this.spawnQueue = [];
    this.spellCd = {};
    this.warcryUntil = 0;
    for (const s of this.shots) s.g.destroy();
    this.shots = [];
    this.pending = [];
    this.curMod = null;
    this.tintRect?.setFillStyle(0x000000, 0);
    this.selected = null;
    this.mode = { kind: 'none' };
    this.ghost?.destroy();
    this.ghost = undefined;
    this.ghostG.clear();
    this.n = Math.round(Math.sqrt(this.s.terrain.length));
    this.buildWorld();
    this.fitCamera();
    this.persist();
    this.setSpeed(1);
    this.ui.refresh(true);
  }

  itemsOf(type: 'artifact' | 'equipment'): Item[] {
    return this.s.items.filter((i) => i.type === type);
  }
}
