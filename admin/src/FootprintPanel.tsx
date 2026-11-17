import type { EntityData, EntitySummary } from './types';

/** Các thuộc tính do khung này quản lý (ẩn khỏi bảng thuộc tính chung) */
export const FOOTPRINT_PROPS = ['size', 'footprintW', 'footprintH', 'blocksPath', 'friendlyPassable', 'enemyPassable', 'standable'];

export function footprintOf(props: EntityData['props']) {
  const size = Number(props.size) > 0 ? Number(props.size) : 1;
  return {
    w: Number(props.footprintW) > 0 ? Number(props.footprintW) : size,
    h: Number(props.footprintH) > 0 ? Number(props.footprintH) : size,
  };
}

const TW = 40;
const TH = 20;

export default function FootprintPanel({
  draft,
  all,
  setProps,
}: {
  draft: EntityData;
  all: EntitySummary[];
  setProps: (p: EntityData['props']) => void;
}) {
  const { w, h } = footprintOf(draft.props);
  const flag = (k: string, def: boolean) => (draft.props[k] === undefined ? def : draft.props[k] === true);
  const blocks = flag('blocksPath', true);
  const friendly = flag('friendlyPassable', false);
  const enemy = flag('enemyPassable', false);
  const standable = flag('standable', false);
  const set = (patch: EntityData['props']) => {
    const next = { ...draft.props, ...patch };
    delete next.size; // dùng footprintW/H thay cho size
    setProps(next);
  };
  const climbers = all.filter((e) => e.type === 'troop' && e.props.canClimbWalls === true);

  // hình minh hoạ: lưới (w+2)×(h+2), các ô của công trình tô màu
  const cells = [];
  const pad = 1;
  for (let x = -pad; x < w + pad; x++)
    for (let y = -pad; y < h + pad; y++) {
      const inside = x >= 0 && y >= 0 && x < w && y < h;
      const P = (a: number, b: number) => `${((a - b) * TW) / 2},${((a + b) * TH) / 2}`;
      cells.push(
        <polygon
          key={`${x},${y}`}
          points={[P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)].join(' ')}
          className={inside ? (friendly ? 'fp-gate' : 'fp-build') : 'fp-free'}
        />,
      );
    }
  const minX = (-pad - (h + pad)) * TW / 2 - 4;
  const maxX = (w + pad + pad) * TW / 2 + 4;
  const maxY = (w + h + 2 * pad) * TH / 2 + 4;

  return (
    <section className="panel">
      <div className="section-head">
        <h2>📐 Kích thước & đường đi</h2>
      </div>
      <div className="fp-grid">
        <div>
          <div className="form-grid">
            <label>
              Chiều rộng (ô)
              <select value={w} onChange={(e) => set({ footprintW: Number(e.target.value) })}>
                {Array.from({ length: 6 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
            </label>
            <label>
              Chiều dài (ô)
              <select value={h} onChange={(e) => set({ footprintH: Number(e.target.value) })}>
                {Array.from({ length: 6 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
            </label>
          </div>
          <p className="muted" style={{ margin: '8px 0' }}>
            Chiếm {w}×{h} = <b>{w * h} ô</b>. Ví dụ: nhà lính 2×2 (4 ô), tường thành 1×1, cổng 3×1. Kích thước ảnh và prompt tự tính theo số này.
          </p>
          <div className="fp-flags">
            <label className="check">
              <input type="checkbox" checked={blocks} onChange={(e) => set({ blocksPath: e.target.checked })} />
              Chặn đường (không đi xuyên qua)
            </label>
            <label className="check">
              <input type="checkbox" checked={friendly} disabled={!blocks} onChange={(e) => set({ friendlyPassable: e.target.checked })} />
              Lính ta đi qua được (cổng)
            </label>
            <label className="check">
              <input type="checkbox" checked={enemy} disabled={!blocks} onChange={(e) => set({ enemyPassable: e.target.checked })} />
              Quái đi qua được
            </label>
            <label className="check">
              <input type="checkbox" checked={standable} onChange={(e) => set({ standable: e.target.checked })} />
              Lính leo lên đứng được (tường thành)
            </label>
          </div>
          {standable && (
            <small className="muted">
              Đứng được trên công trình này: {climbers.length ? climbers.map((c) => c.name).join(', ') : 'chưa có loại lính nào'} (bật “Leo lên tường” trong trang
              Lính & tướng).
            </small>
          )}
        </div>
        <div className="fp-figure">
          <svg viewBox={`${minX} -4 ${maxX - minX} ${maxY + 4}`}>{cells}</svg>
          <small className="muted">{friendly ? 'Ô vàng: lính ta qua được' : 'Ô nâu: công trình'} · ô xanh: đất trống</small>
        </div>
      </div>
      <details className="rules">
        <summary>Luật đường đi game sẽ dùng</summary>
        <ul>
          <li>Lính ta chỉ đi qua ô trống hoặc công trình có “Lính ta đi qua được” (cổng). Không đi xuyên tường.</li>
          <li>Lính có “Leo lên tường” được đứng trên công trình có “Lính leo lên đứng được”, và nhận thêm tầm đánh / sát thương theo chỉ số “khi đứng trên tường”.</li>
          <li>Quái “đi vòng” tìm đường qua ô trống; chỉ khi không còn lối nào mới đánh phá tường / cổng chắn đường gần nhất (máu = chỉ số Máu theo cấp).</li>
          <li>Quái “phá thẳng” đánh luôn công trình chắn đường; quái “bay” bỏ qua tường. Chỉnh ở mục Quái vật → Cách đi đường.</li>
        </ul>
      </details>
    </section>
  );
}
