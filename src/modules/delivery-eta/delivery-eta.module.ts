import { Module } from '@nestjs/common';
import { DeliveryEtaService } from './delivery-eta.service';

@Module({
  providers: [DeliveryEtaService],
  exports: [DeliveryEtaService],
})
export class DeliveryEtaModule {}
