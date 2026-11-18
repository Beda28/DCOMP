import { Module }          from '@nestjs/common';
import { JwtModule }       from '@nestjs/jwt';
import { TypeOrmModule }   from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisModule }     from '../redis/redis.module.js';
import { AuthController }  from './auth.controller.js';
import { AuthService }     from './auth.service.js';
import { SessionService }  from './session.service.js';
import { AuthGuard }       from './auth.guard.js';
import { OriginGuard }     from './origin.guard.js';
import { User }            from './user.entity.js';
import { AuthSession }     from './auth-session.entity.js';

@Module({
  imports: [
    RedisModule,
    TypeOrmModule.forFeature([User, AuthSession]),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) throw new Error('JWT_SECRET은 32자 이상이어야 합니다.');
        return {
          secret,
          signOptions:   { algorithm: 'HS256', expiresIn: 900, issuer: 'dcomp', audience: 'dcomp' },
          verifyOptions: { algorithms: ['HS256'], issuer: 'dcomp', audience: 'dcomp' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers:   [AuthService, SessionService, AuthGuard, OriginGuard],
  exports:     [AuthGuard, AuthService],
})
export class AuthModule {}
