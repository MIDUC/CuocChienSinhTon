import { resolve } from 'path';

/** Thư mục gốc của repo (server/ nằm ngay bên dưới) */
export const REPO_ROOT = resolve(__dirname, '..', '..', '..');
/** Ảnh upload — mặc định <repo>/assets, phục vụ qua URL /assets/... */
export const ASSETS_DIR = process.env.ASSETS_DIR ? resolve(process.env.ASSETS_DIR) : resolve(REPO_ROOT, 'assets');
/** File JSON dữ liệu game — <repo>/data/<thư mục loại>/<key>.json */
export const DATA_DIR = resolve(REPO_ROOT, 'data');
/** Bản build của trang admin */
export const ADMIN_DIST = resolve(REPO_ROOT, 'admin', 'dist');
