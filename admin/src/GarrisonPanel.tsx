import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { formationSpots } from './formation';
import type { EntityData, EntitySummary, EntityView, LevelData } from './types';

/** Các thuộc tính cố định do khung này quản lý (ẩn khỏi bảng thuộc tính chung) */
export const GARRISON_PROPS = ['spawns', 'garrisonFormation', 'garrisonSpacing', 'engageMode', 'chaseRadius', 'returnWhenClear'];

const QUICK_COUNTS = [1, 3, 6, 9, 16];
const TW = 64; // bề ngang 1 ô trong khung xem trước
const TH = 32;

interface Props {
  draft: EntityData;
  all: EntitySummary[];
  buildingImage: (level: number) => string | null;
  setProps: (p: EntityData['props']) => void;
  setLevels: (l: LevelData[]) => void;
}

export default function GarrisonPanel({ draft, all, buildingImage, setProps, setLevels }: Props) {
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
        đánh; lính chết sẽ hồi sinh sau “Hồi sinh lính (giây)”. Ảnh và chỉ số của lính lấy từ mục Lính / Tướng, theo “Cấp của lính”.
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
}) {
  const spots = useMemo(() => formationSpots(Math.min(p.count, 64), p.size, p.formation, p.spacing), [p.count, p.size, p.formation, p.spacing]);
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
