import type { Effect, EffectTypeDef, LevelData } from './types';

/** Công dụng đặc biệt theo từng cấp (cổ vật, trang bị) */
export default function EffectsEditor({
  levels,
  effectTypes,
  onChange,
}: {
  levels: LevelData[];
  effectTypes: EffectTypeDef[];
  onChange: (l: LevelData[]) => void;
}) {
  const upd = (li: number, effects: Effect[]) => onChange(levels.map((l, i) => (i === li ? { ...l, effects } : l)));
  const def = (t: string) => effectTypes.find((d) => d.type === t);

  return (
    <div className="statgrid">
      <h3>Công dụng đặc biệt theo cấp</h3>
      <p className="muted">
        Ngoài cộng chỉ số, mỗi món có thể có công dụng riêng: hút máu, chí mạng, làm chậm, gây choáng, thiêu đốt, sát thương lan, hào
        quang… Mỗi cấp tự đặt công dụng và độ mạnh riêng.
      </p>
      <div className="effects">
        {levels.map((l, li) => (
          <div key={li} className="effect-level">
            <div className="effect-head">
              <b>Cấp {l.level}</b>
              <div className="spacer" />
              {li > 0 && (
                <button className="btn small ghost" onClick={() => upd(li, (levels[li - 1].effects ?? []).map((e) => ({ ...e })))}>
                  Chép từ cấp {levels[li - 1].level}
                </button>
              )}
            </div>
            {(l.effects ?? []).map((e, ei) => {
              const d = def(e.type);
              const set = (patch: Partial<Effect>) => upd(li, (l.effects ?? []).map((x, j) => (j === ei ? { ...x, ...patch } : x)));
              return (
                <div key={ei} className="effect-row">
                  <select value={e.type} onChange={(ev) => set({ type: ev.target.value })} title={d?.desc}>
                    {!d && <option value={e.type}>{e.type}</option>}
                    {effectTypes.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <label>
                    Độ mạnh
                    <span className="with-unit">
                      <input type="number" step="any" value={e.value} onChange={(ev) => set({ value: Number(ev.target.value) })} />
                      <small>{d?.unit}</small>
                    </span>
                  </label>
                  {d?.uses.includes('chance') && (
                    <label>
                      Tỉ lệ %
                      <input type="number" step="any" min="0" max="100" value={Math.round(e.chance * 10000) / 100} onChange={(ev) => set({ chance: Number(ev.target.value) / 100 })} />
                    </label>
                  )}
                  {d?.uses.includes('durationSec') && (
                    <label>
                      Kéo dài (giây)
                      <input type="number" step="any" min="0" value={e.durationSec} onChange={(ev) => set({ durationSec: Number(ev.target.value) })} />
                    </label>
                  )}
                  {d?.uses.includes('radius') && (
                    <label>
                      Bán kính (ô)
                      <input type="number" step="any" min="0" value={e.radius} onChange={(ev) => set({ radius: Number(ev.target.value) })} />
                    </label>
                  )}
                  <button className="icon-btn" title="Xoá công dụng" onClick={() => upd(li, (l.effects ?? []).filter((_, j) => j !== ei))}>
                    ✕
                  </button>
                  {d && <small className="muted effect-desc">{describe(e, d)}</small>}
                </div>
              );
            })}
            <button
              className="btn small"
              onClick={() => upd(li, [...(l.effects ?? []), { type: effectTypes[0]?.type ?? 'lifesteal', value: 10, chance: 1, durationSec: 0, radius: 0 }])}
            >
              + Thêm công dụng
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Câu mô tả dễ đọc, ví dụ "25% cơ hội: Làm chậm 30 % tốc độ trong 2 giây" */
export function describe(e: Effect, d?: EffectTypeDef) {
  if (!d) return e.type;
  const parts: string[] = [];
  if (d.uses.includes('chance') && e.chance < 1) parts.push(`${Math.round(e.chance * 1000) / 10}% cơ hội:`);
  parts.push(`${d.label} ${e.value}${d.unit ? ' ' + d.unit : ''}`);
  if (d.uses.includes('durationSec') && e.durationSec) parts.push(`trong ${e.durationSec} giây`);
  if (d.uses.includes('radius') && e.radius) parts.push(`bán kính ${e.radius} ô`);
  return parts.join(' ');
}
