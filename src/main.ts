import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Increase payload limit for Base64 and image uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Serve uploaded images statically
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // URL rewrite to support both /api/firego and /api/v1/firego
  app.use((req, res, next) => {
    if (req.url.startsWith('/api/firego')) {
      req.url = req.url.replace('/api/firego', '/api/v1/firego');
    }
    next();
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS for Flutter app and FireGo backend
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-FireGo-Secret', 'x-firego-secret'],
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Swagger docs
  const config = new DocumentBuilder()
    .setTitle('ToplistNA API')
    .setDescription('Backend API cho ứng dụng ToplistNA Mobile')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.APP_PORT ?? 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 ToplistNA API running on: http://0.0.0.0:${port} (LAN: http://192.168.1.18:${port})`);
  console.log(`📚 Swagger docs: http://localhost:${port}/docs`);
}
bootstrap();
