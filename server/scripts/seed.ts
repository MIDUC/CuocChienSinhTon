/**
 * Nạp dữ liệu từ thư mục data/ vào PostgreSQL.
 *   npm run db:seed            -> thêm mới + ghi đè các key có trong file
 *   npm run db:seed -- --prune -> đồng thời xoá các bản ghi không còn file
 */
import { PrismaClient } from '@prisma/client';
import { readArtStyleFile, readDataFiles } from '../src/entities/files';

async function main() {
  const prisma = new PrismaClient();
  const prune = process.argv.includes('--prune');
  const items = await readDataFiles();
  for (const { entity } of items) {
    await prisma.gameEntity.upsert({
      where: { type_key: { type: entity.type, key: entity.key } },
      create: { type: entity.type, key: entity.key, name: entity.name, data: entity as any },
      update: { name: entity.name, data: entity as any },
    });
  }
  if (prune) {
    const keep = new Set(items.map((i) => `${i.entity.type}/${i.entity.key}`));
    const all = await prisma.gameEntity.findMany({ select: { id: true, type: true, key: true } });
    const del = all.filter((r) => !keep.has(`${r.type}/${r.key}`));
    if (del.length) await prisma.gameEntity.deleteMany({ where: { id: { in: del.map((d) => d.id) } } });
    console.log(`Đã xoá ${del.length} bản ghi không còn file`);
  }
  const style = await readArtStyleFile();
  if (style) {
    await prisma.setting.upsert({ where: { key: 'artStyle' }, create: { key: 'artStyle', value: style as any }, update: { value: style as any } });
    console.log('Đã nạp phong cách vẽ từ data/art-style.json');
  }
  console.log(`Đã nạp ${items.length} bản ghi từ data/`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
