import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import type { EntitySummary, EntityType, Meta } from './types';
import EntityEditor from './EntityEditor';
import ArtStyleEditor from './ArtStyleEditor';
import { Toaster, toast } from './toast';
import { describe } from './EffectsEditor';

type Route =
  | { page: 'list'; type: EntityType }
  | { page: 'edit'; type: EntityType; id: string | null }
  | { page: 'style' };

function parseHash(types: EntityType[]): Route {
  const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 'style') return { page: 'style' };
  const type = (types.includes(a as EntityType) ? a : types[0]) as EntityType;
  if (b === 'new') return { page: 'edit', type, id: null };
  if (b) return { page: 'edit', type, id: b };
  return { page: 'list', type };
}

export function go(path: string) {
  location.hash = '#/' + path;
}

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState('');
  const [route, setRoute] = useState<Route | null>(null);
  const [all, setAll] = useState<EntitySummary[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const reload = useCallback(() => api.list().then(setAll).catch((e) => toast(e.message, 'error')), []);

  useEffect(() => {
    api
      .meta()
      .then((m) => {
        setMeta(m);
        const types = m.types.map((t) => t.type);
        setRoute(parseHash(types));
        window.addEventListener('hashchange', () => {
          setRoute(parseHash(types));
          setMenuOpen(false);
        });
      })
      .catch((e) => setError(`Không kết nối được server: ${e.message}`));
    reload();
  }, [reload]);

  if (error) return <div className="fatal">{error}<br />Hãy chạy <code>npm run dev:server</code> rồi tải lại trang.</div>;
  if (!meta || !route) return <div className="fatal">Đang tải…</div>;

  const typeDef = route.page !== 'style' ? meta.types.find((t) => t.type === route.type)! : null;

  return (
    <div className="layout">
      <header className="topbar">
        <button className="icon-btn menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">☰</button>
        <div className="brand">🏰 Cuộc Chiến Sinh Tồn <span>Admin</span></div>
        <div className="spacer" />
        {meta.authRequired && <TokenBox />}
        <button
          className="btn ghost"
          title="Ghi toàn bộ dữ liệu ra thư mục data/ của repo (mỗi thực thể 1 file JSON)"
          onClick={() => api.exportFiles().then((r) => toast(`Đã ghi ${r.count} file vào data/`)).catch((e) => toast(e.message, 'error'))}
        >
          ⤓ Xuất ra file JSON
        </button>
      </header>
      <nav className={`sidebar ${menuOpen ? 'open' : ''}`}>
        {[
          { title: 'Dữ liệu game', types: meta.types.filter((t) => !t.hasEffects) },
          { title: 'Vật phẩm', types: meta.types.filter((t) => t.hasEffects) },
        ].map((g) => [
          <div key={g.title} className="nav-title">{g.title}</div>,
          ...g.types.map((t) => (
          <a key={t.type} href={`#/${t.type}`} className={route.page !== 'style' && route.type === t.type ? 'active' : ''}>
            <span className="nav-icon">{t.icon}</span>
            {t.label}
            <span className="count">{all.filter((e) => e.type === t.type).length}</span>
          </a>
          )),
        ])}
        <div className="nav-title">Phong cách ảnh</div>
        <a href="#/style" className={route.page === 'style' ? 'active' : ''}>
          <span className="nav-icon">🎨</span>Phong cách & prompt chung
        </a>
      </nav>
      <main className="content">
        {route.page === 'style' && <ArtStyleEditor />}
        {route.page === 'list' && typeDef && <EntityList typeDef={typeDef} meta={meta} items={all.filter((e) => e.type === route.type)} />}
        {route.page === 'edit' && typeDef && (
          <EntityEditor key={route.id ?? 'new-' + route.type} id={route.id} typeDef={typeDef} meta={meta} all={all} onChanged={reload} />
        )}
      </main>
      <Toaster />
    </div>
  );
}

function TokenBox() {
  const [v, setV] = useState(getToken());
  return (
    <input
      className="token"
      type="password"
      placeholder="Mã quản trị"
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        setToken(e.target.value);
      }}
    />
  );
}

const SLOT_LABEL: Record<string, string> = { weapon: 'Vũ khí', armor: 'Giáp', helmet: 'Mũ', boots: 'Giày', ring: 'Nhẫn' };
const RARITY_LABEL: Record<string, string> = { common: 'Thường', rare: 'Hiếm', epic: 'Sử thi', legendary: 'Huyền thoại' };

function EntityList({ typeDef, meta, items }: { typeDef: Meta['types'][number]; meta: Meta; items: EntitySummary[] }) {
  const [q, setQ] = useState('');
  const [view, setView] = useState<'table' | 'cards'>(typeDef.hasEffects ? 'table' : 'cards');
  const [rarity, setRarity] = useState('');
  const [slot, setSlot] = useState('');
  useEffect(() => {
    setView(typeDef.hasEffects ? 'table' : 'cards');
    setRarity('');
    setSlot('');
  }, [typeDef.type]);
  const shown = items.filter(
    (i) =>
      (i.name + ' ' + i.key).toLowerCase().includes(q.toLowerCase()) &&
      (!rarity || i.props.rarity === rarity) &&
      (!slot || i.props.slot === slot),
  );
  const statLabel = (k: string) => typeDef.stats.find((s) => s.key === k)?.label ?? k;
  const effDef = (t: string) => meta.effects.find((d) => d.type === t);
  return (
    <div>
      <div className="page-head">
        <h1>
          {typeDef.icon} {typeDef.label}
        </h1>
        <input className="search" placeholder="Tìm theo tên hoặc key…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => go(`${typeDef.type}/new`)}>
          + Thêm {typeDef.label.toLowerCase()}
        </button>
      </div>
      <p className="muted">
        Mỗi {typeDef.label.toLowerCase()} là một bản ghi JSON riêng trong database (file tương ứng: <code>data/{typeDef.folder}/&lt;key&gt;.json</code>).
        {typeDef.note && <> {typeDef.note}</>}
      </p>
      {typeDef.hasEffects && (
        <div className="filters">
          <div className="view-toggle tabs">
            <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Bảng tổng quan</button>
            <button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Thẻ ảnh</button>
          </div>
          <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
            <option value="">Mọi độ hiếm</option>
            {Object.entries(RARITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {typeDef.type === 'equipment' && (
            <select value={slot} onChange={(e) => setSlot(e.target.value)}>
              <option value="">Mọi vị trí</option>
              {Object.entries(SLOT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </div>
      )}
      {view === 'table' ? (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="overview">
            <thead>
              <tr>
                <th />
                <th>Tên</th>
                <th>{typeDef.type === 'equipment' ? 'Vị trí / dành cho' : 'Áp dụng cho'}</th>
                <th>Độ hiếm</th>
                <th>Cộng chỉ số (cấp cao nhất)</th>
                <th>Công dụng đặc biệt (cấp cao nhất)</th>
                <th>Cấp</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} onClick={() => go(`${e.type}/${e.id}`)} style={{ cursor: 'pointer' }}>
                  <td><img className="ov-img checker" src={e.image ?? e.placeholder} alt="" loading="lazy" /></td>
                  <td>
                    <a href={`#/${e.type}/${e.id}`}>{e.name}</a>
                    <div><code className="muted">{e.key}</code></div>
                    <small className="muted">{e.description}</small>
                  </td>
                  <td>
                    {typeDef.type === 'equipment'
                      ? `${SLOT_LABEL[String(e.props.slot)] ?? e.props.slot ?? '—'} · ${({ general: 'Tướng', troop: 'Lính', both: 'Tướng & lính' } as Record<string, string>)[String(e.props.equipFor)] ?? e.props.equipFor ?? ''}`
                      : String(e.props.appliesTo ?? 'all')}
                    {e.props.setName ? <div><small className="muted">Bộ: {String(e.props.setName)}</small></div> : null}
                  </td>
                  <td className={`rar-${e.props.rarity}`}>{RARITY_LABEL[String(e.props.rarity)] ?? String(e.props.rarity ?? '')}</td>
                  <td>
                    {Object.entries(e.top?.stats ?? {}).map(([k, v]) => (
                      <span key={k} className="pill">{statLabel(k)} {v}</span>
                    ))}
                  </td>
                  <td>
                    {(e.top?.effects ?? []).map((x, i) => (
                      <span key={i} className="pill eff">{describe(x, effDef(x.type))}</span>
                    ))}
                    {!(e.top?.effects ?? []).length && <span className="muted">—</span>}
                  </td>
                  <td>{e.levelCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <div className="empty">Chưa có dữ liệu.</div>}
        </div>
      ) : (
      <div className="cards">
        {shown.map((e) => (
          <a key={e.id} className="card" href={`#/${e.type}/${e.id}`}>
            <div className="thumb checker">
              <img src={e.image ?? e.placeholder} alt="" loading="lazy" />
              {!e.image && <span className="badge">ảnh tạm</span>}
            </div>
            <div className="card-body">
              <b>{e.name}</b>
              <code>{e.key}</code>
              <span className="muted">{e.levelCount} cấp</span>
            </div>
          </a>
        ))}
        {!shown.length && <div className="empty">Chưa có dữ liệu.</div>}
      </div>
      )}
    </div>
  );
}
