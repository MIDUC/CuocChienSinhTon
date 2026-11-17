import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import type { EntitySummary, EntityType, Meta } from './types';
import EntityEditor from './EntityEditor';
import ArtStyleEditor from './ArtStyleEditor';
import { Toaster, toast } from './toast';

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
        <div className="nav-title">Dữ liệu game</div>
        {meta.types.map((t) => (
          <a key={t.type} href={`#/${t.type}`} className={route.page !== 'style' && route.type === t.type ? 'active' : ''}>
            <span className="nav-icon">{t.icon}</span>
            {t.label}
            <span className="count">{all.filter((e) => e.type === t.type).length}</span>
          </a>
        ))}
        <div className="nav-title">Phong cách ảnh</div>
        <a href="#/style" className={route.page === 'style' ? 'active' : ''}>
          <span className="nav-icon">🎨</span>Phong cách & prompt chung
        </a>
      </nav>
      <main className="content">
        {route.page === 'style' && <ArtStyleEditor />}
        {route.page === 'list' && typeDef && <EntityList typeDef={typeDef} items={all.filter((e) => e.type === route.type)} />}
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

function EntityList({ typeDef, items }: { typeDef: Meta['types'][number]; items: EntitySummary[] }) {
  const [q, setQ] = useState('');
  const shown = items.filter((i) => (i.name + ' ' + i.key).toLowerCase().includes(q.toLowerCase()));
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
    </div>
  );
}
