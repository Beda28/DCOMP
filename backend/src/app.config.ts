import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser           from 'cookie-parser';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { apiError }           from './common/api-error.js';

export const configureApp = (app: INestApplication): void => {
  app.setGlobalPrefix('api/v1');
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: () => apiError(400, 'VALIDATION_ERROR', '입력값을 확인해주세요.'),
  }));
};
