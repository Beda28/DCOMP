import 'reflect-metadata';
import { NestFactory }  from '@nestjs/core';
import { AppModule }    from './app.module.js';
import { configureApp } from './app.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  app.enableShutdownHooks();

  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

await bootstrap();
