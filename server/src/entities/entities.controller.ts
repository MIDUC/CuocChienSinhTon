import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from '../common/admin.guard';
import { ENTITY_TYPES, TYPE_DEFS } from './definitions';
import { EntitiesService } from './entities.service';

@Controller('api')
export class EntitiesController {
  constructor(private readonly entities: EntitiesService) {}

  /** Thông tin các loại dữ liệu (nhãn, chỉ số gợi ý...) cho trang admin */
  @Get('meta')
  meta() {
    return { types: ENTITY_TYPES.map((t) => TYPE_DEFS[t]), authRequired: !!process.env.ADMIN_TOKEN };
  }

  /** Toàn bộ dữ liệu game, gom theo loại — game client đọc API này */
  @Get('game-data')
  async gameData() {
    const all = await this.entities.allData();
    const out: Record<string, unknown[]> = {};
    for (const t of ENTITY_TYPES) out[t] = all.filter((e) => e.type === t);
    return out;
  }

  @Get('entities')
  list(@Query('type') type?: string) {
    return this.entities.list(type);
  }

  @Get('entities/:id')
  get(@Param('id') id: string) {
    return this.entities.get(id);
  }

  @Post('entities')
  @UseGuards(AdminGuard)
  create(@Body() body: unknown) {
    return this.entities.create(body);
  }

  @Put('entities/:id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.entities.update(id, body);
  }

  @Delete('entities/:id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.entities.remove(id);
  }

  @Post('entities/:id/levels/:level/image')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  upload(@Param('id') id: string, @Param('level', ParseIntPipe) level: number, @UploadedFile() file: Express.Multer.File) {
    return this.entities.setLevelImage(id, level, file);
  }

  @Delete('entities/:id/levels/:level/image')
  @UseGuards(AdminGuard)
  clearImage(@Param('id') id: string, @Param('level', ParseIntPipe) level: number) {
    return this.entities.clearLevelImage(id, level);
  }

  /** Ghi toàn bộ dữ liệu trong DB ra thư mục data/ (mỗi thực thể 1 file JSON) */
  @Post('export-files')
  @UseGuards(AdminGuard)
  exportFiles() {
    return this.entities.exportToFiles();
  }
}
