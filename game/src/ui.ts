import { buildingTexture, chestIcon, textureDataURL, unitTexture } from './art';
import { all, dataSource, effectText, Entity, get, lvl, maxLevel, parseKV, STAT_LABEL } from './data';
import type { GameScene, BRT } from './GameScene';
import { canAfford, CFG, costText, Item, resourceCap } from './state';
import { SPELLS } from './GameScene';
import { claimable, QUESTS, rewardText } from './quests';
import { isMuted, play, toggleMute } from './sfx';
import { canEquip, equipSlotsOf, isGeneralHall, roleMatches, slotUnlockLevels, totalStatPoints, troopKeyOf } from './stats';

const RES_ICON: Record<string, string> = { gold: '🪙', wood: '🪵', stone: '🪨', food: '🌾', gem: '💎' };
const SLOT_LABEL: Record<string, string> = { weapon: 'Vũ khí', armor: 'Giáp', helmet: 'Mũ', boots: 'Giày', ring: 'Nhẫn' };
const RARITY: Record<string, string> = { common: 'Thường', rare: 'Hiếm', epic: 'Sử thi', legendary: 'Huyền thoại', premium: 'Cao cấp' };
const CATS: { id: string; label: string; match: (e: Entity) => boolean }[] = [
  { id: 'military', label: '⚔️ Quân sự', match: (e) => e.props.category === 'military' },
  { id: 'defense', label: '🛡️ Phòng thủ', match: (e) => ['defense', 'wall', 'gate'].includes(e.props.category) },
  { id: 'economy', label: '🌾 Kinh tế', match: (e) => ['economy', 'storage'].includes(e.props.category) },
];

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(Math.floor(n)));
const secs = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.ceil(s)}s`);
const statNum = (v: number) => (Math.abs(v - Math.round(v)) < 0.01 ? String(Math.round(v)) : v.toFixed(2).replace(/0+$/, ''));

function costHtml(res: Record<string, number>, cost: Record<string, number> | undefined) {
  if (!cost) return '';
  return Object.entries(cost)
    .filter(([, v]) => v)
    .map(([k, v]) => `<span class="cost ${(res[k] ?? 0) < v ? 'lack' : ''}">${RES_ICON[k] ?? '•'}${fmt(v)}</span>`)
    .join(' ');
}

export class UI {
  sc!: GameScene;
  root = document.getElementById('ui')!;
  top = el('div', 'top');
  chests = el('div', 'chests');
  bar = el('div', 'buildbar');
  spells = el('div', 'spells');
  panel = el('div', 'panel');
  hintEl = el('div', 'hint');
  toastEl = el('div', 'toasts');
  modal = el('div', 'modal hidden');
  bannerEl = el('div', 'banner hidden');
  cat = 'military';
  last: Record<string, string> = {};
  hintT = 0;

  constructor() {
    this.root.append(this.top, this.chests, this.bar, this.spells, this.panel, this.hintEl, this.toastEl, this.bannerEl, this.modal);
    this.root.addEventListener('pointerdown', (ev) => {
      const t = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!t || t.classList.contains('disabled')) return;
      ev.preventDefault();
      play('click');
      this.act(t.dataset.act!, t.dataset);
    });
  }

  bind(sc: GameScene) {
    this.sc = sc;
  }

  set(elm: HTMLElement, key: string, html: string) {
    if (this.last[key] === html) return;
    this.last[key] = html;
    elm.innerHTML = html;
  }

  /* ---------- hành động ---------- */
  act(a: string, d: DOMStringMap) {
    const sc = this.sc;
    const id = Number(d.id);
    switch (a) {
      case 'cat':
        this.cat = d.cat!;
        break;
      case 'build':
        if (sc.mode.kind === 'build' && sc.mode.key === d.key) sc.cancelMode();
        else sc.startBuild(d.key!);
        break;
      case 'cancel':
        sc.cancelMode();
        break;
      case 'rotate':
        sc.rotateGhost();
        break;
      case 'upgrade':
        sc.upgrade(id);
        break;
      case 'sell':
        this.confirm('Dỡ công trình này? Bạn nhận lại 50% tài nguyên (10% nếu đã bị phá).', () => sc.sell(id));
        break;
      case 'repair':
        sc.repair(id);
        break;
      case 'collect':
        sc.collect(id);
        break;
      case 'collectAll':
        sc.collectAll();
        break;
      case 'train':
        sc.train(id, Number(d.n ?? 1));
        break;
      case 'rally':
        sc.startRally(id);
        break;
      case 'rallyReset':
        sc.resetRally(id);
        break;
      case 'pt':
        sc.allocPoint(id, d.stat!, Number(d.delta));
        break;
      case 'artSlot':
        this.pickItem('artifact', id, Number(d.slot));
        break;
      case 'eqSlot':
        this.pickItem('equipment', id, d.slot!);
        break;
      case 'general':
        sc.chooseGeneral(id, d.key!);
        break;
      case 'close':
        sc.select(null);
        break;
      case 'clear':
        sc.clearDeco(Number(d.cell));
        break;
      case 'wave':
        sc.callWave();
        break;
      case 'speed':
        sc.setSpeed(Number(d.n));
        break;
      case 'chest': {
        const c = sc.s.chests.find((x) => x.id === id);
        if (!c) break;
        if (c.unlockLeft === 0) sc.openChest(id);
        else if (c.unlockLeft == null) sc.unlockChest(id);
        break;
      }
      case 'skip':
        sc.skipChest(id);
        break;
      case 'treasury':
        this.treasury(d.tab as any);
        return;
      case 'buy':
        sc.buyItem(d.type as any, d.key!);
        this.treasury(d.type as any);
        return;
      case 'itemUp':
        sc.upgradeItem(id);
        this.treasury(d.type as any);
        return;
      case 'menu':
        this.menu();
        return;
      case 'modalClose':
        this.closeModal();
        return;
      case 'newGame':
        this.closeModal();
        sc.newGame();
        return;
      case 'retry':
        this.closeModal();
        sc.retryWave();
        return;
      case 'help':
        this.help();
        return;
      case 'spell':
        sc.startSpell(d.spell!);
        break;
      case 'move':
        sc.startMove(id);
        break;
      case 'upAll':
        sc.upgradeAll(id);
        break;
      case 'repairAll':
        sc.repairAll();
        break;
      case 'quests':
        this.quests();
        return;
      case 'claim':
        sc.claimQuest(d.q!);
        this.quests();
        return;
      case 'mute':
        toggleMute();
        break;
      case 'diff':
        this.closeModal();
        sc.newGame(Number(d.v));
        this.toast('Xây dựng phòng thủ trước khi đợt quái đầu tiên tới! Quái đến từ các cổng đỏ ở mép bản đồ. Bấm ❔ để xem cách chơi.', 7000);
        return;
      case 'newGamePick':
        this.difficultyPicker();
        return;
    }
    this.refresh(true);
  }

  /* ---------- vẽ lại ---------- */
  refresh(_force = false) {
    if (!this.sc?.s) return;
    this.renderTop();
    this.renderChests();
    this.renderBuildBar();
    this.renderSpells();
    this.renderPanel();
    if (this.hintT && performance.now() > this.hintT) {
      this.hintT = 0;
      this.hintEl.classList.remove('show');
    }
    if (this.sc.mode.kind === 'none' && !this.hintT) this.hintEl.classList.remove('show');
  }

  renderTop() {
    const s = this.sc.s;
    const res = all('resource')
      .map((r) => {
        const cap = resourceCap(r.key, s.buildings);
        const v = s.resources[r.key] ?? 0;
        return `<div class="res" title="${esc(r.name)}"><span class="ico">${RES_ICON[r.key] ?? '•'}</span><b>${fmt(v)}</b>${isFinite(cap) ? `<small>/${fmt(cap)}</small>` : ''}<i style="width:${isFinite(cap) ? Math.min(100, (v / cap) * 100) : 0}%;background:${esc(r.props.color)}"></i></div>`;
      })
      .join('');
    const sc = this.sc;
    const enemies = sc.units.filter((u) => u.team === 'enemy' && u.alive).length + sc.spawnQueue.length;
    const wave =
      sc.phase === 'battle'
        ? `<div class="wave battle">⚔️ Đợt ${s.wave + 1} <small>còn ${enemies} quái</small></div>`
        : `<div class="wave">${this.wavePreview()}🛡️ Đợt ${s.wave + 1} sau <b>${secs(Math.max(0, s.prepLeft))}</b> <button class="btn red" data-act="wave">Gọi quái ngay</button></div>`;
    const qn = claimable(sc).length;
    const ruined = sc.ruinedCount();
    const speeds = [0, 1, 2, 3].map((n) => `<button class="btn sm ${sc.speed === n ? 'on' : ''}" data-act="speed" data-n="${n}">${n === 0 ? '⏸' : `${n}x`}</button>`).join('');
    const ready = [...sc.bld.values()].some((b) => b.e.props.produces && b.s.stored >= Math.max(10, Number(lvl(b.e, b.s.level).stats.capacity ?? 1000) * 0.15) && sc.active(b));
    this.set(
      this.top,
      'top',
      `<div class="resbar">${res}${ready ? '<button class="btn sm green" data-act="collectAll">Thu hoạch tất cả</button>' : ''}</div>${wave}<div class="tools">${speeds}${ruined ? `<button class="btn sm red" data-act="repairAll">🔧 Sửa ${ruined}</button>` : ''}<button class="btn sm ${qn ? 'gold' : ''}" data-act="quests">📜 Nhiệm vụ${qn ? ` <span class="badge">${qn}</span>` : ''}</button><button class="btn sm" data-act="treasury" data-tab="artifact">💠 Kho báu</button><button class="btn sm" data-act="mute">${isMuted() ? '🔇' : '🔊'}</button><button class="btn sm" data-act="help">❔</button><button class="btn sm" data-act="menu">☰</button></div>`,
    );
  }

  renderChests() {
    const s = this.sc.s;
    let html = '<div class="ttl">Rương</div>';
    for (let i = 0; i < CFG.CHEST_SLOTS; i++) {
      const c = s.chests[i];
      const e = c && get('chest', c.key);
      if (!c || !e) {
        html += '<div class="chest empty">Trống</div>';
        continue;
      }
      const st = lvl(e, c.level).stats;
      let state = '';
      if (c.unlockLeft == null) state = `<small>Bấm mở khoá · ${secs(Number(st.unlockTimeSec ?? 60) * CFG.CHEST_TIME_SCALE)}</small>`;
      else if (c.unlockLeft > 0) state = `<small class="tm">⏳ ${secs(c.unlockLeft)}</small><button class="btn xs" data-act="skip" data-id="${c.id}">💎${st.gemSkipCost ?? 0}</button>`;
      else state = '<small class="ready">MỞ!</small>';
      html += `<div class="chest ${c.unlockLeft === 0 ? 'glow' : ''}" data-act="chest" data-id="${c.id}"><img src="${chestIcon(e)}"><div><b>${esc(e.name)}</b> <span class="lv">Lv${c.level}</span><br>${state}</div></div>`;
    }
    const reserves = Object.entries(s.reserves).filter(([, v]) => v > 0);
    if (reserves.length) html += `<div class="reserve">Lính dự bị: ${reserves.map(([k, v]) => `${esc(get('troop', k)?.name ?? k)} ×${v}`).join(', ')}</div>`;
    this.set(this.chests, 'chests', html);
  }

  wavePreview() {
    const sc = this.sc;
    const w = sc.waveMonsters(sc.s.wave + 1);
    const items = w.list.map((g) => `${esc(g.e.name)}×${g.count}`).join(', ');
    const boss = w.list.some((g) => g.e.props.role === 'boss');
    return `<span class="preview" title="Cấp quái ${w.level} · ${sc.activeSpawns()} cổng">${boss ? '👑 ' : ''}${items} · Lv${w.level}</span>`;
  }

  renderSpells() {
    const sc = this.sc;
    const battle = sc.phase === 'battle';
    const html = SPELLS.map((sp) => {
      const left = Math.max(0, (sc.spellCd[sp.id] ?? 0) - sc.t);
      const ok = battle && left <= 0 && canAfford(sc.s.resources, sp.cost);
      const on = sc.mode.kind === 'spell' && sc.mode.id === sp.id;
      return `<div class="spell ${ok ? '' : 'disabled'} ${on ? 'on' : ''}" data-act="spell" data-spell="${sp.id}" title="${esc(sp.name)}: ${esc(sp.desc)} (phím ${sp.key})"><span class="ic">${sp.icon}</span><small>${costHtml(sc.s.resources, sp.cost)}</small>${left > 0 ? `<i class="cd">${Math.ceil(left)}</i>` : ''}<kbd>${sp.key}</kbd></div>`;
    }).join('');
    this.spells.classList.toggle('dim', !battle);
    this.set(this.spells, 'spells', `<div class="ttl">Phép ${battle ? '' : '<small>(dùng khi có quái)</small>'}</div>${html}`);
  }

  hotkey(i: number) {
    const cat = CATS.find((c) => c.id === this.cat)!;
    const e = all('building').filter((x) => cat.match(x))[i];
    if (e) this.act('build', { key: e.key } as any);
  }

  nextCat() {
    const i = CATS.findIndex((c) => c.id === this.cat);
    this.cat = CATS[(i + 1) % CATS.length].id;
    this.refresh(true);
  }

  quests() {
    const sc = this.sc;
    const rows = QUESTS.map((q) => {
      const done = sc.s.quests.includes(q.id);
      const p = Math.min(q.target, q.progress(sc));
      const ready = !done && p >= q.target;
      return `<div class="quest ${done ? 'done' : ''} ${ready ? 'ready' : ''}"><div><b>${esc(q.text)}</b><div class="sub">Thưởng: ${esc(rewardText(q.reward))}</div><div class="prog"><i style="width:${(p / q.target) * 100}%"></i></div></div><div>${done ? '✅' : ready ? `<button class="btn sm gold" data-act="claim" data-q="${q.id}">Nhận</button>` : `<small>${Math.floor(p)}/${q.target}</small>`}</div></div>`;
    });
    const order = (h: string) => (h.includes('ready') ? 0 : h.includes('done') ? 2 : 1);
    rows.sort((a, b) => order(a) - order(b));
    this.openModal(`<h2>📜 Nhiệm vụ & thành tựu</h2><div class="quests">${rows.join('')}</div><div class="row"><button class="btn" data-act="modalClose">Đóng</button></div>`);
  }

  difficultyPicker() {
    this.openModal(`<h2>⚔️ Lập thành mới</h2><p class="sub">Chọn độ khó. Bản đồ được tạo ngẫu nhiên.</p>
      <div class="diffs">
        <div class="diff" data-act="diff" data-v="0.75"><b>🌱 Dễ</b><small>Quái yếu hơn 25%, tài nguyên khởi đầu ×1.5</small></div>
        <div class="diff" data-act="diff" data-v="1"><b>⚔️ Thường</b><small>Cân bằng theo dữ liệu admin</small></div>
        <div class="diff" data-act="diff" data-v="1.35"><b>💀 Khó</b><small>Quái mạnh hơn 35%, tài nguyên khởi đầu ×0.8</small></div>
      </div>`);
  }

  renderBuildBar() {
    const sc = this.sc;
    const s = sc.s;
    const tabs = CATS.map((c) => `<button class="tab ${this.cat === c.id ? 'on' : ''}" data-act="cat" data-cat="${c.id}">${c.label}</button>`).join('');
    const cat = CATS.find((c) => c.id === this.cat)!;
    const cards = all('building')
      .filter((e) => cat.match(e))
      .map((e) => {
        const w = Number(e.props.footprintW ?? 1);
        const h = Number(e.props.footprintH ?? 1);
        const icon = textureDataURL(sc, buildingTexture(sc, e, 1, w, h));
        const max = Number(e.props.maxCount ?? 0);
        const cnt = sc.countOf(e.key);
        const full = max > 0 && cnt >= max;
        const cost = lvl(e, 1).cost;
        const ok = canAfford(s.resources, cost) && !full;
        const on = sc.mode.kind === 'build' && sc.mode.key === e.key;
        return `<div class="card ${ok ? '' : 'disabled'} ${on ? 'on' : ''}" data-act="build" data-key="${e.key}" title="${esc(e.description)}"><img src="${icon}"><b>${esc(e.name)}</b><div class="costs">${costHtml(s.resources, cost)}</div><small>${max ? `${cnt}/${max}` : `${w}×${h}`}</small></div>`;
      })
      .join('');
    const cancel = sc.mode.kind !== 'none' ? `<button class="btn sm red cancel" data-act="cancel">✕ Huỷ ${sc.mode.kind === 'rally' ? 'chọn điểm' : 'xây'}</button>${sc.mode.kind === 'build' && get('building', sc.mode.key)?.props.category === 'gate' ? '<button class="btn sm" data-act="rotate">⟳ Xoay</button>' : ''}` : '';
    this.set(this.bar, 'bar', `<div class="tabs">${tabs}${cancel}</div><div class="cards">${cards}</div>`);
  }

  renderPanel() {
    const sc = this.sc;
    const sel = sc.selected;
    let html = '';
    if (sel?.kind === 'building') {
      const b = sc.bld.get(sel.id);
      if (b) html = this.buildingPanel(b);
    } else if (sel?.kind === 'unit') {
      html = this.unitPanel(sel.u);
    } else if (sel?.kind === 'deco') {
      const v = sc.decoMap.get(sel.cell);
      const e = v && get('decoration', v.d.key);
      if (v && e) {
        const st = lvl(e, v.d.level).stats;
        const drop = e.props.drops;
        html = `<div class="phead"><div><h3>${esc(e.name)} <span class="lv">Lv${v.d.level}</span></h3><p>${esc(e.description)}</p></div><button class="x" data-act="close">✕</button></div>
          <div class="sec">${drop ? `Dọn được: <b>${RES_ICON[drop] ?? ''} ${st.dropAmount ?? 0} ${esc(get('resource', drop)?.name ?? drop)}</b><br>` : ''}Thời gian dọn: ${secs(Number(st.clearTimeSec ?? 5) * CFG.CLEAR_TIME_SCALE)}</div>
          ${v.d.clearing != null ? `<div class="sec">⏳ Đang dọn… ${secs(Math.max(0, v.d.clearing))}</div>` : `<button class="btn green wide" data-act="clear" data-cell="${sel.cell}">🪓 Dọn</button>`}`;
      }
    }
    this.panel.classList.toggle('show', !!html);
    this.set(this.panel, 'panel', html);
  }

  unitPanel(u: any) {
    const sc = this.sc;
    const st = u.st;
    const icon = textureDataURL(sc, sc.unitTex(u));
    const status: string[] = [];
    if (u.elite) status.push('<span class="tag gold">Tinh anh</span>');
    if (u.stunUntil > sc.t) status.push('<span class="tag">Choáng</span>');
    if (u.slowUntil > sc.t) status.push(`<span class="tag">Chậm ${u.slowPct}%</span>`);
    if (u.dots.length) status.push('<span class="tag">Bỏng/Độc</span>');
    if (u.abVal) status.push(`<span class="tag">Phá giáp −${u.abVal}</span>`);
    const mode = { avoid: 'Đi vòng, chỉ phá tường khi hết lối', smash: 'Phá thẳng', fly: 'Bay qua mọi thứ' }[u.ent.props.pathMode as string] ?? '';
    const target = { nearest: 'Đánh mục tiêu gần nhất', buildings: 'Ưu tiên phá công trình', walls: 'Phá tường cực mạnh', core: 'Lao thẳng vào Thành chính' }[u.ent.props.target as string] ?? '';
    return `<div class="phead"><img src="${icon}"><div><h3>${esc(u.ent.name)} <span class="lv">Lv${u.level}</span></h3><p>${esc(u.ent.description)}</p>${status.join(' ')}</div><button class="x" data-act="close">✕</button></div>
      <div class="sec"><div class="hp ${u.team === 'enemy' ? 'red' : ''}"><i style="width:${(u.hp / u.maxHp) * 100}%"></i><span>❤ ${Math.ceil(u.hp)}/${u.maxHp}</span></div>
      <div class="stats"><span>⚔ ST: <b>${statNum(st.damage)}</b></span><span>🛡 Giáp: <b>${statNum(st.armor)}</b></span><span>🎯 Tầm: <b>${statNum(st.attackRange)}</b></span><span>⏱ Tốc đánh: <b>${statNum(st.attackSpeed)}</b></span><span>👟 Tốc chạy: <b>${statNum(st.moveSpeed)}</b></span>${u.team === 'enemy' ? `<span>🪙 Rơi: <b>${lvl(u.ent, u.level).stats.goldDrop ?? 0}${u.elite ? '×3' : ''}</b></span>` : ''}</div>
      ${u.team === 'enemy' ? `<div class="sub">${esc(mode)}${target ? ' · ' + esc(target) : ''}</div>` : u.home ? `<div class="sub">Thuộc ${esc(u.home.e.name)}</div>` : ''}</div>`;
  }

  buildingPanel(b: BRT) {
    const sc = this.sc;
    const s = sc.s;
    const e = b.e;
    const bs = b.s;
    const l = lvl(e, bs.level);
    const max = maxLevel(e);
    const parts: string[] = [];
    const icon = textureDataURL(sc, buildingTexture(sc, e, bs.level, bs.w, bs.h));
    parts.push(`<div class="phead"><img src="${icon}"><div><h3>${esc(e.name)} <span class="lv">Lv${bs.level}/${max}</span></h3><p>${esc(e.description)}</p></div><button class="x" data-act="close">✕</button></div>`);
    if (bs.ruined) {
      const rc = sc.repairCost(b);
      parts.push(`<div class="sec warn">💥 Công trình đã bị phá huỷ, không hoạt động.</div><button class="btn green wide ${canAfford(s.resources, rc) ? '' : 'disabled'}" data-act="repair" data-id="${bs.id}">🔧 Sửa chữa ${costHtml(s.resources, rc)}</button>`);
    }
    if (bs.buildLeft > 0) parts.push(`<div class="sec">🏗️ ${bs.upgrading ? `Đang nâng lên cấp ${bs.level + 1}` : 'Đang xây'}… <b>${secs(bs.buildLeft)}</b><div class="prog"><i style="width:${(1 - bs.buildLeft / Math.max(0.01, bs.buildTotal)) * 100}%"></i></div></div>`);
    // máu + chỉ số
    const statKeys = Object.entries(l.stats).filter(([k]) => !['buildTimeSec', 'troopLevel', 'statPoints', 'trainTimeSec', 'trainQueue', 'troopCount', 'hp'].includes(k));
    parts.push(
      `<div class="sec"><div class="hp"><i style="width:${(b.hp / b.maxHp) * 100}%"></i><span>❤ ${Math.ceil(b.hp)}/${b.maxHp}</span></div><div class="stats">${statKeys.map(([k, v]) => `<span>${esc(STAT_LABEL[k] ?? k)}: <b>${statNum(Number(v))}</b></span>`).join('')}</div></div>`,
    );
    // sản xuất
    if (e.props.produces) {
      const cap = Number(l.stats.capacity ?? 1000);
      parts.push(`<div class="sec">Sản xuất ${RES_ICON[e.props.produces] ?? ''} <b>${l.stats.production ?? 0}</b>/phút · đang chứa <b>${Math.floor(bs.stored)}</b>/${cap}<div class="prog"><i style="width:${(bs.stored / cap) * 100}%"></i></div><button class="btn green" data-act="collect" data-id="${bs.id}">Thu hoạch</button></div>`);
    }
    if (e.props.spawns && !bs.ruined) parts.push(this.militaryPanel(b));
    // nâng cấp
    if (!bs.ruined && bs.buildLeft <= 0) {
      if (bs.level < max) {
        const nl = lvl(e, bs.level + 1);
        const diff = Object.entries(nl.stats)
          .filter(([k, v]) => !['buildTimeSec'].includes(k) && Number(l.stats[k] ?? 0) !== Number(v))
          .map(([k, v]) => `${esc(STAT_LABEL[k] ?? k)} ${statNum(Number(l.stats[k] ?? 0))}→<b>${statNum(Number(v))}</b>`)
          .join(' · ');
        const ok = canAfford(s.resources, nl.cost);
        parts.push(`<div class="sec"><div class="sub">Lên cấp ${bs.level + 1}: ${diff}</div><button class="btn gold wide ${ok ? '' : 'disabled'}" data-act="upgrade" data-id="${bs.id}">⬆ Nâng cấp ${costHtml(s.resources, nl.cost)} · ${secs(Number(nl.stats.buildTimeSec ?? 10) * CFG.BUILD_TIME_SCALE)}</button></div>`);
      } else parts.push('<div class="sec sub">Đã đạt cấp tối đa.</div>');
    }
    const same = sc.s.buildings.filter((x) => x.key === bs.key && x.level === bs.level && !x.ruined && x.buildLeft <= 0).length;
    if (same > 1 && bs.level < max && !bs.ruined) parts.push(`<button class="btn wide" data-act="upAll" data-id="${bs.id}">⬆ Nâng cấp tất cả ${same} ${esc(e.name)} cấp ${bs.level}</button>`);
    if (!bs.ruined && sc.phase !== 'battle') parts.push(`<button class="btn wide" data-act="move" data-id="${bs.id}">✥ Di chuyển</button>`);
    if (e.props.category !== 'core') parts.push(`<button class="btn wide ghost" data-act="sell" data-id="${bs.id}">Dỡ công trình</button>`);
    return parts.join('');
  }

  militaryPanel(b: BRT) {
    const sc = this.sc;
    const s = sc.s;
    const bs = b.s;
    const e = b.e;
    const l = lvl(e, bs.level);
    const tk = troopKeyOf(bs, e);
    const te = tk ? get('troop', tk) : undefined;
    const out: string[] = [];
    const maxT = sc.maxTroops(b);
    const alive = b.soldiers.filter((u) => u.alive).length;
    const general = te?.props.unitClass === 'general';
    // chọn tướng
    if (isGeneralHall(e) && alive === 0 && bs.queue === 0) {
      const gens = all('troop').filter((t) => t.props.unitClass === 'general');
      if (gens.length > 1)
        out.push(
          `<div class="sec"><div class="sub">Chọn tướng trú đóng:</div><div class="gens">${gens.map((g) => `<button class="btn sm ${g.key === tk ? 'on' : ''}" data-act="general" data-id="${bs.id}" data-key="${g.key}">${esc(g.name)}</button>`).join('')}</div></div>`,
        );
    }
    if (te) {
      const ticon = textureDataURL(sc, unitTexture(sc, te, Number(l.stats.troopLevel ?? 1), 'ally'));
      const reserve = s.reserves[te.key] ?? 0;
      const tc = l.trainCost;
      const full = alive + bs.queue >= maxT;
      out.push(`<div class="sec troop"><img src="${ticon}"><div><b>${esc(te.name)}</b> ${general ? '<span class="tag">Tướng</span>' : ''} <span class="lv">Lv${l.stats.troopLevel ?? 1}</span><br>
        <span class="big">${alive}/${maxT}</span> ${general ? 'tướng' : 'lính'} ${bs.queue ? `· đang tạo ${bs.queue}` : ''} ${reserve ? `· dự bị ${reserve}` : ''}
        <div class="sub">Lính chết là mất, phải tạo lại. Tạo cùng lúc ${l.stats.trainQueue ?? 1} · ${secs(Number(l.stats.trainTimeSec ?? 20) * CFG.TRAIN_TIME_SCALE)}/lính</div>
        ${te.props.skill ? `<div class="sub">Tuyệt kỹ: ${esc(te.props.skill)}</div>` : ''}</div></div>
        <div class="row"><button class="btn green ${full || (!reserve && !canAfford(s.resources, tc)) ? 'disabled' : ''}" data-act="train" data-id="${bs.id}" data-n="1">${reserve ? '＋ Dùng lính dự bị' : `＋ Tạo 1 ${costHtml(s.resources, tc)}`}</button>
        ${maxT - alive - bs.queue > 1 ? `<button class="btn ${full ? 'disabled' : ''}" data-act="train" data-id="${bs.id}" data-n="${maxT - alive - bs.queue}">Tạo đủ (${maxT - alive - bs.queue})</button>` : ''}</div>`);
      const st = b.stats;
      if (st)
        out.push(
          `<div class="sec"><div class="sub">Chỉ số mỗi ${general ? 'tướng' : 'lính'} (đã cộng trang bị, cổ vật, điểm cộng)</div><div class="stats">
          <span>❤ Máu: <b>${st.hp}</b></span><span>⚔ ST: <b>${statNum(st.damage)}</b></span><span>🛡 Giáp: <b>${statNum(st.armor)}</b></span><span>🎯 Tầm: <b>${statNum(st.attackRange)}</b></span><span>⏱ Tốc đánh: <b>${statNum(st.attackSpeed)}</b></span><span>👟 Tốc chạy: <b>${statNum(st.moveSpeed)}</b></span>
          ${st.auraRadius ? `<span>✨ Hào quang +${statNum(st.auraBonusPct)}% ST (r${statNum(st.auraRadius)})</span>` : ''}</div>
          ${st.effects.length ? `<div class="effects">${st.effects.map((x) => `<span class="eff">${esc(effectText(x))}</span>`).join('')}</div>` : ''}</div>`,
        );
    }
    // điểm đóng quân
    if (e.props.rallySelectable)
      out.push(
        `<div class="sec"><div class="sub">Điểm đóng quân ${e.props.rallyZone === 'territory' ? '(mọi nơi trong lãnh thổ — vùng phát hiện địch đi theo)' : '(trong vùng bao phủ)'}</div><div class="row"><button class="btn ${sc.mode.kind === 'rally' ? 'on' : ''}" data-act="rally" data-id="${bs.id}">🚩 Chọn điểm</button><button class="btn" data-act="rallyReset" data-id="${bs.id}">Về quanh nhà</button></div></div>`,
      );
    // điểm cộng
    const values = parseKV(e.props.statPointValues);
    const total = totalStatPoints(e, bs.level);
    if (Object.keys(values).length && total > 0) {
      const used = Object.values(bs.statAlloc).reduce((a, c) => a + c, 0);
      out.push(
        `<div class="sec"><div class="sub">Điểm cộng: còn <b>${total - used}</b>/${total}</div>${Object.entries(values)
          .map(
            ([k, v]) =>
              `<div class="pt"><span>${esc(STAT_LABEL[k] ?? k)} <small>+${v}/điểm</small></span><button class="btn xs" data-act="pt" data-id="${bs.id}" data-stat="${k}" data-delta="-1">−</button><b>${bs.statAlloc[k] ?? 0}</b><button class="btn xs ${used >= total ? 'disabled' : ''}" data-act="pt" data-id="${bs.id}" data-stat="${k}" data-delta="1">＋</button></div>`,
          )
          .join('')}</div>`,
      );
    }
    // cổ vật
    const unlocks = slotUnlockLevels(e);
    if (unlocks.length) {
      const byId = new Map(s.items.map((i) => [i.id, i]));
      out.push(
        `<div class="sec"><div class="sub">Cổ vật (cộng cho lính của nhà này)</div><div class="slots">${unlocks
          .map((u, i) => {
            if (u > bs.level) return `<div class="slot locked">🔒<small>Cấp ${u}</small></div>`;
            const it = bs.artifacts[i] != null ? byId.get(bs.artifacts[i]!) : undefined;
            const ie = it && get('artifact', it.key);
            return `<div class="slot ${ie ? 'full r-' + ie.props.rarity : ''}" data-act="artSlot" data-id="${bs.id}" data-slot="${i}">${ie ? `<b>${esc(ie.name)}</b><small>Lv${it!.level}</small>` : '＋'}</div>`;
          })
          .join('')}</div></div>`,
      );
    }
    // trang bị
    const slots = equipSlotsOf(bs);
    if (slots.length) {
      const byId = new Map(s.items.map((i) => [i.id, i]));
      out.push(
        `<div class="sec"><div class="sub">Trang bị ${general ? 'của tướng' : '(cả đội dùng chung)'}</div><div class="slots">${slots
          .map((k) => {
            const id = bs.equipment[k];
            const it = id != null ? byId.get(id) : undefined;
            const ie = it && get('equipment', it.key);
            return `<div class="slot ${ie ? 'full r-' + ie.props.rarity : ''}" data-act="eqSlot" data-id="${bs.id}" data-slot="${k}"><small>${esc(SLOT_LABEL[k] ?? k)}</small>${ie ? `<b>${esc(ie.name)}</b><small>Lv${it!.level}</small>` : '＋'}</div>`;
          })
          .join('')}</div></div>`,
      );
    }
    return out.join('');
  }

  /* ---------- chọn vật phẩm cho ô ---------- */
  pickItem(type: 'artifact' | 'equipment', bid: number, slot: number | string) {
    const sc = this.sc;
    const b = sc.bld.get(bid);
    if (!b) return;
    const te = get('troop', troopKeyOf(b.s, b.e) ?? '');
    const cur = type === 'artifact' ? b.s.artifacts[slot as number] : b.s.equipment[slot as string];
    const items = sc.itemsOf(type).filter((it) => {
      const ie = get(type, it.key);
      if (!ie) return false;
      if (type === 'artifact') return roleMatches(ie.props.appliesTo, te?.props.role);
      return ie.props.slot === slot && canEquip(it, b.s);
    });
    const rows = items
      .map((it) => {
        const ie = get(type, it.key)!;
        const where = sc.equippedWhere(it.id);
        return `<div class="item r-${ie.props.rarity}" data-act="equipPick" data-item="${it.id}"><b>${esc(ie.name)}</b> <span class="lv">Lv${it.level}</span> ${where ? `<small>(đang ở ${esc(where.e.name)})</small>` : ''}<div class="sub">${this.itemStats(ie, it.level)}</div></div>`;
      })
      .join('');
    this.openModal(
      `<h2>${type === 'artifact' ? 'Chọn cổ vật' : `Chọn ${SLOT_LABEL[slot as string] ?? slot}`}</h2>
      ${rows || `<p class="sub">Chưa có vật phẩm phù hợp. Mua ở <a data-act="treasury" data-tab="${type}">💠 Kho báu</a>.</p>`}
      <div class="row">${cur != null ? '<button class="btn" data-act="equipPick" data-item="">Bỏ ra</button>' : ''}<button class="btn" data-act="modalClose">Đóng</button></div>`,
      (ev) => {
        const t = (ev.target as HTMLElement).closest('[data-act="equipPick"]') as HTMLElement | null;
        if (!t) return false;
        const itemId = t.dataset.item ? Number(t.dataset.item) : null;
        if (type === 'artifact') sc.setArtifact(bid, slot as number, itemId);
        else sc.setEquipment(bid, slot as string, itemId);
        this.closeModal();
        return true;
      },
    );
  }

  itemStats(ie: Entity, level: number) {
    const l = lvl(ie, level);
    const st = Object.entries(l.stats)
      .map(([k, v]) => `${esc(STAT_LABEL[k] ?? k)} +${statNum(Number(v))}`)
      .join(' · ');
    const ef = (l.effects ?? []).map((x) => `<span class="eff">${esc(effectText(x))}</span>`).join('');
    return `${st}${ef ? `<div class="effects">${ef}</div>` : ''}`;
  }

  treasury(tab: 'artifact' | 'equipment' = 'artifact') {
    const sc = this.sc;
    const s = sc.s;
    const owned = sc.itemsOf(tab);
    const ownedHtml = owned
      .map((it) => {
        const ie = get(tab, it.key);
        if (!ie) return '';
        const where = sc.equippedWhere(it.id);
        const nextCost = it.level < maxLevel(ie) ? lvl(ie, it.level + 1).cost : null;
        return `<div class="item r-${ie.props.rarity}"><b>${esc(ie.name)}</b> <span class="lv">Lv${it.level}/${maxLevel(ie)}</span> <small>${where ? `· đang dùng ở ${esc(where.e.name)}` : '· chưa dùng'}</small>
        <div class="sub">${this.itemStats(ie, it.level)}</div>
        ${nextCost ? `<button class="btn xs gold ${canAfford(s.resources, nextCost) ? '' : 'disabled'}" data-act="itemUp" data-id="${it.id}" data-type="${tab}">⬆ Lv${it.level + 1} ${costHtml(s.resources, nextCost)}</button>` : ''}</div>`;
      })
      .join('');
    const shop = all(tab)
      .map((ie) => {
        const cost = lvl(ie, 1).cost;
        const has = ie.props.unique && owned.some((i) => i.key === ie.key);
        const meta = tab === 'artifact' ? `Áp dụng: ${ie.props.appliesTo === 'all' ? 'mọi lính' : ie.props.appliesTo === 'melee' ? 'cận chiến' : 'đánh xa'}${ie.props.unique ? ' · độc nhất' : ''}` : `${SLOT_LABEL[ie.props.slot] ?? ie.props.slot} · cho ${ie.props.equipFor === 'general' ? 'tướng' : ie.props.equipFor === 'soldier' ? 'lính' : 'tướng & lính'}${ie.props.setName ? ` · bộ ${esc(ie.props.setName)}` : ''}`;
        return `<div class="item r-${ie.props.rarity}"><b>${esc(ie.name)}</b> <span class="tag">${RARITY[ie.props.rarity] ?? ie.props.rarity ?? ''}</span> <small>${meta}</small><div class="sub">${esc(ie.description)}</div><div class="sub">${this.itemStats(ie, 1)}</div>
        <button class="btn xs green ${has || !canAfford(s.resources, cost) ? 'disabled' : ''}" data-act="buy" data-type="${tab}" data-key="${ie.key}">${has ? 'Đã có' : `Mua ${costHtml(s.resources, cost)}`}</button></div>`;
      })
      .join('');
    this.openModal(
      `<h2>💠 Kho báu</h2><div class="tabs"><button class="tab ${tab === 'artifact' ? 'on' : ''}" data-act="treasury" data-tab="artifact">Cổ vật</button><button class="tab ${tab === 'equipment' ? 'on' : ''}" data-act="treasury" data-tab="equipment">Trang bị</button></div>
      <p class="sub">${tab === 'artifact' ? 'Gắn cổ vật vào ô cổ vật của nhà lính (ô mở theo cấp nhà). Cộng chỉ số cho lính của nhà đó.' : 'Trang bị mặc cho tướng (riêng từng tướng) hoặc cho lính (cả đội trong một nhà dùng chung). Chọn nhà lính rồi bấm vào ô trang bị.'}</p>
      <div class="cols"><div><h4>Đang có (${owned.length})</h4>${ownedHtml || '<p class="sub">Chưa có.</p>'}</div><div><h4>Cửa hàng</h4>${shop}</div></div>
      <div class="row"><button class="btn" data-act="modalClose">Đóng</button></div>`,
    );
  }

  /* ---------- hộp thoại ---------- */
  modalHandler: ((ev: Event) => boolean) | null = null;

  openModal(html: string, handler?: (ev: Event) => boolean) {
    this.modal.innerHTML = `<div class="box">${html}</div>`;
    this.modal.classList.remove('hidden');
    this.modalHandler = handler ?? null;
    this.modal.onpointerdown = (ev) => {
      if (ev.target === this.modal) return this.closeModal();
      if (this.modalHandler?.(ev)) ev.stopPropagation();
    };
  }

  modalOpen() {
    return !this.modal.classList.contains('hidden');
  }

  closeModal() {
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
    this.modalHandler = null;
  }

  confirm(msg: string, yes: () => void) {
    this.openModal(`<p>${esc(msg)}</p><div class="row"><button class="btn red" data-yes="1">Đồng ý</button><button class="btn" data-act="modalClose">Huỷ</button></div>`, (ev) => {
      if ((ev.target as HTMLElement).closest('[data-yes]')) {
        this.closeModal();
        yes();
        this.refresh(true);
        return true;
      }
      return false;
    });
  }

  chestResult(e: Entity, level: number, got: { label: string; amount: number; color?: string }[]) {
    this.openModal(
      `<div class="chestopen"><img src="${chestIcon(e)}"><h2>${esc(e.name)} Lv${level}</h2>${got.length ? got.map((g) => `<div class="reward" style="border-color:${esc(g.color ?? '#888')}"><b>+${g.amount}</b> ${esc(g.label)}</div>`).join('') : '<p>Rương trống… lần sau may mắn hơn!</p>'}<div class="row"><button class="btn gold" data-act="modalClose">Tuyệt!</button></div></div>`,
    );
  }

  gameOver(wave: number) {
    const s = this.sc.s;
    this.openModal(
      `<div class="over"><h2>🏚️ Thành chính đã thất thủ!</h2><p>Bạn trụ được tới đợt <b>${wave}</b>. Hạ tổng cộng <b>${s.stats.kills}</b> quái.</p><div class="row"><button class="btn gold" data-act="retry">Chơi lại đợt ${wave}</button><button class="btn red" data-act="newGamePick">Bắt đầu thành mới</button></div></div>`,
    );
  }

  menu() {
    this.openModal(
      `<h2>Cuộc Chiến Sinh Tồn</h2><p class="sub">Dữ liệu: ${dataSource === 'server' ? 'từ server (trang admin)' : 'file JSON đóng gói (chưa bật server)'} · Kỷ lục: đợt ${this.sc.s.stats.bestWave} · Đã hạ ${this.sc.s.stats.kills} quái</p>
      <div class="row"><button class="btn red" data-act="newGamePick">Bắt đầu thành mới (xoá tiến trình)</button><button class="btn" data-act="modalClose">Đóng</button></div>`,
    );
  }

  help() {
    this.openModal(`<h2>Cách chơi</h2><ul class="help">
      <li><b>Mục tiêu:</b> bảo vệ <b>Thành chính</b> trước các đợt quái kéo đến từ cổng đỏ ở mép bản đồ.</li>
      <li><b>Xây dựng:</b> chọn công trình ở thanh dưới rồi bấm lên bản đồ. Tường kéo chuột để xây cả dãy; cổng nhấn <b>R</b> để xoay. Giữ <b>Shift</b> để đặt nhiều.</li>
      <li><b>Nhà lính:</b> bao phủ một vùng (vòng xanh). Quái đi vào vùng đó thì lính chạy ra đánh: cận chiến đứng chặn, cung thủ bắn từ xa (đứng trên tường được cộng tầm).</li>
      <li><b>Lính chết là mất</b> — chọn nhà lính để tạo lại bằng tài nguyên, hoặc dùng lính dự bị nhận từ rương.</li>
      <li><b>Tướng:</b> nhà tướng sinh 1 tướng, đặt được ở mọi nơi trong lãnh thổ, có hào quang tăng sát thương và tuyệt kỹ.</li>
      <li><b>Điểm đóng quân:</b> chọn nhà → 🚩 Chọn điểm → bấm lên bản đồ.</li>
      <li><b>Quái</b> đi vòng qua tường; chỉ phá tường khi không còn lối. Quái không đi qua được cổng.</li>
      <li><b>Kinh tế:</b> mỏ, nông trại, xưởng gỗ sản xuất liên tục — bấm vào để thu hoạch. Nhà kho và Thành chính tăng sức chứa. Bấm cây/đá để dọn lấy gỗ, đá.</li>
      <li><b>Rương:</b> nhận sau mỗi đợt; bấm để mở khoá, hết giờ thì bấm để mở.</li>
      <li><b>Kho báu:</b> mua cổ vật, trang bị và gắn vào nhà lính.</li>
      <li><b>Phép</b> (góc dưới phải, dùng khi đang đánh): ☄️ Mưa thiên thạch, ❄️ Băng giá, 💚 Hồi sinh lực, 📯 Xung phong.</li>
      <li><b>Quái tinh anh</b> (ánh vàng) trâu hơn, rơi gấp 3 vàng và ngọc.</li>
      <li><b>Nhiệm vụ</b> 📜: hoàn thành để nhận tài nguyên, ngọc, rương.</li>
      <li>Vắng mặt thì mỏ vẫn sản xuất, rương vẫn mở khoá (tối đa 8 giờ).</li>
      <li>Phím: <b>Space</b> tạm dừng, <b>Esc</b>/chuột phải huỷ, <b>R</b> xoay, <b>1–9</b> chọn công trình, <b>Tab</b> đổi nhóm, <b>Q W E F</b> phép.</li></ul><div class="row"><button class="btn" data-act="modalClose">Đã hiểu</button></div>`);
  }

  toast(msg: string, ms = 2200) {
    if (/Không đủ|Không thể|Không xây|Cần |Quá gần|Ngoài|đã có|đầy/.test(msg)) play('error');
    const t = el('div', 'toast');
    t.textContent = msg;
    this.toastEl.append(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  }

  hint(msg: string) {
    this.hintEl.textContent = msg;
    this.hintEl.classList.add('show');
    this.hintT = performance.now() + 4000;
  }

  banner(title: string, sub: string) {
    this.bannerEl.innerHTML = `<h1>${esc(title)}</h1><p>${esc(sub)}</p>`;
    this.bannerEl.classList.remove('hidden');
    this.bannerEl.classList.remove('anim');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('anim');
    setTimeout(() => this.bannerEl.classList.add('hidden'), 2600);
  }
}

function el(tag: string, cls: string) {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

export type { Item };
export { costText };
