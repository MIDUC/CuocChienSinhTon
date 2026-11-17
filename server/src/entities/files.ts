import { promises as fs } from 'fs';
import { join } from 'path';
import { DATA_DIR } from '../common/paths';
import { ENTITY_TYPES, EntityData, TYPE_DEFS, normalizeEntity } from './definitions';

/** Đọc toàn bộ file JSON trong data/<thư mục>/ */
export async function readDataFiles(dir = DATA_DIR): Promise<{ file: string; entity: EntityData }[]> {
  const out: { file: string; entity: EntityData }[] = [];
  for (const type of ENTITY_TYPES) {
    const folder = join(dir, TYPE_DEFS[type].folder);
    let names: string[] = [];
    try {
      names = (await fs.readdir(folder)).filter((n) => n.endsWith('.json')).sort();
    } catch {
      continue;
    }
    for (const n of names) {
      const file = join(folder, n);
      const raw = JSON.parse(await fs.readFile(file, 'utf8'));
      try {
        out.push({ file, entity: normalizeEntity(raw, type) });
      } catch (e) {
        throw new Error(`${file}: ${(e as Error).message}`);
      }
    }
  }
  return out;
}

/** Ghi mỗi thực thể ra data/<thư mục>/<key>.json; xoá file của thực thể không còn tồn tại */
export async function writeDataFiles(entities: EntityData[], dir = DATA_DIR) {
  const written: string[] = [];
  for (const type of ENTITY_TYPES) {
    const folder = join(dir, TYPE_DEFS[type].folder);
    await fs.mkdir(folder, { recursive: true });
    const keep = new Set<string>();
    for (const e of entities.filter((x) => x.type === type)) {
      const name = `${e.key}.json`;
      keep.add(name);
      await fs.writeFile(join(folder, name), JSON.stringify(e, null, 2) + '\n', 'utf8');
      written.push(join(TYPE_DEFS[type].folder, name));
    }
    for (const n of await fs.readdir(folder)) {
      if (n.endsWith('.json') && !keep.has(n)) await fs.unlink(join(folder, n));
    }
  }
  return written;
}

/** Phong cách vẽ ảnh dùng chung, lưu ở data/art-style.json */
export async function readArtStyleFile(dir = DATA_DIR): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(join(dir, 'art-style.json'), 'utf8'));
  } catch {
    return null;
  }
}

export async function writeArtStyleFile(style: unknown, dir = DATA_DIR) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, 'art-style.json'), JSON.stringify(style, null, 2) + '\n', 'utf8');
}
