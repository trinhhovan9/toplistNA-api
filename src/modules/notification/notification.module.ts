import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../../entities/notification.entity';
import { User } from '../../entities/user.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { FcmService } from './fcm.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User])],
  controllers: [NotificationController],
  providers: [NotificationService, FcmService],
  exports: [NotificationService, FcmService],
})
export class NotificationModule {}

