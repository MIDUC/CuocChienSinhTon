import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ArtStyle, DEFAULT_ART_STYLE } from '../art/prompt';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getArtStyle(): Promise<ArtStyle> {
    const row = await this.prisma.setting.findUnique({ where: { key: 'artStyle' } });
    return { ...DEFAULT_ART_STYLE, ...((row?.value as Partial<ArtStyle>) ?? {}) };
  }

  async setArtStyle(input: Partial<ArtStyle>): Promise<ArtStyle> {
    const current = await this.getArtStyle();
    const next: ArtStyle = {
      style: String(input.style ?? current.style),
      negative: String(input.negative ?? current.negative),
      midjourneyParams: String(input.midjourneyParams ?? current.midjourneyParams),
      tileWidth: Number(input.tileWidth) > 0 ? Number(input.tileWidth) : current.tileWidth,
    };
    await this.prisma.setting.upsert({
      where: { key: 'artStyle' },
      create: { key: 'artStyle', value: next as any },
      update: { value: next as any },
    });
    return next;
  }
}
