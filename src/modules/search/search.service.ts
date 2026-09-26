import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Listing } from '../../entities/listing.entity';

function formatImageUrl(thumb: any, mediaPath?: string | null): string {
  const apiBase = process.env.API_BASE_URL || 'http://192.168.1.18:3001';
  if (mediaPath && mediaPath.length > 0) {
    if (mediaPath.startsWith('http')) return mediaPath;
    if (mediaPath.startsWith('/uploads') || mediaPath.startsWith('uploads/')) {
      const cleanPath = mediaPath.startsWith('/') ? mediaPath : `/${mediaPath}`;
      return `${apiBase}${cleanPath}`;
    }
    return `https://toplistnghean.vn/storage/${mediaPath}`;
  }
  if (typeof thumb === 'string') {
    if (thumb.startsWith('http')) return thumb;
    if (thumb.startsWith('/uploads') || thumb.startsWith('uploads/')) {
      const cleanPath = thumb.startsWith('/') ? thumb : `/${thumb}`;
      return `${apiBase}${cleanPath}`;
    }
  }
  return 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=500&q=60';
}

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
  ) {}

  async search(query: string, type?: string, page = 1, limit = 20) {
    const q = this.listingRepo
      .createQueryBuilder('l')
      .leftJoin('media', 'm', 'CAST(l.thumb AS UNSIGNED) = m.id')
      .select([
        'l.id AS id',
        'l.name AS name',
        'l.address AS address',
        'l.type AS type',
        'l.thumb AS thumb',
        'l.rating_avg AS rating_avg',
        'l.rating_count AS rating_count',
        'l.price_min AS price_min',
        'l.price_max AS price_max',
        'l.description AS description',
        'm.path AS media_path',
      ])
      .where('l.deleted_at IS NULL')
      .andWhere("l.status = 'active'");

    let term = '';
    if (query && query.trim().length > 0) {
      term = `%${query.trim().toLowerCase()}%`;
      q.andWhere(
        `(LOWER(l.name) LIKE :term 
          OR LOWER(l.address) LIKE :term 
          OR LOWER(l.description) LIKE :term
          OR l.id IN (
            SELECT mi.listing_id FROM menu_items mi 
            WHERE LOWER(mi.name) LIKE :term OR LOWER(mi.category_name) LIKE :term OR LOWER(mi.description) LIKE :term
          ))`,
        { term },
      );
    }

    if (type && type !== 'all' && type !== 'dish') {
      q.andWhere('l.type = :type', { type });
    }

    const total = await q.getCount();
    const rawListings = await q
      .orderBy('l.rating_avg', 'DESC')
      .addOrderBy('l.rating_count', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    const formattedListings = rawListings.map((l) => ({
      id: Number(l.id),
      name: l.name,
      address: l.address,
      type: l.type,
      image: formatImageUrl(l.thumb, l.media_path),
      rating_avg: l.rating_avg ? Number(l.rating_avg) : 4.8,
      rating_count: l.rating_count || 12,
      price_min: l.price_min,
      price_max: l.price_max,
      brief: l.description ? l.description.substring(0, 100) : null,
    }));

    // Search matched menu items (dishes)
    let formattedDishes: any[] = [];
    if (term && (!type || type === 'all' || type === 'dish' || type === 'restaurant')) {
      try {
        const matchedDishes = await this.listingRepo.query(
          `SELECT mi.id, mi.name, mi.price, mi.image_url, mi.category_name, mi.listing_id,
                  l.name AS restaurant_name, l.address, l.type AS restaurant_type, l.thumb AS listing_thumb,
                  l.rating_avg, l.rating_count,
                  m.path AS media_path
           FROM menu_items mi
           INNER JOIN listings l ON mi.listing_id = l.id
           LEFT JOIN media m ON CAST(l.thumb AS UNSIGNED) = m.id
           WHERE mi.is_available = 1 AND l.deleted_at IS NULL AND l.status = 'active'
             AND (LOWER(mi.name) LIKE ? OR LOWER(mi.category_name) LIKE ? OR LOWER(mi.description) LIKE ?)
           LIMIT ?`,
          [term, term, term, limit],
        );

        formattedDishes = (matchedDishes || []).map((d: any) => {
          let dishImg: string | null = null;
          if (d.image_url && d.image_url.trim().length > 0 && !d.image_url.includes('unsplash.com')) {
            dishImg = d.image_url.startsWith('http') ? d.image_url : formatImageUrl(null, d.image_url);
          }
          const storeImg = formatImageUrl(d.listing_thumb, d.media_path);

          return {
            id: Number(d.id),
            listing_id: Number(d.listing_id),
            name: d.name,
            restaurant_name: d.restaurant_name,
            address: `${d.category_name || 'Món ăn'} • ${d.restaurant_name}`,
            type: 'dish',
            category: 'dish',
            price_from: Number(d.price),
            price_min: Number(d.price),
            image: dishImg,
            restaurant_image: storeImg,
            rating_avg: d.rating_avg ? Number(d.rating_avg) : 4.8,
            rating_count: d.rating_count || 12,
            brief: `${d.category_name || 'Món ngon'} tại ${d.restaurant_name}`,
          };
        });
      } catch (err) {
        console.error('Error searching menu_items:', err);
      }
    }

    const allResults = [...formattedDishes, ...formattedListings];

    const grouped: Record<string, any[]> = {};
    for (const item of allResults) {
      const t = item.type ?? 'other';
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(item);
    }

    return {
      query,
      total: allResults.length,
      page,
      results: allResults,
      grouped,
    };
  }

  async getListingsByCategory(
    categoryAlias?: string,
    categoryId?: number,
    tagSlug?: string,
    search?: string,
    page = 1,
    limit = 20,
  ) {
    const q = this.listingRepo
      .createQueryBuilder('l')
      .leftJoin('media', 'm', 'CAST(l.thumb AS UNSIGNED) = m.id')
      .leftJoin('categories', 'c', 'l.main_category_id = c.id')
      .select([
        'l.id AS id',
        'l.name AS name',
        'l.address AS address',
        'l.type AS type',
        'l.thumb AS thumb',
        'l.images AS images',
        'l.rating_avg AS rating_avg',
        'l.rating_count AS rating_count',
        'l.price_min AS price_min',
        'l.price_max AS price_max',
        'l.latitude AS latitude',
        'l.longitude AS longitude',
        'l.description AS description',
        'l.main_category_id AS main_category_id',
        'c.title AS category_name',
        'c.alias AS category_slug',
        'm.path AS media_path',
      ])
      .where('l.deleted_at IS NULL')
      .andWhere("l.status = 'active'");

    // 1. Filter by Category ID or Alias
    if (categoryId && categoryId > 0) {
      // Find category and its children
      const catRows = await this.listingRepo.query(
        'SELECT id FROM categories WHERE id = ? OR parent_id = ?',
        [categoryId, categoryId],
      );
      const catIds = catRows.map((r: any) => Number(r.id));
      if (catIds.length > 0) {
        q.andWhere(
          '(l.main_category_id IN (:...catIds) OR l.id IN (SELECT listing_id FROM category_listing WHERE category_id IN (:...catIds)))',
          { catIds },
        );
      }
    } else if (categoryAlias && categoryAlias !== 'dia-diem') {
      // Look up category in categories table
      const matchedCats = await this.listingRepo.query(
        'SELECT id FROM categories WHERE alias = ?',
        [categoryAlias],
      );

      if (matchedCats && matchedCats.length > 0) {
        const rootId = Number(matchedCats[0].id);
        const childCats = await this.listingRepo.query(
          'SELECT id FROM categories WHERE id = ? OR parent_id = ?',
          [rootId, rootId],
        );
        const catIds = childCats.map((r: any) => Number(r.id));
        q.andWhere(
          '(l.main_category_id IN (:...catIds) OR l.id IN (SELECT listing_id FROM category_listing WHERE category_id IN (:...catIds)))',
          { catIds },
        );
      } else {
        // Map alias to general type fallback
        const catMap: Record<string, string[]> = {
          'am-thuc': ['restaurant', 'food'],
          'quan-cafe': ['cafe'],
          'giai-tri': ['entertainment', 'giai-tri', 'game', 'bar'],
          'luu-tru': ['hotel', 'homestay', 'resort', 'villa'],
          'du-lich': ['tourist', 'du-lich', 'destination'],
          'wellness': ['spa', 'wellness', 'massage'],
          'mua-sam': ['shopping', 'store', 'mua-sam'],
          'lam-dep': ['beauty', 'lam-dep'],
        };
        const types = catMap[categoryAlias] || [categoryAlias];
        q.andWhere('l.type IN (:...types)', { types });
      }
    }

    // 2. Filter by Tag Slug
    if (tagSlug && tagSlug.trim().length > 0) {
      const tagRows = await this.listingRepo.query(
        'SELECT id, name FROM tags WHERE slug = ? OR name LIKE ?',
        [tagSlug, `%${tagSlug.replace(/-/g, ' ')}%`],
      );
      if (tagRows.length > 0) {
        const tagIds = tagRows.map((r: any) => Number(r.id));
        q.andWhere(
          '(l.id IN (SELECT taggable_id FROM taggables WHERE tag_id IN (:...tagIds)) OR LOWER(l.name) LIKE :tagTerm)',
          { tagIds, tagTerm: `%${tagRows[0].name.toLowerCase()}%` },
        );
      }
    }

    // 3. Search query
    if (search && search.trim().length > 0) {
      const term = `%${search.trim().toLowerCase()}%`;
      q.andWhere(
        '(LOWER(l.name) LIKE :term OR LOWER(l.address) LIKE :term OR LOWER(l.description) LIKE :term)',
        { term },
      );
    }

    const total = await q.getCount();
    const rawListings = await q
      .orderBy('l.rating_avg', 'DESC')
      .addOrderBy('l.rating_count', 'DESC')
      .addOrderBy('l.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    return {
      categoryAlias: categoryAlias || '',
      categoryId: categoryId || 0,
      tagSlug: tagSlug || '',
      total,
      page,
      results: rawListings.map((l) => ({
        id: l.id,
        name: l.name,
        address: l.address,
        type: l.type,
        category_name: l.category_name || (l.type === 'cafe' ? 'Quán cafe' : 'Ẩm thực'),
        category_slug: l.category_slug || (l.type === 'cafe' ? 'quan-cafe' : 'am-thuc'),
        image: formatImageUrl(l.thumb, l.media_path),
        rating_avg: l.rating_avg ? Number(l.rating_avg) : 4.8,
        rating_count: l.rating_count || 25,
        price_min: l.price_min,
        price_max: l.price_max,
        latitude: l.latitude ? Number(l.latitude) : null,
        longitude: l.longitude ? Number(l.longitude) : null,
        brief: l.description ? l.description.substring(0, 100) : null,
      })),
    };
  }

  async getListingDetail(idOrAlias: string | number) {
    const q = this.listingRepo
      .createQueryBuilder('l')
      .leftJoin('media', 'm', 'CAST(l.thumb AS UNSIGNED) = m.id')
      .leftJoin('categories', 'c', 'l.main_category_id = c.id')
      .select([
        'l.id AS id',
        'l.name AS name',
        'l.alias AS alias',
        'l.address AS address',
        'l.type AS type',
        'l.phone AS phone',
        'l.thumb AS thumb',
        'l.images AS images',
        'l.rating_avg AS rating_avg',
        'l.rating_count AS rating_count',
        'l.price_min AS price_min',
        'l.price_max AS price_max',
        'l.latitude AS latitude',
        'l.longitude AS longitude',
        'l.description AS description',
        'l.main_category_id AS main_category_id',
        'c.title AS category_name',
        'c.alias AS category_slug',
        'm.path AS media_path',
      ])
      .where('l.deleted_at IS NULL');

    const numId = Number(idOrAlias);
    if (!isNaN(numId) && numId > 0) {
      q.andWhere('l.id = :numId', { numId });
    } else {
      q.andWhere('l.alias = :alias', { alias: String(idOrAlias) });
    }

    const raw = await q.getRawOne();
    if (!raw) return null;

    // Fetch gallery images
    const galleryImages: string[] = [];
    if (raw.images) {
      try {
        const parsed = typeof raw.images === 'string' ? JSON.parse(raw.images) : raw.images;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const mediaRows = await this.listingRepo.query(
            'SELECT id, path FROM media WHERE id IN (?)',
            [parsed],
          );
          const mediaMap = new Map<number, string>();
          for (const m of mediaRows) {
            if (m.path) mediaMap.set(Number(m.id), formatImageUrl(m.id, m.path));
          }
          for (const mid of parsed) {
            const u = mediaMap.get(Number(mid));
            if (u) galleryImages.push(u);
          }
        }
      } catch (_) {}
    }

    const mainImage = formatImageUrl(raw.thumb, raw.media_path);
    if (galleryImages.length === 0 && mainImage) {
      galleryImages.push(mainImage);
    }

    return {
      id: raw.id,
      name: raw.name,
      title: raw.name,
      alias: raw.alias,
      address: raw.address,
      phone: raw.phone || 'Liên hệ',
      type: raw.type,
      category_name: raw.category_name || (raw.type === 'cafe' ? 'Quán cafe' : 'Ẩm thực'),
      category_slug: raw.category_slug || (raw.type === 'cafe' ? 'quan-cafe' : 'am-thuc'),
      image: mainImage,
      gallery_images: galleryImages,
      rating_avg: raw.rating_avg ? Number(raw.rating_avg) : 4.8,
      rating_count: raw.rating_count || 12,
      price_min: raw.price_min,
      price_max: raw.price_max,
      latitude: raw.latitude ? Number(raw.latitude) : null,
      longitude: raw.longitude ? Number(raw.longitude) : null,
      description: raw.description || '',
      has_delivery: true,
      status: 'Đã xác thực',
    };
  }
}
