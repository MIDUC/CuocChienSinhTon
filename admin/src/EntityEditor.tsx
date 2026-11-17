import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { go } from './App';
import { copyText, toast } from './toast';
import GarrisonPanel, { GARRISON_PROPS } from './GarrisonPanel';
import type { EntityData, EntitySummary, EntityView, FieldDef, LevelData, LevelPrompt, Meta, Reward, TypeDef } from './types';

interface Props {
  id: string | null;
  typeDef: TypeDef;
  meta: Meta;
  all: EntitySummary[];
  onChanged: () => void;
}

const strip = (v: EntityView): EntityData => ({
  key: v.key,
  type: v.type,
  name: v.name,
  description: v.description,
  artSubject: v.artSubject,
  props: v.props,
  levels: v.levels,
});

function blank(typeDef: TypeDef): EntityData {
  return {
    key: '',
    type: typeDef.type,
    name: '',
    description: '',
    artSubject: '',
    props: typeDef.type === 'building' || typeDef.type === 'troop' || typeDef.type === 'general' || typeDef.type === 'monster' || typeDef.type === 'decoration' ? { size: 1 } : {},
    levels: [{ level: 1, stats: {}, cost: {}, image: null, artNote: '', ...(typeDef.hasRewards ? { rewards: [] } : {}) }],
  };
}

export default function EntityEditor({ id, typeDef, meta, all, onChanged }: Props) {
  const [view, setView] = useState<EntityView | null>(null);
  const [draft, setDraft] = useState<EntityData | null>(id ? null : blank(typeDef));
  const [saving, setSaving] = useState(false);
  const [prompts, setPrompts] = useState<LevelPrompt[]>([]);
  const [growth, setGrowth] = useState(30);

  useEffect(() => {
    if (!id) return;
    api
      .get(id)
      .then((v) => {
        setView(v);
        setDraft(strip(v));
        setPrompts(v.prompts);
      })
      .catch((e) => toast(e.message, 'error'));
  }, [id]);

  // Xem trước prompt khi đang sửa (chưa cần lưu)
  useEffect(() => {
    if (!draft || !draft.key || !draft.name) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api.previewPrompts(draft, ctl.signal).then(setPrompts).catch(() => undefined);
    }, 350);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [draft]);

  const dirty = useMemo(() => !view || JSON.stringify(strip(view)) !== JSON.stringify(draft), [view, draft]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (!draft) return <div className="muted">Đang tải…</div>;

  const set = (patch: Partial<EntityData>) => setDraft({ ...draft, ...patch });
  const setLevels = (levels: LevelData[]) => set({ levels: levels.map((l, i) => ({ ...l, level: i + 1 })) });

  const save = async () => {
    setSaving(true);
    try {
      if (view) {
        const v = await api.update(view.id, draft);
        setView(v);
        setDraft(strip(v));
        toast('Đã lưu');
      } else {
        const v = await api.create(draft);
        toast('Đã tạo');
        onChanged();
        go(`${v.type}/${v.id}`);
        return;
      }
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!view || !confirm(`Xoá "${view.name}" và toàn bộ ảnh của nó?`)) return;
    try {
      await api.remove(view.id);
      toast('Đã xoá');
      onChanged();
      go(view.type);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  /** Sau khi upload / xoá ảnh: cập nhật ảnh trong bản nháp mà không mất các thay đổi chưa lưu khác */
  const applyImageResult = (v: EntityView) => {
    setView(v);
    setDraft((d) => (d ? { ...d, levels: d.levels.map((l) => ({ ...l, image: v.levels.find((x) => x.level === l.level)?.image ?? null })) } : d));
    onChanged();
  };

  const addLevel = () => {
    const last = draft.levels[draft.levels.length - 1];
    const f = 1 + growth / 100;
    const scale = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * f * 100) / 100]));
    setLevels([
      ...draft.levels,
      {
        level: draft.levels.length + 1,
        stats: scale(last?.stats ?? {}),
        cost: scale(last?.cost ?? {}),
        image: null,
        artNote: '',
        ...(typeDef.hasRewards ? { rewards: (last?.rewards ?? []).map((r) => ({ ...r })) } : {}),
      },
    ]);
  };

  const removeLevel = (idx: number) => {
    if (draft.levels.length <= 1) return toast('Cần ít nhất 1 cấp', 'error');
    if (!confirm(`Xoá cấp ${idx + 1}? Các cấp sau sẽ được đánh số lại.`)) return;
    setLevels(draft.levels.filter((_, i) => i !== idx));
  };

  const hasGarrison = typeDef.type === 'building' && 'spawns' in draft.props;
  const resourceKeys = all.filter((e) => e.type === 'resource').map((e) => e.key);
  const placeholderFor = (level: number) =>
    view ? `/api/art/placeholder/${view.type}/${view.key}/${level}.svg?v=${new Date(view.updatedAt).getTime()}` : null;

  const allPrompts = () =>
    prompts.map((p) => `--- ${draft.name} · Cấp ${p.level} (${p.size.width}×${p.size.height}px) ---\n${p.prompt}\nNegative: ${p.negative}\nMidjourney: ${p.midjourney}`).join('\n\n');

  return (
    <div className="editor">
      <div className="page-head sticky">
        <a className="btn ghost" href={`#/${typeDef.type}`}>
          ← {typeDef.label}
        </a>
        <h1>
          {typeDef.icon} {draft.name || 'Chưa đặt tên'}
          {dirty && <span className="dirty">● chưa lưu</span>}
        </h1>
        <div className="spacer" />
        {view && (
          <button className="btn danger" onClick={remove}>
            Xoá
          </button>
        )}
        {view && dirty && (
          <button className="btn ghost" onClick={() => setDraft(strip(view))}>
            Huỷ thay đổi
          </button>
        )}
        <button className="btn primary" disabled={saving || !dirty} onClick={save}>
          {saving ? 'Đang lưu…' : view ? 'Lưu' : 'Tạo'}
        </button>
      </div>

      <section className="panel">
        <h2>Thông tin chung</h2>
        <div className="form-grid">
          <label>
            Tên hiển thị
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Nhà lính" />
          </label>
          <label>
            Key (định danh, không dấu)
            <input
              value={draft.key}
              onChange={(e) => set({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              placeholder="barracks"
            />
            <small>Dùng trong code game và tên file data/{typeDef.folder}/{draft.key || 'key'}.json</small>
          </label>
          <label className="full">
            Mô tả
            <textarea rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <label className="full">
            Mô tả hình ảnh cho AI (tiếng Anh)
            <textarea
              rows={2}
              value={draft.artSubject}
              onChange={(e) => set({ artSubject: e.target.value })}
              placeholder="a military barracks with training dummies and weapon racks"
            />
            <small>Ghép vào đầu prompt vẽ ảnh của mọi cấp. Ngoại hình riêng từng cấp sửa ở mục “Hình ảnh theo cấp”.</small>
          </label>
        </div>
        <PropsEditor typeDef={typeDef} props={draft.props} all={all} hide={hasGarrison ? GARRISON_PROPS : []} onChange={(props) => set({ props })} />
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Cấp độ & chỉ số</h2>
          <div className="spacer" />
          <label className="inline">
            Tăng mỗi cấp
            <input type="number" value={growth} onChange={(e) => setGrowth(Number(e.target.value) || 0)} style={{ width: 64 }} />%
          </label>
          <button className="btn" onClick={addLevel}>
            + Thêm cấp {draft.levels.length + 1}
          </button>
        </div>
        <StatGrid
          title="Chỉ số"
          field="stats"
          levels={draft.levels}
          suggestions={typeDef.stats}
          growth={growth}
          onChange={setLevels}
          onRemoveLevel={removeLevel}
        />
        {typeDef.hasCost && (
          <StatGrid
            title="Chi phí xây / nâng cấp"
            field="cost"
            levels={draft.levels}
            suggestions={resourceKeys.map((k) => ({ key: k, label: all.find((e) => e.key === k && e.type === 'resource')?.name ?? k }))}
            growth={growth}
            onChange={setLevels}
          />
        )}
        {typeDef.hasRewards && <RewardsEditor levels={draft.levels} all={all} onChange={setLevels} />}
      </section>

      {hasGarrison && (
        <GarrisonPanel
          draft={draft}
          all={all}
          buildingImage={(lvl) => draft.levels.find((l) => l.level === lvl)?.image ?? placeholderFor(lvl)}
          setProps={(props) => set({ props })}
          setLevels={setLevels}
          troopStatDefs={meta.types.find((t) => t.type === 'troop')?.stats ?? []}
        />
      )}

      <section className="panel">
        <div className="section-head">
          <h2>Hình ảnh theo cấp</h2>
          <div className="spacer" />
          {prompts.length > 0 && (
            <button className="btn" onClick={() => copyText(allPrompts())}>
              ⧉ Copy prompt tất cả các cấp
            </button>
          )}
        </div>
        <p className="muted">
          Mỗi cấp có ảnh riêng. Chưa upload thì game dùng ảnh tạm (SVG). Copy prompt bên dưới sang Midjourney / Leonardo / ChatGPT…, tạo
          ảnh rồi upload lại vào đúng cấp. Phong cách chung sửa ở <a href="#/style">Phong cách & prompt chung</a>.
        </p>
        <div className="levels">
          {draft.levels.map((l, i) => (
            <LevelCard
              key={i}
              level={l}
              entityId={view?.id ?? null}
              placeholder={placeholderFor(l.level)}
              prompt={prompts.find((p) => p.level === l.level)}
              onNote={(artNote) => setLevels(draft.levels.map((x, j) => (j === i ? { ...x, artNote } : x)))}
              onImage={applyImageResult}
              savedLevelCount={view && view.levels.length === draft.levels.length ? view.levels.length : 0}
            />
          ))}
        </div>
      </section>

      <details className="panel">
        <summary>JSON của bản ghi (đúng như lưu trong database)</summary>
        <pre className="json">{JSON.stringify(draft, null, 2)}</pre>
        <button className="btn" onClick={() => copyText(JSON.stringify(draft, null, 2))}>
          ⧉ Copy JSON
        </button>
      </details>
      {meta.authRequired && <p className="muted">Cần nhập mã quản trị ở góc trên để lưu.</p>}
    </div>
  );
}

/* ---------------- Thuộc tính cố định ---------------- */

function parseValue(s: string): string | number | boolean {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s.trim() !== '' && Number.isFinite(Number(s))) return Number(s);
  return s;
}

function PropsEditor({
  typeDef,
  props,
  all,
  hide,
  onChange,
}: {
  typeDef: TypeDef;
  props: EntityData['props'];
  all: EntitySummary[];
  hide: string[];
  onChange: (p: EntityData['props']) => void;
}) {
  const [newKey, setNewKey] = useState('');
  const allEntries = Object.entries(props);
  const entries = allEntries.filter(([k]) => !hide.includes(k));
  const missing = typeDef.props.filter((p) => !(p.key in props) && !(hide.length && hide.includes(p.key)));
  const listId = (k: string) => (k === 'spawns' ? 'dl-units' : k === 'produces' ? 'dl-resources' : undefined);
  const rename = (oldK: string, newK: string) => {
    if (!newK || newK in props) return;
    onChange(Object.fromEntries(allEntries.map(([k, v]) => (k === oldK ? [newK, v] : [k, v]))));
  };
  return (
    <div className="props">
      <h3>Thuộc tính cố định (không đổi theo cấp)</h3>
      <datalist id="dl-units">
        {all.filter((e) => e.type === 'troop' || e.type === 'general').map((e) => (
          <option key={e.id} value={e.key}>{e.name}</option>
        ))}
      </datalist>
      <datalist id="dl-resources">
        {all.filter((e) => e.type === 'resource').map((e) => (
          <option key={e.id} value={e.key}>{e.name}</option>
        ))}
      </datalist>
      <div className="kv">
        {entries.map(([k, v]) => {
          const def = typeDef.props.find((p) => p.key === k);
          return (
            <div className="kv-row" key={k}>
              <input className="k" defaultValue={k} onBlur={(e) => rename(k, e.target.value.trim())} title={def?.label} />
              <input
                className="v"
                list={listId(k)}
                value={String(v)}
                placeholder={def?.hint}
                onChange={(e) => onChange({ ...props, [k]: parseValue(e.target.value) })}
              />
              <span className="muted kv-label">{def?.label ?? ''}</span>
              <button className="icon-btn" title="Xoá" onClick={() => onChange(Object.fromEntries(allEntries.filter(([x]) => x !== k)))}>
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <div className="add-row">
        {missing.map((p) => (
          <button key={p.key} className="chip" title={p.hint} onClick={() => onChange({ ...props, [p.key]: '' })}>
            + {p.label}
          </button>
        ))}
        <input placeholder="thuộc tính khác…" value={newKey} onChange={(e) => setNewKey(e.target.value.replace(/\s/g, ''))} />
        <button
          className="btn small"
          disabled={!newKey || newKey in props}
          onClick={() => {
            onChange({ ...props, [newKey]: '' });
            setNewKey('');
          }}
        >
          Thêm
        </button>
      </div>
    </div>
  );
}

/* ---------------- Bảng chỉ số theo cấp ---------------- */

function StatGrid({
  title,
  field,
  levels,
  suggestions,
  growth,
  onChange,
  onRemoveLevel,
}: {
  title: string;
  field: 'stats' | 'cost';
  levels: LevelData[];
  suggestions: FieldDef[];
  growth: number;
  onChange: (l: LevelData[]) => void;
  onRemoveLevel?: (idx: number) => void;
}) {
  const [custom, setCustom] = useState('');
  const keys = useMemo(() => {
    const seen: string[] = [];
    for (const l of levels) for (const k of Object.keys(l[field])) if (!seen.includes(k)) seen.push(k);
    return seen;
  }, [levels, field]);
  const label = (k: string) => suggestions.find((s) => s.key === k)?.label;

  const setCell = (li: number, k: string, raw: string) => {
    onChange(
      levels.map((l, i) => {
        if (i !== li) return l;
        const m = { ...l[field] };
        if (raw === '') delete m[k];
        else m[k] = Number(raw);
        return { ...l, [field]: m };
      }),
    );
  };
  const addRow = (k: string) => {
    if (!k || keys.includes(k)) return;
    onChange(levels.map((l) => ({ ...l, [field]: { ...l[field], [k]: 0 } })));
  };
  const removeRow = (k: string) =>
    onChange(
      levels.map((l) => {
        const m = { ...l[field] };
        delete m[k];
        return { ...l, [field]: m };
      }),
    );
  const autofill = (k: string) => {
    const base = levels[0]?.[field][k];
    if (base === undefined) return toast('Nhập giá trị cấp 1 trước', 'error');
    const f = 1 + growth / 100;
    const isInt = Number.isInteger(base);
    onChange(
      levels.map((l, i) => {
        const v = base * Math.pow(f, i);
        return { ...l, [field]: { ...l[field], [k]: isInt ? Math.round(v) : Math.round(v * 100) / 100 } };
      }),
    );
  };

  return (
    <div className="statgrid">
      <h3>{title}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="sticky-col">{field === 'cost' ? 'Tài nguyên' : 'Chỉ số'}</th>
              {levels.map((l, i) => (
                <th key={i}>
                  Cấp {l.level}
                  {onRemoveLevel && levels.length > 1 && (
                    <button className="icon-btn tiny" title={`Xoá cấp ${l.level}`} onClick={() => onRemoveLevel(i)}>
                      ✕
                    </button>
                  )}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <th className="sticky-col">
                  <div>{label(k) ?? k}</div>
                  {label(k) && <code>{k}</code>}
                </th>
                {levels.map((l, i) => (
                  <td key={i}>
                    <input type="number" step="any" value={l[field][k] ?? ''} onChange={(e) => setCell(i, k, e.target.value)} />
                  </td>
                ))}
                <td className="row-actions">
                  <button className="icon-btn" title={`Tự điền các cấp từ cấp 1 (+${growth}%/cấp)`} onClick={() => autofill(k)}>
                    ⇢
                  </button>
                  <button className="icon-btn" title="Xoá dòng" onClick={() => removeRow(k)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {!keys.length && (
              <tr>
                <td colSpan={levels.length + 2} className="muted">
                  Chưa có {field === 'cost' ? 'chi phí' : 'chỉ số'} nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="add-row">
        {suggestions
          .filter((s) => !keys.includes(s.key))
          .map((s) => (
            <button key={s.key} className="chip" title={s.hint ?? s.key} onClick={() => addRow(s.key)}>
              + {s.label}
            </button>
          ))}
        <input placeholder={field === 'cost' ? 'key tài nguyên…' : 'chỉ số khác…'} value={custom} onChange={(e) => setCustom(e.target.value.replace(/\s/g, ''))} />
        <button
          className="btn small"
          disabled={!custom || keys.includes(custom)}
          onClick={() => {
            addRow(custom);
            setCustom('');
          }}
        >
          Thêm
        </button>
      </div>
    </div>
  );
}

/* ---------------- Phần thưởng rương ---------------- */

function RewardsEditor({ levels, all, onChange }: { levels: LevelData[]; all: EntitySummary[]; onChange: (l: LevelData[]) => void }) {
  const items = all.filter((e) => ['resource', 'troop', 'general', 'chest'].includes(e.type));
  const nameOf = (item: string) => {
    const [t, k] = item.split(':');
    return all.find((e) => e.type === t && e.key === k)?.name;
  };
  const upd = (li: number, rewards: Reward[]) => onChange(levels.map((l, i) => (i === li ? { ...l, rewards } : l)));
  return (
    <div className="statgrid">
      <h3>Phần thưởng trong rương</h3>
      <datalist id="dl-items">
        {items.map((e) => (
          <option key={e.id} value={`${e.type}:${e.key}`}>{e.name}</option>
        ))}
      </datalist>
      <div className="rewards">
        {levels.map((l, li) => (
          <div key={li} className="reward-level">
            <b>Cấp {l.level}</b>
            <table>
              <thead>
                <tr>
                  <th>Vật phẩm</th>
                  <th>Ít nhất</th>
                  <th>Nhiều nhất</th>
                  <th>Tỉ lệ %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(l.rewards ?? []).map((r, ri) => {
                  const set = (patch: Partial<Reward>) => upd(li, (l.rewards ?? []).map((x, j) => (j === ri ? { ...x, ...patch } : x)));
                  return (
                    <tr key={ri}>
                      <td>
                        <input list="dl-items" value={r.item} onChange={(e) => set({ item: e.target.value })} />
                        <small className="muted">{nameOf(r.item) ?? ''}</small>
                      </td>
                      <td><input type="number" value={r.min} onChange={(e) => set({ min: Number(e.target.value) })} /></td>
                      <td><input type="number" value={r.max} onChange={(e) => set({ max: Number(e.target.value) })} /></td>
                      <td>
                        <input type="number" step="any" value={Math.round(r.chance * 10000) / 100} onChange={(e) => set({ chance: Number(e.target.value) / 100 })} />
                      </td>
                      <td>
                        <button className="icon-btn" onClick={() => upd(li, (l.rewards ?? []).filter((_, j) => j !== ri))}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="btn small" onClick={() => upd(li, [...(l.rewards ?? []), { item: 'resource:gold', min: 1, max: 10, chance: 1 }])}>
              + Thêm phần thưởng
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Ảnh + prompt của 1 cấp ---------------- */

function LevelCard({
  level,
  entityId,
  placeholder,
  prompt,
  onNote,
  onImage,
  savedLevelCount,
}: {
  level: LevelData;
  entityId: string | null;
  placeholder: string | null;
  prompt?: LevelPrompt;
  onNote: (s: string) => void;
  onImage: (v: EntityView) => void;
  savedLevelCount: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const canUpload = !!entityId && level.level <= savedLevelCount;
  const src = level.image ?? placeholder;

  const upload = async (file?: File | null) => {
    if (!file || !entityId) return;
    setBusy(true);
    try {
      onImage(await api.uploadImage(entityId, level.level, file));
      toast(`Đã cập nhật ảnh cấp ${level.level}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const clear = async () => {
    if (!entityId || !confirm(`Xoá ảnh cấp ${level.level} và quay về ảnh tạm?`)) return;
    try {
      onImage(await api.clearImage(entityId, level.level));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="level-card">
      <div className="level-head">
        <b>Cấp {level.level}</b>
        {level.image ? <span className="tag ok">ảnh thật</span> : <span className="tag">ảnh tạm</span>}
        {prompt && (
          <span className="muted size">
            {prompt.size.width}×{prompt.size.height}px
          </span>
        )}
      </div>
      <div
        className={`level-img checker ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (canUpload) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (canUpload) upload(e.dataTransfer.files[0]);
        }}
      >
        {src ? <img src={src} alt={`Cấp ${level.level}`} /> : <span className="muted">Lưu để xem ảnh tạm</span>}
        {busy && <div className="overlay">Đang tải lên…</div>}
      </div>
      <div className="img-actions">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={(e) => upload(e.target.files?.[0])} />
        <button className="btn small" disabled={!canUpload || busy} onClick={() => fileRef.current?.click()}>
          {level.image ? 'Thay ảnh' : 'Upload ảnh'}
        </button>
        {level.image && (
          <>
            <a className="btn small ghost" href={level.image} target="_blank" rel="noreferrer">
              Mở
            </a>
            <button className="btn small ghost" onClick={clear}>
              Xoá ảnh
            </button>
          </>
        )}
        {!canUpload && <small className="muted">Lưu trước rồi mới upload được</small>}
      </div>
      <label className="note">
        Ngoại hình cấp này (tiếng Anh)
        <textarea rows={2} value={level.artNote} placeholder="stone walls, blue tiled roof, banners" onChange={(e) => onNote(e.target.value)} />
      </label>
      {prompt ? <PromptBox p={prompt} /> : <p className="muted">Nhập tên và key để xem prompt.</p>}
    </div>
  );
}

function PromptBox({ p }: { p: LevelPrompt }) {
  const [tab, setTab] = useState<'prompt' | 'mj'>('prompt');
  return (
    <div className="prompt-box">
      <div className="tabs">
        <button className={tab === 'prompt' ? 'on' : ''} onClick={() => setTab('prompt')}>
          Leonardo / SD / ChatGPT
        </button>
        <button className={tab === 'mj' ? 'on' : ''} onClick={() => setTab('mj')}>
          Midjourney
        </button>
      </div>
      {tab === 'prompt' ? (
        <>
          <PromptField label="Prompt" text={p.prompt} />
          <PromptField label="Negative prompt" text={p.negative} />
        </>
      ) : (
        <PromptField label="Prompt Midjourney (đã gồm --ar, --no)" text={p.midjourney} />
      )}
      <div className="size-note">
        <b>
          Kích thước đề xuất: {p.size.width}×{p.size.height} px
        </b>
        <span>{p.size.note}</span>
      </div>
    </div>
  );
}

function PromptField({ label, text }: { label: string; text: string }) {
  return (
    <div className="prompt-field">
      <div className="pf-head">
        <span>{label}</span>
        <button className="btn small" onClick={() => copyText(text)}>
          ⧉ Copy
        </button>
      </div>
      <textarea readOnly rows={label.startsWith('Negative') ? 2 : 5} value={text} onFocus={(e) => e.currentTarget.select()} />
    </div>
  );
}
