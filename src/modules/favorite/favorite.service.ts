import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite } from '../../entities/favorite.entity';
import { Listing } from '../../entities/listing.entity';

@Injectable()
export class FavoriteService {
  constructor(
    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
  ) {}

  async toggle(userId: number, favorableType: string, favorableId: number) {
    const existing = await this.favoriteRepo.findOne({
      where: { userId, favorableId },
    });
    if (existing) {
      await this.favoriteRepo.delete({ id: existing.id });
      return { is_favorited: false, message: 'Đã xóa khỏi yêu thích' };
    }

    await this.favoriteRepo.save(
      this.favoriteRepo.create({
        userId,
        favorableType: favorableType || 'listings',
        favorableId,
      }),
    );
    return { is_favorited: true, message: 'Đã thêm vào yêu thích' };
  }

  async checkFavorite(userId: number, favorableId: number) {
    if (!userId || !favorableId) return { is_favorited: false };
    const count = await this.favoriteRepo.count({
      where: { userId, favorableId },
    });
    return { is_favorited: count > 0 };
  }

  async getMyFavorites(userId?: number) {
    if (!userId) {
      return { success: true, favorites: [] };
    }

    const favorites = await this.favoriteRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (!favorites.length) {
      return { success: true, favorites: [] };
    }

    const listingIds = favorites.map((f) => f.favorableId);

    const listingsRaw = await this.listingRepo
      .createQueryBuilder('l')
      .leftJoin('media', 'm', 'm.id = l.thumb')
      .leftJoin('categories', 'c', 'c.id = l.main_category_id')
      .select([
        'l.id AS id',
        'l.title AS title',
        'l.alias AS alias',
        'l.address AS address',
        'l.type AS type',
        'l.rating_avg AS rating_avg',
        'l.rating_count AS rating_count',
        'l.price_min AS price_min',
        'l.price_max AS price_max',
        'c.alias AS category_alias',
        'c.title AS category_title',
        'm.path AS media_path',
      ])
      .where('l.id IN (:...listingIds)', { listingIds })
      .getRawMany();

    const listingMap = new Map<number, any>();
    for (const raw of listingsRaw) {
      listingMap.set(Number(raw.id), raw);
    }

    const result = favorites.map((f) => {
      const l = listingMap.get(Number(f.favorableId));
      let avatar = '';
      if (l?.media_path) {
        avatar = `https://toplistnghean.vn/storage/${l.media_path}`;
      }

      return {
        id: f.id,
        favorable_type: f.favorableType,
        favorable_id: f.favorableId,
        created_at: f.createdAt,
        favorable: l
          ? {
              id: l.id,
              name: l.title,
              title: l.title,
              alias: l.alias,
              address: l.address,
              type: l.type,
              rating: Number(l.rating_avg || 5.0),
              rating_count: Number(l.rating_count || 0),
              price_min: l.price_min,
              price_max: l.price_max,
              category_alias: l.category_alias,
              category_title: l.category_title,
              avatar: avatar,
            }
          : null,
      };
    });

    return {
      success: true,
      favorites: result,
    };
  }
}
