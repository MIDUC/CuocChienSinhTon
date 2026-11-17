import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Bảo vệ các API sửa dữ liệu. Nếu biến môi trường ADMIN_TOKEN có giá trị,
 * request phải gửi header `x-admin-token` trùng khớp. Để trống = không kiểm tra (chạy local).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected) return true;
    const req = ctx.switchToHttp().getRequest();
    if (req.headers['x-admin-token'] === expected) return true;
    throw new UnauthorizedException('Sai mã quản trị (ADMIN_TOKEN)');
  }
}
