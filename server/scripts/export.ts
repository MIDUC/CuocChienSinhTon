/** Xuất dữ liệu trong PostgreSQL ra thư mục data/ (mỗi thực thể một file JSON) */
import { PrismaClient } from '@prisma/client';
import { writeArtStyleFile, writeDataFiles } from '../src/entities/files';

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.gameEntity.findMany({ orderBy: [{ type: 'asc' }, { createdAt: 'asc' }] });
  const files = await writeDataFiles(rows.map((r) => r.data as any));
  const style = await prisma.setting.findUnique({ where: { key: 'artStyle' } });
  if (style) await writeArtStyleFile(style.value);
  console.log(`Đã ghi ${files.length} file vào data/`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
