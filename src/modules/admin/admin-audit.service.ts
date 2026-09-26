import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuditLog } from '../../entities/admin-audit-log.entity';

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly auditRepo: Repository<AdminAuditLog>,
  ) {}

  private resolveLocation(ip?: string, clientLocation?: string): string {
    if (clientLocation && clientLocation.trim()) {
      return clientLocation.trim();
    }
    const cleanIp = (ip || '').replace(/^::ffff:/, '').trim();
    if (
      !cleanIp ||
      cleanIp === '::1' ||
      cleanIp === '127.0.0.1' ||
      cleanIp.startsWith('192.168.') ||
      cleanIp.startsWith('10.') ||
      cleanIp.startsWith('172.16.') ||
      cleanIp === 'localhost'
    ) {
      return 'TP. Vinh, Nghệ An (Trụ sở ToplistNA)';
    }
    return 'TP. Vinh, Nghệ An, VN';
  }

  async log(params: {
    adminId: number;
    adminName?: string;
    adminEmail?: string;
    action: string;
    source?: string;
    targetType: string;
    targetId?: string | number;
    description?: string;
    beforeData?: any;
    afterData?: any;
    ipAddress?: string;
    location?: string;
    userAgent?: string;
  }) {
    try {
      const location = this.resolveLocation(params.ipAddress, params.location);
      const record = this.auditRepo.create({
        adminId: params.adminId,
        adminName: params.adminName || 'Admin',
        adminEmail: params.adminEmail || '',
        action: params.action,
        source: params.source || 'BACKEND_API',
        targetType: params.targetType,
        targetId: params.targetId !== undefined ? String(params.targetId) : null,
        description: params.description || '',
        beforeData: params.beforeData || null,
        afterData: params.afterData || null,
        ipAddress: params.ipAddress || '',
        location,
        userAgent: params.userAgent || '',
        createdAt: new Date(),
      });
      await this.auditRepo.save(record);
    } catch (e: any) {
      this.logger.warn(`Failed to write audit log: ${e.message}`);
    }
  }

  async logClientEvent(params: {
    adminId: number;
    adminName?: string;
    adminEmail?: string;
    action: string;
    targetType: string;
    targetId?: string;
    description: string;
    payload?: any;
    ipAddress?: string;
    location?: string;
    userAgent?: string;
  }) {
    return this.log({
      adminId: params.adminId,
      adminName: params.adminName,
      adminEmail: params.adminEmail,
      action: params.action,
      source: 'FRONTEND_CLIENT',
      targetType: params.targetType,
      targetId: params.targetId,
      description: params.description,
      afterData: params.payload,
      ipAddress: params.ipAddress,
      location: params.location,
      userAgent: params.userAgent,
    });
  }

  async getLogs(page = 1, limit = 50, action?: string, targetType?: string, source?: string) {
    const qb = this.auditRepo.createQueryBuilder('log');
    if (action && action !== 'all') {
      qb.andWhere('log.action = :action', { action });
    }
    if (targetType && targetType !== 'all') {
      qb.andWhere('log.target_type = :targetType', { targetType });
    }
    if (source && source !== 'all') {
      qb.andWhere('log.source = :source', { source });
    }
    qb.orderBy('log.created_at', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      success: true,
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
