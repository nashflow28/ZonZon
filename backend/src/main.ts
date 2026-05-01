import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';

function ensureUploadDirs() {
  const root = process.env.UPLOAD_DIR || 'uploads';
  for (const sub of ['shops', 'products', 'avatars']) {
    fs.mkdirSync(path.join(process.cwd(), root, sub), { recursive: true });
  }
}

async function bootstrap() {
  ensureUploadDirs();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const origins = process.env.FRONTEND_URLS?.split(',').map((s) => s.trim());
  app.enableCors({
    origin: origins && origins.length > 0 ? origins : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3050, '0.0.0.0');
}
bootstrap();
