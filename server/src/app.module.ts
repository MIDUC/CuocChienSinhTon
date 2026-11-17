import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { ADMIN_DIST, ASSETS_DIR, GAME_DIST } from './common/paths';
import { PrismaService } from './common/prisma.service';
import { SettingsService } from './settings/settings.service';
import { SettingsController } from './settings/settings.controller';
import { EntitiesService } from './entities/entities.service';
import { EntitiesController } from './entities/entities.controller';
import { ArtController } from './art/art.controller';

const statics = [ServeStaticModule.forRoot({ rootPath: ASSETS_DIR, serveRoot: '/assets', serveStaticOptions: { fallthrough: false } })];
// Khi đã build trang admin (npm run build -w admin), server phục vụ luôn tại /admin
if (existsSync(ADMIN_DIST)) statics.push(ServeStaticModule.forRoot({ rootPath: ADMIN_DIST, serveRoot: '/admin' }));
// Khi đã build game (npm run build -w game), server phục vụ game tại /game
if (existsSync(GAME_DIST)) statics.push(ServeStaticModule.forRoot({ rootPath: GAME_DIST, serveRoot: '/game' }));

@Module({
  imports: [...statics],
  controllers: [EntitiesController, SettingsController, ArtController],
  providers: [PrismaService, SettingsService, EntitiesService],
})
export class AppModule {}
