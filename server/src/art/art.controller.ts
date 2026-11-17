import { BadRequestException, Body, Controller, Get, Header, NotFoundException, Param, Post } from '@nestjs/common';
import { normalizeEntity } from '../entities/definitions';
import { SettingsService } from '../settings/settings.service';
import { buildPrompts } from './prompt';
import { EntitiesService } from '../entities/entities.service';
import { placeholderSvg } from './placeholder';

@Controller('api/art')
export class ArtController {
  constructor(
    private readonly entities: EntitiesService,
    private readonly settings: SettingsService,
  ) {}

  /** Xem trước prompt vẽ ảnh cho dữ liệu chưa lưu (trang admin gọi khi đang sửa) */
  @Post('preview-prompts')
  async preview(@Body() body: unknown) {
    let data;
    try {
      data = normalizeEntity(body);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    return buildPrompts(data, await this.settings.getArtStyle());
  }

  /** Ảnh SVG tạm theo góc nhìn isometric, ví dụ /api/art/placeholder/building/barracks/2.svg */
  @Get('placeholder/:type/:key/:file')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=60')
  async placeholder(@Param('type') type: string, @Param('key') key: string, @Param('file') file: string) {
    const e = await this.entities.findByKey(type, key);
    if (!e) throw new NotFoundException();
    const level = parseInt(file, 10) || 1;
    return placeholderSvg(e, level);
  }
}
