import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart } from '../../entities/cart.entity';
import { CartItem } from '../../entities/cart-item.entity';
import { MenuItem } from '../../entities/menu-item.entity';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart) private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem) private readonly cartItemRepo: Repository<CartItem>,
    @InjectRepository(MenuItem) private readonly menuItemRepo: Repository<MenuItem>,
  ) {}

  async getCart(userId: number) {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) return { cart: null, items: [], subtotal: 0 };

    const items = await this.cartItemRepo.find({ where: { cartId: cart.id } });

    const itemsWithDetail = await Promise.all(
      items.map(async (ci) => {
        const menuItem = await this.menuItemRepo.findOne({ where: { id: ci.menuItemId } });
        return {
          cart_item_id: ci.id,
          menu_item_id: ci.menuItemId,
          name: menuItem?.name ?? 'Không rõ',
          price: menuItem?.price ?? 0,
          image_url: menuItem?.imageUrl,
          quantity: ci.quantity,
          note: ci.note,
          subtotal: (menuItem?.price ?? 0) * ci.quantity,
        };
      }),
    );

    const subtotal = itemsWithDetail.reduce((sum, i) => sum + i.subtotal, 0);

    return {
      cart_id: cart.id,
      listing_id: cart.listingId,
      items: itemsWithDetail,
      subtotal,
    };
  }

  async addToCart(userId: number, listingId: number, menuItemId: number, quantity: number, note?: string) {
    const menuItem = await this.menuItemRepo.findOne({ where: { id: menuItemId } });
    if (!menuItem) throw new NotFoundException('Món ăn không tồn tại');
    if (!menuItem.isAvailable) throw new BadRequestException('Món ăn đã hết');

    // Nếu giỏ hàng thuộc quán khác → clear
    let cart = await this.cartRepo.findOne({ where: { userId } });
    if (cart && cart.listingId !== listingId) {
      await this.cartItemRepo.delete({ cartId: cart.id });
      cart.listingId = listingId;
      await this.cartRepo.save(cart);
    }

    if (!cart) {
      cart = this.cartRepo.create({ userId, listingId });
      cart = await this.cartRepo.save(cart);
    }

    // Upsert cart item
    let cartItem = await this.cartItemRepo.findOne({
      where: { cartId: cart.id, menuItemId },
    });

    if (cartItem) {
      cartItem.quantity = quantity;
      if (note !== undefined) cartItem.note = note;
      if (quantity <= 0) {
        await this.cartItemRepo.delete({ id: cartItem.id });
        return { message: 'Đã xóa món khỏi giỏ hàng' };
      }
      await this.cartItemRepo.save(cartItem);
    } else {
      if (quantity > 0) {
        cartItem = this.cartItemRepo.create({ cartId: cart.id, menuItemId, quantity, note });
        await this.cartItemRepo.save(cartItem);
      }
    }

    return this.getCart(userId);
  }

  async clearCart(userId: number) {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (cart) {
      await this.cartItemRepo.delete({ cartId: cart.id });
      await this.cartRepo.delete({ id: cart.id });
    }
  }
}
