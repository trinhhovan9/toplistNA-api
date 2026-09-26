import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FavoriteController } from './favorite.controller';
import { FavoriteService } from './favorite.service';
import { Favorite } from '../../entities/favorite.entity';
import { Listing } from '../../entities/listing.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Favorite, Listing])],
  controllers: [FavoriteController],
  providers: [FavoriteService],
  exports: [FavoriteService],
})
export class FavoriteModule {}
