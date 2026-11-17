import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { clampRally, garrisonSpots } from './formation';
import type { EntityData, EntitySummary, EntityView, FieldDef, LevelData } from './types';

/** Các thuộc tính cố định do khung này quản lý (ẩn khỏi bảng thuộc tính chung) */
export const GARRISON_PROPS = ['spawns', 'garrisonFormation', 'garrisonSpacing', 'engageMode', 'chaseRadius', 'returnWhenClear', 'rallySelectable', 'rallyX', 'rallyY', 'artifactSlots', 'artifactSlotUnlocks', 'statPointValues'];

function parsePointValues(s: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of s.split(',')) {
    const [k, v] = part.split(':').map((x) => x.trim());
    if (k && Number.isFinite(Number(v))) out[k] = Number(v);
  }
  return out;
}
const serializePointValues = (m: Record<string, number>) => Object.entries(m).map(([k, v]) => `${k}:${v}`).join(',');

const QUICK_COUNTS = [1, 3, 6, 9, 16];
const TW = 64; // bề ngang 1 ô trong khung xem trước
const TH = 32;

interface Props {
  draft: EntityData;
  all: EntitySummary[];
  buildingImage: (level: number) => string | null;
  setProps: (p: EntityData['props']) => void;
  setLevels: (l: LevelData[]) => void;
  /** Danh sách chỉ số của lính (lấy từ định nghĩa loại Lính) */
  troopStatDefs: FieldDef[];
}

export default function GarrisonPanel({ draft, all, buildingImage, setProps, setLevels, troopStatDefs }: Props) {
  const units = all.filter((e) => e.type === 'troop' || e.type === 'general');
  const spawnKey = String(draft.props.spawns ?? '');
  const unitSummary = units.find((u) => u.key === spawnKey);
  const [unit, setUnit] = useState<EntityView | null>(null);
  const [previewLevel, setPreviewLevel] = useState(1);
  const [enemy, setEnemy] = useState(false);

  useEffect(() => {
    setUnit(null);
    if (unitSummary) api.get(unitSummary.id).then(setUnit).catch(() => undefined);
  }, [unitSummary?.id]);

  const formation = String(draft.props.garrisonFormation ?? 'ring');
  const spacing = Number(draft.props.garrisonSpacing) || 1;
  const engageMode = String(draft.props.engageMode ?? 'all');
  const chase = Number(draft.props.chaseRadius ?? 2);
  const returnWhenClear = draft.props.returnWhenClear !== false;
  const size = Number(draft.props.size) || 1;
  const prop = (k: string, v: string | number | boolean) => setProps({ ...draft.props, [k]: v });
  const rallySelectable = draft.props.rallySelectable !== false;
  const rally = { x: Number(draft.props.rallyX) || 0, y: Number(draft.props.rallyY) || 0 };
  // điểm mặc định phải nằm trong vùng bao phủ của MỌI cấp → dùng bán kính nhỏ nhất
  const minCover = Math.min(...draft.levels.map((l) => l.stats.coverRadius ?? 0));
  const setRally = (r: { x: number; y: number }) => {
    const c = clampRally(r, minCover);
    setProps({ ...draft.props, rallyX: c.x, rallyY: c.y });
  };

  // ---- cổ vật & điểm cộng ----
  const slots = Math.max(1, Math.min(10, Number(draft.props.artifactSlots ?? 5) || 1));
  const maxLevel = draft.levels.length;
  // cấp nhà mở từng ô, ví dụ "2,4,5,7,8"; thiếu thì mặc định mở ở cấp cuối
  const parsedUnlocks = String(draft.props.artifactSlotUnlocks ?? '')
    .split(',')
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const unlocks = Array.from({ length: slots }, (_, i) => parsedUnlocks[i] ?? Math.max(1, maxLevel));
  const setSlots = (n: number) => {
    const c = Math.max(1, Math.min(10, Math.round(n) || 1));
    const u = Array.from({ length: c }, (_, i) => unlocks[i] ?? unlocks[unlocks.length - 1] ?? maxLevel);
    setProps({ ...draft.props, artifactSlots: c, artifactSlotUnlocks: u.join(',') });
  };
  const setUnlock = (i: number, lvl: number) => {
    const u = unlocks.map((x, j) => (j === i ? lvl : x));
    prop('artifactSlotUnlocks', u.join(','));
  };
  const openAt = (lvl: number) => unlocks.filter((u) => u <= lvl).length;
  const pointValues = parsePointValues(String(draft.props.statPointValues ?? ''));
  const setPointValue = (k: string, v: number | null) => {
    const m = { ...pointValues };
    if (v === null) delete m[k];
    else m[k] = v;
    prop('statPointValues', serializePointValues(m));
  };
  const artifacts = all.filter((e) => e.type === 'artifact');

  // ---- chỉ số lính ghi ở nhà ----
  const troopKeys = useMemo(() => {
    const keys = troopStatDefs.map((d) => d.key);
    for (const l of draft.levels) for (const k of Object.keys(l.troopStats ?? {})) if (!keys.includes(k)) keys.push(k);
    return keys;
  }, [draft.levels, troopStatDefs]);
  const setTroopStat = (li: number, k: string, raw: string) =>
    setLevels(
      draft.levels.map((l, i) => {
        if (i !== li) return l;
        const ts = { ...(l.troopStats ?? {}) };
        if (raw === '') delete ts[k];
        else ts[k] = Number(raw);
        return { ...l, troopStats: ts };
      }),
    );
  const fillFromUnit = (onlyEmpty: boolean) => {
    if (!unit) return;
    setLevels(
      draft.levels.map((l) => {
        const tl = l.stats.troopLevel ?? 1;
        const src = (unit.levels.find((x) => x.level === tl) ?? unit.levels[unit.levels.length - 1])?.stats ?? {};
        const picked = Object.fromEntries(Object.entries(src).filter(([k]) => troopStatDefs.some((d) => d.key === k)));
        return { ...l, troopStats: onlyEmpty ? { ...picked, ...(l.troopStats ?? {}) } : picked };
      }),
    );
  };

  const setStat = (li: number, k: string, v: number | null) =>
    setLevels(
      draft.levels.map((l, i) => {
        if (i !== li) return l;
        const stats = { ...l.stats };
        if (v === null || Number.isNaN(v)) delete stats[k];
        else stats[k] = v;
        return { ...l, stats };
      }),
    );

  const unitImage = (lv: number) => {
    if (!unit) return unitSummary ? `/api/art/placeholder/${unitSummary.type}/${unitSummary.key}/${lv}.svg` : null;
    const l = unit.levels.find((x) => x.level === lv) ?? unit.levels[unit.levels.length - 1];
    return l?.image ?? `/api/art/placeholder/${unit.type}/${unit.key}/${l?.level ?? 1}.svg?v=${new Date(unit.updatedAt).getTime()}`;
  };
  const unitMaxLevel = unit?.levels.length ?? unitSummary?.levelCount ?? 1;

  const lvIdx = Math.min(previewLevel, draft.levels.length) - 1;
  const lv = draft.levels[lvIdx];

  return (
    <section className="panel">
      <div className="section-head">
        <h2>⚔️ Lính đóng quân</h2>
      </div>
      <p className="muted">
        Lính đứng chờ quanh nhà theo đội hình bên dưới. Khi quái đi vào <b>vùng bao phủ</b> (chỉ số “Bán kính bao phủ”), lính chạy ra
        đánh; lính chết sẽ hồi sinh sau “Hồi sinh lính (giây)”. <b>Chỉ số của lính ghi ngay tại nhà này</b> theo từng cấp nhà (bảng
        “Chỉ số lính”); ảnh lính lấy từ mục Lính / Tướng theo “Cấp của lính”.
      </p>

      <div className="form-grid">
        <label>
          Loại lính xuất ra
          <select value={spawnKey} onChange={(e) => prop('spawns', e.target.value)}>
            <option value="">— chọn —</option>
            {units.map((u) => (
              <option key={u.id} value={u.key}>
                {u.type === 'general' ? 'Tướng' : 'Lính'}: {u.name} ({u.key})
              </option>
            ))}
          </select>
          {unitSummary && (
            <small>
              Sửa ảnh / chỉ số của lính ở <a href={`#/${unitSummary.type}/${unitSummary.id}`}>{unitSummary.name}</a>
            </small>
          )}
        </label>
        <label>
          Đội hình đứng chờ
          <select value={formation} onChange={(e) => prop('garrisonFormation', e.target.value)}>
            <option value="ring">Vây quanh nhà (ring)</option>
            <option value="grid">Xếp khối trước cửa (grid)</option>
          </select>
        </label>
        <label>
          Khoảng cách giữa lính (ô)
          <input type="number" step="0.5" min="0.5" value={spacing} onChange={(e) => prop('garrisonSpacing', Number(e.target.value))} />
        </label>
        <label>
          Cách ra đánh
          <select value={engageMode} onChange={(e) => prop('engageMode', e.target.value)}>
            <option value="all">Cả đội lao vào quái gần nhất (all)</option>
            <option value="split">Chia đều lính cho các quái trong vùng (split)</option>
          </select>
        </label>
        <label>
          Đuổi thêm ra ngoài vùng (ô)
          <input type="number" step="0.5" min="0" value={chase} onChange={(e) => prop('chaseRadius', Number(e.target.value))} />
          <small>Quái chạy khỏi vùng bao phủ quá khoảng này thì lính thôi đuổi.</small>
        </label>
        <label className="check">
          <input type="checkbox" checked={returnWhenClear} onChange={(e) => prop('returnWhenClear', e.target.checked)} />
          Hết địch thì lính quay về vị trí đứng chờ
        </label>
        <label className="check">
          <input type="checkbox" checked={rallySelectable} onChange={(e) => prop('rallySelectable', e.target.checked)} />
          Người chơi được chọn điểm đóng quân (kéo cờ 🚩 trong vùng bao phủ)
        </label>
        <div className="rally-row">
          <span>Điểm đóng quân mặc định (ô, so với tâm nhà):</span>
          <label className="inline">X <input type="number" step="0.5" value={rally.x} onChange={(e) => setRally({ ...rally, x: Number(e.target.value) })} style={{ width: 70 }} /></label>
          <label className="inline">Y <input type="number" step="0.5" value={rally.y} onChange={(e) => setRally({ ...rally, y: Number(e.target.value) })} style={{ width: 70 }} /></label>
          <button className="btn small ghost" onClick={() => setRally({ x: 0, y: 0 })}>Về quanh nhà</button>
          <small className="muted">Bấm lên ô trong khung xem trước để đặt. Không vượt quá vùng bao phủ nhỏ nhất ({minCover} ô).</small>
        </div>
      </div>

      <h3>Số lính theo cấp nhà</h3>
      <div className="table-wrap">
        <table className="garrison-table">
          <thead>
            <tr>
              <th>Cấp nhà</th>
              <th>Số lính tối đa</th>
              <th>Cấp của lính</th>
              <th>Vùng bao phủ (ô)</th>
              <th>Ảnh lính</th>
            </tr>
          </thead>
          <tbody>
            {draft.levels.map((l, i) => {
              const count = l.stats.troopCount;
              const tl = l.stats.troopLevel ?? 1;
              const img = unitImage(tl);
              return (
                <tr key={i} className={i === lvIdx ? 'sel' : ''} onClick={() => setPreviewLevel(i + 1)}>
                  <th>Cấp {l.level}</th>
                  <td>
                    <div className="count-cell">
                      <input type="number" min="0" value={count ?? ''} onChange={(e) => setStat(i, 'troopCount', e.target.value === '' ? null : Number(e.target.value))} />
                      {QUICK_COUNTS.map((q) => (
                        <button key={q} className={`chip ${count === q ? 'on' : ''}`} onClick={() => setStat(i, 'troopCount', q)}>
                          {q}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input type="number" min="1" max={unitMaxLevel} value={tl} onChange={(e) => setStat(i, 'troopLevel', Number(e.target.value))} style={{ width: 70 }} />
                    <small className="muted"> / {unitMaxLevel}</small>
                  </td>
                  <td>
                    <input type="number" min="0" step="0.5" value={l.stats.coverRadius ?? ''} onChange={(e) => setStat(i, 'coverRadius', e.target.value === '' ? null : Number(e.target.value))} style={{ width: 70 }} />
                  </td>
                  <td>{img && <img className="unit-thumb checker" src={img} alt="" />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="section-head" style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>Chỉ số lính theo cấp nhà</h3>
        <div className="spacer" />
        <button className="btn small" disabled={!unit} onClick={() => fillFromUnit(true)} title="Chỉ điền ô đang trống">
          Điền ô trống từ mục Lính
        </button>
        <button className="btn small ghost" disabled={!unit} onClick={() => confirm('Ghi đè toàn bộ chỉ số lính bằng chỉ số trong mục Lính?') && fillFromUnit(false)}>
          Lấy lại toàn bộ từ mục Lính
        </button>
      </div>
      <div className="table-wrap">
        <table className="statgrid-lite">
          <thead>
            <tr>
              <th className="sticky-col">Chỉ số lính</th>
              {draft.levels.map((l, i) => (
                <th key={i}>Nhà cấp {l.level}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {troopKeys.map((k) => {
              const def = troopStatDefs.find((d) => d.key === k);
              return (
                <tr key={k}>
                  <th className="sticky-col">
                    <div>{def?.label ?? k}</div>
                    <code>{k}</code>
                  </th>
                  {draft.levels.map((l, i) => {
                    const tl = l.stats.troopLevel ?? 1;
                    const ref = unit?.levels.find((x) => x.level === tl)?.stats[k];
                    return (
                      <td key={i}>
                        <input type="number" step="any" value={l.troopStats?.[k] ?? ''} placeholder={ref !== undefined ? String(ref) : ''} onChange={(e) => setTroopStat(i, k, e.target.value)} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <small className="muted">Ô trống thì game dùng chỉ số của lính trong mục Lính (số mờ là giá trị đó).</small>

      <div className="section-head" style={{ marginTop: 20 }}>
        <h3 style={{ margin: 0 }}>🏺 Cổ vật & điểm cộng</h3>
      </div>
      <p className="muted">
        Người chơi trang bị cổ vật vào các ô của nhà để tăng chỉ số cho lính của nhà này. Mỗi lần nhà lên cấp, người chơi nhận điểm cộng và tự
        phân bổ vào các chỉ số được phép bên dưới.
      </p>
      <div className="artifact-row">
        <label className="inline">
          Số ô cổ vật
          <select value={slots} onChange={(e) => setSlots(Number(e.target.value))} style={{ width: 70 }}>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </label>
        <div className="slots">
          {unlocks.map((u, i) => {
            const open = u <= (draft.levels[Math.min(previewLevel, maxLevel) - 1]?.level ?? 1);
            return (
              <div key={i} className="slot-col">
                <div className={`slot checker ${open ? '' : 'locked'}`} title={`Ô ${i + 1}`}>
                  {open ? artifacts[i % Math.max(1, artifacts.length)] && <img src={artifacts[i % artifacts.length].image ?? artifacts[i % artifacts.length].placeholder} alt="" /> : <span>🔒</span>}
                </div>
                <select className={u > maxLevel ? 'warn' : ''} value={u} onChange={(e) => setUnlock(i, Number(e.target.value))} title="Mở ở cấp nhà">
                  {Array.from({ length: Math.max(maxLevel, u, 10) }, (_, k) => (
                    <option key={k} value={k + 1}>Cấp {k + 1}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <small className="muted">
          Mỗi ô chọn cấp nhà mở khoá ô đó. Ô hiển thị theo cấp đang xem trước (Cấp {Math.min(previewLevel, maxLevel)}): 🔒 = chưa mở.
          {unlocks.some((u) => u > maxLevel) && <b className="warn-text"> Có ô mở ở cấp lớn hơn cấp tối đa hiện tại ({maxLevel}) — thêm cấp cho nhà hoặc sửa lại.</b>}{' '}
          Ảnh trong ô chỉ là ví dụ, sửa cổ vật ở mục <a href="#/artifact">Cổ vật</a>.
        </small>
      </div>
      <div className="points-grid">
        <div className="table-wrap">
          <table className="statgrid-lite">
            <thead>
              <tr>
                <th>Chỉ số lính</th>
                <th>Cho cộng điểm</th>
                <th>Mỗi điểm cộng thêm</th>
              </tr>
            </thead>
            <tbody>
              {troopKeys.map((k) => {
                const on = k in pointValues;
                return (
                  <tr key={k}>
                    <th>
                      {troopStatDefs.find((d) => d.key === k)?.label ?? k} <code>{k}</code>
                    </th>
                    <td>
                      <input type="checkbox" checked={on} style={{ width: 'auto' }} onChange={(e) => setPointValue(k, e.target.checked ? 1 : null)} />
                    </td>
                    <td>
                      <input type="number" step="any" disabled={!on} value={on ? pointValues[k] : ''} onChange={(e) => setPointValue(k, Number(e.target.value))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-wrap">
          <table className="statgrid-lite">
            <thead>
              <tr>
                <th>Cấp nhà</th>
                <th>Điểm nhận khi lên cấp</th>
                <th>Tổng điểm</th>
                <th>Ô cổ vật đã mở</th>
              </tr>
            </thead>
            <tbody>
              {draft.levels.map((l, i) => {
                const total = draft.levels.slice(0, i + 1).reduce((a, x) => a + (x.stats.statPoints ?? 0), 0);
                return (
                  <tr key={i}>
                    <th>Cấp {l.level}</th>
                    <td>
                      <input type="number" min="0" value={l.stats.statPoints ?? ''} onChange={(e) => setStat(i, 'statPoints', e.target.value === '' ? null : Number(e.target.value))} />
                    </td>
                    <td>{total}</td>
                    <td>
                      {openAt(l.level)} / {slots}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>Xem trước đội hình</h3>
        <div className="tabs">
          {draft.levels.map((l, i) => (
            <button key={i} className={i === lvIdx ? 'on' : ''} onClick={() => setPreviewLevel(i + 1)}>
              Cấp {l.level}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={enemy} onChange={(e) => setEnemy(e.target.checked)} /> Có địch vào vùng
        </label>
      </div>
      {lv && (
        <FormationPreview
          size={size}
          count={lv.stats.troopCount ?? 0}
          cover={lv.stats.coverRadius ?? 0}
          chase={chase}
          formation={formation}
          spacing={spacing}
          buildingImg={buildingImage(lv.level)}
          unitImg={unitImage(lv.stats.troopLevel ?? 1)}
          enemy={enemy}
          engageMode={engageMode}
          rally={rally}
          onPick={setRally}
        />
      )}
    </section>
  );
}

function iso(x: number, y: number) {
  return { x: ((x - y) * TW) / 2, y: ((x + y) * TH) / 2 };
}

function FormationPreview(p: {
  size: number;
  count: number;
  cover: number;
  chase: number;
  formation: string;
  spacing: number;
  buildingImg: string | null;
  unitImg: string | null;
  enemy: boolean;
  engageMode: string;
  rally: { x: number; y: number };
  onPick: (r: { x: number; y: number }) => void;
}) {
  const spots = useMemo(
    () => garrisonSpots(Math.min(p.count, 64), p.size, p.formation, p.spacing, p.rally),
    [p.count, p.size, p.formation, p.spacing, p.rally.x, p.rally.y],
  );
  const c = p.size / 2;
  const reach = Math.max(p.cover + p.chase, ...spots.map((s) => Math.max(Math.abs(s.x - c), Math.abs(s.y - c)))) + 1;
  const R = Math.ceil(Math.min(reach, 12));
  const lo = Math.floor(c - R);
  const hi = Math.ceil(c + R);

  // khung SVG
  const corners = [iso(lo, lo), iso(hi, lo), iso(hi, hi), iso(lo, hi)];
  const minX = Math.min(...corners.map((q) => q.x)) - TW;
  const maxX = Math.max(...corners.map((q) => q.x)) + TW;
  const minY = Math.min(...corners.map((q) => q.y)) - TH * 4;
  const maxY = Math.max(...corners.map((q) => q.y)) + TH;

  const tiles = [];
  for (let x = lo; x < hi; x++)
    for (let y = lo; y < hi; y++) {
      const a = iso(x, y), b = iso(x + 1, y), d = iso(x + 1, y + 1), e = iso(x, y + 1);
      const inside = x >= 0 && y >= 0 && x < p.size && y < p.size;
      tiles.push(
        <polygon
          key={`${x},${y}`}
          points={[a, b, d, e].map((q) => `${q.x},${q.y}`).join(' ')}
          className={inside ? 'pv-foot' : (x + y) % 2 ? 'pv-tile a' : 'pv-tile b'}
          onClick={() => p.onPick({ x: x + 0.5 - p.size / 2, y: y + 0.5 - p.size / 2 })}
        />,
      );
    }

  const center = iso(c, c);
  const ell = (r: number) => ({ rx: (r * TW) / Math.SQRT2, ry: (r * TH) / Math.SQRT2 });
  const cover = ell(p.cover);
  const chase = ell(p.cover + p.chase);

  // quái giả lập ở mép vùng bao phủ, phía trước-phải
  const enemies = p.enemy ? [{ x: c + p.cover * 0.75, y: c + p.cover * 0.55 }, ...(p.engageMode === 'split' ? [{ x: c - p.cover * 0.6, y: c + p.cover * 0.7 }] : [])] : [];
  const targetOf = (i: number) => enemies[p.engageMode === 'split' ? i % enemies.length : 0];

  type Item = { depth: number; el: JSX.Element };
  const items: Item[] = [];
  const bw = p.size * TW;
  const bottom = iso(p.size, p.size);
  if (p.buildingImg)
    items.push({
      depth: p.size,
      el: <image key="b" href={p.buildingImg} x={center.x - bw / 2} y={bottom.y - bw} width={bw} height={bw} />,
    });
  const uw = TW * 1.1;
  spots.forEach((s, i) => {
    let pos = s;
    if (enemies.length) {
      const t = targetOf(i);
      // lính tiến lại gần quái, đứng thành vòng nhỏ quanh nó
      const ang = (i / Math.max(1, spots.length)) * Math.PI * 2;
      const r = 0.8 + Math.min(spots.length, 30) * 0.04;
      pos = { x: t.x + Math.cos(ang) * r, y: t.y + Math.sin(ang) * r };
    }
    const q = iso(pos.x, pos.y);
    if (p.unitImg)
      items.push({
        depth: pos.x + pos.y,
        el: <image key={`u${i}`} href={p.unitImg} x={q.x - uw / 2} y={q.y - uw * 0.78} width={uw} height={uw} />,
      });
  });
  enemies.forEach((e, i) => {
    const q = iso(e.x, e.y);
    items.push({
      depth: e.x + e.y,
      el: (
        <g key={`e${i}`}>
          <ellipse cx={q.x} cy={q.y} rx={18} ry={9} fill="rgba(200,30,30,.35)" />
          <text x={q.x} y={q.y - 6} textAnchor="middle" fontSize="30">👹</text>
        </g>
      ),
    });
  });
  items.sort((a, b) => a.depth - b.depth);

  const homeLines = enemies.length
    ? spots.map((s, i) => {
        const a = iso(s.x, s.y);
        const t = targetOf(i);
        const b = iso(t.x, t.y);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="pv-path" />;
      })
    : null;

  return (
    <div className="preview-wrap">
      <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="formation-preview">
        {tiles}
        {p.chase > 0 && <ellipse cx={center.x} cy={center.y} rx={chase.rx} ry={chase.ry} className="pv-chase" />}
        <ellipse cx={center.x} cy={center.y} rx={cover.rx} ry={cover.ry} className="pv-cover" />
        {spots.map((s, i) => {
          const q = iso(s.x, s.y);
          return <ellipse key={`h${i}`} cx={q.x} cy={q.y} rx={10} ry={5} className="pv-home" />;
        })}
        {homeLines}
        {(p.rally.x !== 0 || p.rally.y !== 0) && (() => {
          const f = iso(c + p.rally.x, c + p.rally.y);
          return (
            <g className="pv-flag">
              <line x1={center.x} y1={center.y} x2={f.x} y2={f.y} />
              <text x={f.x} y={f.y - 4} textAnchor="middle" fontSize="26">🚩</text>
            </g>
          );
        })()}
        {items.map((i) => i.el)}
      </svg>
      <div className="legend">
        <span><i className="lg-cover" /> Vùng bao phủ: {p.cover} ô</span>
        {p.chase > 0 && <span><i className="lg-chase" /> Đuổi tối đa: {p.cover + p.chase} ô</span>}
        <span><i className="lg-home" /> Vị trí đứng chờ: {p.count} lính{p.count > 64 ? ' (xem trước tối đa 64)' : ''}</span>
      </div>
    </div>
  );
}
