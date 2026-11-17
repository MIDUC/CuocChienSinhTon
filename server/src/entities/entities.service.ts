import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { promises as fs } from 'fs';
import { extname, join, resolve } from 'path';
import { PrismaService } from '../common/prisma.service';
import { ASSETS_DIR } from '../common/paths';
import { SettingsService } from '../settings/settings.service';
import { buildPrompts } from '../art/prompt';
import { EntityData, EntityTypeKey, isEntityType, normalizeEntity } from './definitions';
import { writeArtStyleFile, writeDataFiles } from './files';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

@Injectable()
export class EntitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private toData(row: { data: Prisma.JsonValue }): EntityData {
    return row.data as unknown as EntityData;
  }

  /** Dữ liệu trả cho trang admin: bản ghi + prompt vẽ ảnh + link ảnh tạm của từng cấp */
  private async view(row: { id: string; updatedAt: Date; data: Prisma.JsonValue }) {
    const data = this.toData(row);
    const style = await this.settings.getArtStyle();
    const v = row.updatedAt.getTime();
    return {
      id: row.id,
      updatedAt: row.updatedAt,
      ...data,
      prompts: buildPrompts(data, style),
      placeholders: data.levels.map((l) => `/api/art/placeholder/${data.type}/${data.key}/${l.level}.svg?v=${v}`),
    };
  }

  async list(type?: string) {
    if (type && !isEntityType(type)) throw new BadRequestException('Loại không hợp lệ');
    const rows = await this.prisma.gameEntity.findMany({
      where: type ? { type: type as EntityTypeKey } : undefined,
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => {
      const d = this.toData(r);
      return {
        id: r.id,
        type: d.type,
        key: d.key,
        name: d.name,
        levelCount: d.levels.length,
        description: d.description,
        props: d.props,
        /** Cấp cao nhất — dùng cho bảng tổng quan */
        top: d.levels[d.levels.length - 1] ? { stats: d.levels[d.levels.length - 1].stats, effects: d.levels[d.levels.length - 1].effects ?? [] } : null,
        image: d.levels[0]?.image ?? null,
        placeholder: `/api/art/placeholder/${d.type}/${d.key}/1.svg?v=${r.updatedAt.getTime()}`,
        updatedAt: r.updatedAt,
      };
    });
  }

  async allData() {
    const rows = await this.prisma.gameEntity.findMany({ orderBy: [{ type: 'asc' }, { createdAt: 'asc' }] });
    return rows.map((r) => this.toData(r));
  }

  private async row(id: string) {
    const r = await this.prisma.gameEntity.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Không tìm thấy');
    return r;
  }

  async get(id: string) {
    return this.view(await this.row(id));
  }

  async findByKey(type: string, key: string): Promise<EntityData | null> {
    if (!isEntityType(type)) return null;
    const r = await this.prisma.gameEntity.findUnique({ where: { type_key: { type, key } } });
    return r ? this.toData(r) : null;
  }

  private parse(body: unknown, type?: EntityTypeKey) {
    try {
      return normalizeEntity(body, type);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  private conflict(e: unknown, data: EntityData): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException(`Key "${data.key}" đã tồn tại trong loại này`);
    }
    throw e;
  }

  async create(body: unknown) {
    const data = this.parse(body);
    try {
      const r = await this.prisma.gameEntity.create({
        data: { type: data.type, key: data.key, name: data.name, data: data as any },
      });
      return this.view(r);
    } catch (e) {
      this.conflict(e, data);
    }
  }

  async update(id: string, body: unknown) {
    const current = await this.row(id);
    // Không cho đổi loại; ảnh đã upload giữ nguyên nếu client không gửi lên
    const prev = this.toData(current);
    const data = this.parse(body, current.type as EntityTypeKey);
    try {
      const r = await this.prisma.gameEntity.update({
        where: { id },
        data: { key: data.key, name: data.name, data: data as any },
      });
      await this.cleanupImages(prev, data);
      return this.view(r);
    } catch (e) {
      this.conflict(e, data);
    }
  }

  async remove(id: string) {
    const r = await this.row(id);
    await this.prisma.gameEntity.delete({ where: { id } });
    await this.cleanupImages(this.toData(r), null);
    return { ok: true };
  }

  async setLevelImage(id: string, level: number, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Chưa chọn file ảnh');
    const ext = extname(file.originalname).toLowerCase() || '.png';
    if (!IMAGE_EXT.has(ext)) throw new BadRequestException(`Định dạng ${ext} không hỗ trợ (dùng png, jpg, webp, gif, svg)`);
    const r = await this.row(id);
    const data = this.toData(r);
    const lv = data.levels.find((l) => l.level === level);
    if (!lv) throw new NotFoundException(`Không có cấp ${level}`);

    const rel = `${data.type}/${data.key}/lv${level}-${Date.now()}${ext}`;
    const abs = join(ASSETS_DIR, rel);
    await fs.mkdir(resolve(abs, '..'), { recursive: true });
    await fs.writeFile(abs, file.buffer);

    const old = lv.image;
    lv.image = `/assets/${rel}`;
    const saved = await this.prisma.gameEntity.update({ where: { id }, data: { data: data as any } });
    if (old) await this.deleteAsset(old);
    return this.view(saved);
  }

  async clearLevelImage(id: string, level: number) {
    const r = await this.row(id);
    const data = this.toData(r);
    const lv = data.levels.find((l) => l.level === level);
    if (!lv) throw new NotFoundException(`Không có cấp ${level}`);
    const old = lv.image;
    lv.image = null;
    const saved = await this.prisma.gameEntity.update({ where: { id }, data: { data: data as any } });
    if (old) await this.deleteAsset(old);
    return this.view(saved);
  }

  async exportToFiles() {
    const files = await writeDataFiles(await this.allData());
    await writeArtStyleFile(await this.settings.getArtStyle());
    files.push('art-style.json');
    return { ok: true, count: files.length, files };
  }

  /** Xoá file ảnh không còn được cấp nào dùng */
  private async cleanupImages(prev: EntityData, next: EntityData | null) {
    const still = new Set((next?.levels ?? []).map((l) => l.image).filter(Boolean));
    for (const l of prev.levels) if (l.image && !still.has(l.image)) await this.deleteAsset(l.image);
  }

  private async deleteAsset(url: string) {
    if (!url.startsWith('/assets/')) return;
    const abs = resolve(ASSETS_DIR, url.slice('/assets/'.length));
    if (!abs.startsWith(ASSETS_DIR)) return;
    await fs.unlink(abs).catch(() => undefined);
  }
}
