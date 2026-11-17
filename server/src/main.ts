import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { ASSETS_DIR } from './common/paths';

async function bootstrap() {
  mkdirSync(ASSETS_DIR, { recursive: true });
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  app.useBodyParser('json', { limit: '5mb' });
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`Server: http://localhost:${port}  (API /api, ảnh /assets, admin /admin)`);
}
bootstrap();
