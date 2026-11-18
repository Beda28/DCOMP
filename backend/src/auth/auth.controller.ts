import { Body, Controller, Get, Header, HttpCode, HttpException, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard }                                                       from '@nestjs/throttler';
import type { CookieOptions, Request, Response }                                          from 'express';
import { AuthService }                                                                   from './auth.service.js';
import { AuthGuard, type AuthRequest }                                                    from './auth.guard.js';
import { OriginGuard }                                                                   from './origin.guard.js';
import { LoginDto, SignupDto }                                                           from './auth.dto.js';
import { refreshLifetime }                                                               from './session.service.js';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure:   process.env.COOKIE_SECURE !== 'false',
  sameSite: 'lax',
  path:     '/api/v1/auth',
});

@Controller('auth')
@UseGuards(OriginGuard, ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  signup(@Body() body: SignupDto) { return this.auth.signup(body); }

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body);
    response.cookie('refresh_token', result.refreshToken, { ...cookieOptions(), maxAge: refreshLifetime * 1000 });
    return { data: result.data };
  }

  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    try {
      const result = await this.auth.refresh(request.cookies?.refresh_token);
      response.cookie('refresh_token', result.refreshToken, { ...cookieOptions(), maxAge: refreshLifetime * 1000 });
      return { data: result.data };
    }
    catch (error) {
      if (error instanceof HttpException && error.getStatus() === 401) response.clearCookie('refresh_token', cookieOptions());
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    try {
      await this.auth.logout(request.cookies?.refresh_token, request.headers.authorization);
      response.clearCookie('refresh_token', cookieOptions());
    }
    catch (error) {
      if (error instanceof HttpException && error.getStatus() === 401) response.clearCookie('refresh_token', cookieOptions());
      throw error;
    }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @Header('Cache-Control', 'no-store')
  me(@Req() request: AuthRequest) { return { data: request.user }; }
}
