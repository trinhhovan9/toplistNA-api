import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../../entities/category.entity';
import { Tag } from '../../entities/tag.entity';
import { Listing } from '../../entities/listing.entity';

function formatImageUrl(mediaPath?: string | null): string {
  if (mediaPath && mediaPath.length > 0) {
    if (mediaPath.startsWith('http')) return mediaPath;
    return `https://toplistnghean.vn/storage/${mediaPath}`;
  }
  return 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=500&q=60';
}

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Tag)
    private readonly tagRepo: Repository<Tag>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
  ) {}

  async getCategoriesTree() {
    // 1. Get all categories
    const categories = await this.categoryRepo.find({
      order: { iorder: 'ASC', id: 'ASC' },
    });

    // 2. Count listings per category from category_listing
    const listingCountsRaw = await this.categoryRepo.query(`
      SELECT category_id, COUNT(listing_id) as count
      FROM category_listing
      GROUP BY category_id
    `);

    const countMap: Record<number, number> = {};
    for (const r of listingCountsRaw) {
      countMap[Number(r.category_id)] = Number(r.count);
    }

    // 3. Build tree
    const rootCategories: any[] = [];
    const childrenMap: Record<number, any[]> = {};

    for (const cat of categories) {
      const listingCount = countMap[cat.id] || 0;
      const formatted = {
        id: cat.id,
        title: cat.title,
        alias: cat.alias,
        parentId: cat.parentId,
        listingCount,
        description: cat.metaDescription || (cat.jsonParams as any)?.description || null,
        isFeatured: cat.isFeatured,
      };

      if (!cat.parentId || cat.parentId === 0) {
        rootCategories.push(formatted);
      } else {
        if (!childrenMap[cat.parentId]) {
          childrenMap[cat.parentId] = [];
        }
        childrenMap[cat.parentId].push(formatted);
      }
    }

    // Attach children to root categories
    for (const root of rootCategories) {
      root.children = childrenMap[root.id] || [];
      // Calculate total listings including children
      const childrenCount = root.children.reduce((acc: number, ch: any) => acc + ch.listingCount, 0);
      root.totalListings = (root.listingCount || 0) + childrenCount;
    }

    // Filter main root categories that have content or are relevant
    const mainCategories = rootCategories.filter(
      (c) => ['am-thuc', 'quan-cafe', 'luu-tru', 'du-lich', 'wellness', 'mua-sam', 'giai-tri', 'lam-dep', 'y-te', 'giao-duc', 'toplist'].includes(c.alias) || c.totalListings > 0,
    );

    return mainCategories;
  }

  async getCategoryByAlias(alias: string) {
    const category = await this.categoryRepo.findOne({
      where: { alias },
    });
    if (!category) {
      throw new NotFoundException(`Category with alias "${alias}" not found`);
    }

    const children = await this.categoryRepo.find({
      where: { parentId: category.id },
      order: { iorder: 'ASC', id: 'ASC' },
    });

    const listingCountsRaw = await this.categoryRepo.query(`
      SELECT category_id, COUNT(listing_id) as count
      FROM category_listing
      WHERE category_id IN (?)
      GROUP BY category_id
    `, [[category.id, ...children.map((c) => c.id)]]);

    const countMap: Record<number, number> = {};
    for (const r of listingCountsRaw) {
      countMap[Number(r.category_id)] = Number(r.count);
    }

    return {
      id: category.id,
      title: category.title,
      alias: category.alias,
      parentId: category.parentId,
      listingCount: countMap[category.id] || 0,
      description: category.metaDescription || (category.jsonParams as any)?.description || null,
      subcategories: children.map((c) => ({
        id: c.id,
        title: c.title,
        alias: c.alias,
        listingCount: countMap[c.id] || 0,
      })),
    };
  }

  async getPopularTags(limit = 40, q?: string) {
    const qb = this.tagRepo
      .createQueryBuilder('t')
      .where('t.deleted_at IS NULL');

    if (q && q.trim().length > 0) {
      qb.andWhere('(t.name LIKE :q OR t.slug LIKE :q)', { q: `%${q.trim()}%` });
      qb.orderBy('t.count_used', 'DESC').addOrderBy('t.name', 'ASC');
    } else {
      qb.orderBy('t.count_used', 'DESC');
    }

    const tags = await qb.limit(limit).getMany();

    return tags.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      countUsed: t.countUsed,
      color: t.color || '#3B82F6',
    }));
  }

  async getMerchantFoodCategories() {
    // Danh mục món ăn thực tế chuẩn ẩm thực & đồ uống cho thực đơn quán
    return [
      { id: 1001, name: 'Món chính', alias: 'mon-chinh' },
      { id: 1002, name: 'Món khai vị', alias: 'mon-khai-vi' },
      { id: 1003, name: 'Lẩu & Món nhúng', alias: 'lau-mon-nhung' },
      { id: 1004, name: 'Món nướng & BBQ', alias: 'mon-nuong-bbq' },
      { id: 1005, name: 'Cơm, Mì & Bún', alias: 'com-mi-bun' },
      { id: 1006, name: 'Đặc sản Xứ Nghệ', alias: 'dac-san-xu-nghe' },
      { id: 1007, name: 'Hải sản tươi ngon', alias: 'hai-san' },
      { id: 1008, name: 'Món ăn kèm & Topping', alias: 'an-kem-topping' },
      { id: 1009, name: 'Rau, Nấm & Đậu', alias: 'rau-nam-dau' },
      { id: 1010, name: 'Đồ uống & Trà, Cà phê', alias: 'do-uong-tra-cafe' },
      { id: 1011, name: 'Bia & Nước ngọt', alias: 'bia-nuoc-ngot' },
      { id: 1012, name: 'Tráng miệng & Chè', alias: 'trang-mieng-che' },
      { id: 1013, name: 'Combo / Set tiết kiệm', alias: 'combo-set' },
      { id: 1014, name: 'Món bán chạy nhất', alias: 'mon-ban-chay' },
    ];
  }

  async getFoodServices() {
    // Quick food service chips on Home View
    return [
      { id: 42, name: 'Ẩm thực', alias: 'am-thuc', icon: 'restaurant', type: 'category' },
      { id: 34, name: 'Quán cà phê', alias: 'quan-cafe', icon: 'coffee', type: 'category' },
      { id: 46, name: 'Quán ăn vặt', alias: 'quan-an-vat', icon: 'fastfood', type: 'category' },
      { id: 47, name: 'Quán cơm', alias: 'quan-com', icon: 'rice_bowl', type: 'category' },
      { id: 119, name: 'Bún / Phở', alias: 'bun-pho', icon: 'soup_kitchen', type: 'category' },
      { id: 97, name: 'Trà sữa', alias: 'tra-sua', icon: 'local_drink', type: 'category' },
      { id: 25, name: 'Hải sản', alias: 'hai-san', icon: 'set_meal', type: 'category' },
      { id: 48, name: 'Nhà hàng', alias: 'nha-hang', icon: 'dinner_dining', type: 'category' },
      { id: 32, name: 'Đặt phòng', alias: 'luu-tru', icon: 'hotel_rounded', type: 'service' },
      { id: 0, name: 'Đặt bàn', alias: 'table-booking', icon: 'table_restaurant', type: 'service' },
    ];
  }
}
