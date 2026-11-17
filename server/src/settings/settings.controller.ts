import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { ArtStyle, DEFAULT_ART_STYLE } from '../art/prompt';
import { SettingsService } from './settings.service';

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('art-style')
  get() {
    return this.settings.getArtStyle();
  }

  @Get('art-style/default')
  getDefault() {
    return DEFAULT_ART_STYLE;
  }

  @Put('art-style')
  @UseGuards(AdminGuard)
  put(@Body() body: Partial<ArtStyle>) {
    return this.settings.setArtStyle(body);
  }
}
