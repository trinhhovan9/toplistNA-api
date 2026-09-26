import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { IsOptional, IsNotEmpty, IsString } from 'class-validator';

class LoginDto {
  @IsOptional()
  @IsString()
  identifier?: string; // email hoặc username

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/login
   * Đăng nhập, nhận JWT token
   */
  @Post('login')
  @ApiOperation({ summary: 'Đăng nhập – nhận JWT token' })
  async login(@Body() dto: LoginDto) {
    const identifier = dto.identifier || dto.username || dto.email;
    if (!identifier) {
      throw new BadRequestException('Vui lòng cung cấp email hoặc tên đăng nhập');
    }
    const result = await this.authService.login(identifier, dto.password);
    return {
      success: true,
      data: result,
      message: 'Đăng nhập thành công',
    };
  }

  /**
   * GET /api/v1/auth/me
   * Lấy thông tin user hiện tại (yêu cầu Bearer token)
   */
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin user hiện tại' })
  async me(@Request() req) {
    return {
      success: true,
      data: this.authService.sanitizeUser(req.user),
    };
  }
}
