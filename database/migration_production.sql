-- ======================================================================================
-- TOPLIST NGHỆ AN - PRODUCTION DATABASE MIGRATION SCRIPT
-- Mô tả: Thêm các bảng và cột mới cho backend toplistna-api (NestJS)
-- Đảm bảo AN TOÀN 100%: Chỉ dùng CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS,
-- KHÔNG XÓA hay THAY ĐỔI dữ liệu hiện có của booking-na (Laravel).
-- ======================================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- --------------------------------------------------------------------------------------
-- 1. BẢNG MENU VÀ MÓN ĂN
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `menu_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `listing_id` bigint unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `price` int NOT NULL DEFAULT 0,
  `image_url` varchar(500) DEFAULT NULL,
  `category_name` varchar(255) NOT NULL DEFAULT 'Khác',
  `is_available` tinyint(1) NOT NULL DEFAULT 1,
  `iorder` int NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_menu_items_listing_id` (`listing_id`),
  KEY `idx_menu_items_category` (`category_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------------------
-- 2. BẢNG GIỎ HÀNG (CARTS & CART_ITEMS)
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `carts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `listing_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_carts_user_listing` (`user_id`, `listing_id`),
  KEY `idx_carts_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cart_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cart_id` bigint unsigned NOT NULL,
  `menu_item_id` bigint unsigned NOT NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `note` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cart_item` (`cart_id`, `menu_item_id`),
  KEY `idx_cart_items_cart_id` (`cart_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------------------
-- 3. BẢNG VOUCHER & MÃ GIẢM GIÁ
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `vouchers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `discount_type` varchar(20) NOT NULL DEFAULT 'fixed',
  `discount_value` int NOT NULL DEFAULT 0,
  `min_order_value` int NOT NULL DEFAULT 0,
  `max_discount` int DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vouchers_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------------------
-- 4. BẢNG ĐƠN HÀNG ĐỒ ĂN (ORDERS & ORDER_ITEMS)
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_code` varchar(32) NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `listing_id` bigint unsigned NOT NULL,
  `delivery_address` varchar(500) NOT NULL,
  `delivery_latitude` decimal(20,17) DEFAULT NULL,
  `delivery_longitude` decimal(20,17) DEFAULT NULL,
  `distance_km` decimal(5,2) DEFAULT NULL,
  `duration_minutes` int DEFAULT NULL,
  `pricing_version` varchar(50) DEFAULT NULL,
  `vehicle_type` varchar(30) DEFAULT 'bike',
  `service_type` varchar(50) DEFAULT 'food_delivery',
  `pricing_breakdown` longtext DEFAULT NULL,
  `original_subtotal` int NOT NULL DEFAULT 0,
  `promotion_discount` int NOT NULL DEFAULT 0,
  `store_discount` int NOT NULL DEFAULT 0,
  `platform_discount` int NOT NULL DEFAULT 0,
  `food_total` int NOT NULL DEFAULT 0,
  `subtotal` int NOT NULL DEFAULT 0,
  `shipping_fee` int NOT NULL DEFAULT 0,
  `discount_amount` int NOT NULL DEFAULT 0,
  `total_amount` int NOT NULL DEFAULT 0,
  `store_subsidy` int NOT NULL DEFAULT 0,
  `platform_subsidy` int NOT NULL DEFAULT 0,
  `merchant_payable` int NOT NULL DEFAULT 0,
  `financial_breakdown` longtext DEFAULT NULL,
  `note` varchar(500) DEFAULT NULL,
  `payment_method` varchar(30) NOT NULL DEFAULT 'cash',
  `payment_status` varchar(30) NOT NULL DEFAULT 'pending',
  `order_status` varchar(30) NOT NULL DEFAULT 'pending',
  `driver_id` bigint unsigned DEFAULT NULL,
  `firego_delivery_id` varchar(64) DEFAULT NULL,
  `firego_driver_id` varchar(64) DEFAULT NULL,
  `driver_name` varchar(100) DEFAULT NULL,
  `driver_phone` varchar(30) DEFAULT NULL,
  `driver_plate` varchar(30) DEFAULT NULL,
  `driver_vehicle` varchar(50) DEFAULT NULL,
  `driver_avatar` varchar(500) DEFAULT NULL,
  `driver_rating` decimal(3,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_order_code` (`order_code`),
  KEY `idx_orders_user_id` (`user_id`),
  KEY `idx_orders_listing_id` (`listing_id`),
  KEY `idx_orders_status` (`order_status`),
  KEY `idx_orders_firego_delivery_id` (`firego_delivery_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `menu_item_id` bigint unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `price` int NOT NULL DEFAULT 0,
  `quantity` int NOT NULL DEFAULT 1,
  `note` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------------------
-- 5. BẢNG GIAO HÀNG ĐỘC LẬP (DELIVERY_ORDERS)
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `delivery_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_code` varchar(32) NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `pickup_address` varchar(500) NOT NULL,
  `pickup_latitude` decimal(20,17) DEFAULT NULL,
  `pickup_longitude` decimal(20,17) DEFAULT NULL,
  `delivery_address` varchar(500) NOT NULL,
  `delivery_latitude` decimal(20,17) DEFAULT NULL,
  `delivery_longitude` decimal(20,17) DEFAULT NULL,
  `package_type` varchar(100) DEFAULT NULL,
  `package_weight` varchar(50) DEFAULT NULL,
  `recipient_name` varchar(255) NOT NULL,
  `recipient_phone` varchar(20) NOT NULL,
  `note` text DEFAULT NULL,
  `distance_km` decimal(5,2) DEFAULT NULL,
  `fare` int DEFAULT NULL,
  `duration_minutes` int DEFAULT NULL,
  `vehicle_type` varchar(20) NOT NULL DEFAULT 'motorbike',
  `status` varchar(30) NOT NULL DEFAULT 'created',
  `driver_id` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_delivery_orders_code` (`order_code`),
  KEY `idx_delivery_orders_user_id` (`user_id`),
  KEY `idx_delivery_orders_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------------------
-- 6. HỆ THỐNG VÍ QUÁN & ĐỐI SOÁT DOANH THU (STORE_WALLETS, TRANSACTIONS, WITHDRAWALS)
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `store_wallets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `store_id` bigint unsigned NOT NULL,
  `balance` int NOT NULL DEFAULT 0,
  `pending_balance` int NOT NULL DEFAULT 0,
  `held_balance` int NOT NULL DEFAULT 0,
  `debt_balance` int NOT NULL DEFAULT 0,
  `bank_name` varchar(100) DEFAULT NULL,
  `bank_account_number` varchar(50) DEFAULT NULL,
  `bank_account_holder` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_store_wallets_store_id` (`store_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `store_wallet_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `wallet_id` bigint unsigned NOT NULL,
  `store_id` bigint unsigned NOT NULL,
  `order_id` bigint unsigned DEFAULT NULL,
  `order_code` varchar(50) DEFAULT NULL,
  `type` varchar(50) NOT NULL,
  `amount` int NOT NULL,
  `balance_before` int NOT NULL DEFAULT 0,
  `balance_after` int NOT NULL DEFAULT 0,
  `idempotency_key` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_swt_idempotency_key` (`idempotency_key`),
  KEY `idx_swt_wallet_id` (`wallet_id`),
  KEY `idx_swt_store_id` (`store_id`),
  KEY `idx_swt_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `store_withdrawals` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `wallet_id` bigint unsigned NOT NULL,
  `store_id` bigint unsigned NOT NULL,
  `amount` int NOT NULL,
  `bank_name` varchar(100) NOT NULL,
  `bank_account_number` varchar(50) NOT NULL,
  `bank_account_holder` varchar(100) NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'PENDING',
  `rejection_reason` varchar(255) DEFAULT NULL,
  `processed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sw_store_id` (`store_id`),
  KEY `idx_sw_wallet_id` (`wallet_id`),
  KEY `idx_sw_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `settlement_records` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `restaurant_id` bigint unsigned NOT NULL,
  `order_code` varchar(50) NOT NULL,
  `gross_amount` int NOT NULL DEFAULT 0,
  `store_discount` int NOT NULL DEFAULT 0,
  `platform_subsidy` int NOT NULL DEFAULT 0,
  `commission_rate` decimal(5,2) NOT NULL DEFAULT 0.00,
  `commission_amount` int NOT NULL DEFAULT 0,
  `payment_fee` int NOT NULL DEFAULT 0,
  `refund_amount` int NOT NULL DEFAULT 0,
  `restaurant_payable` int NOT NULL DEFAULT 0,
  `status` varchar(30) NOT NULL DEFAULT 'pending',
  `settlement_period` varchar(20) DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sr_restaurant_id` (`restaurant_id`),
  KEY `idx_sr_order_id` (`order_id`),
  KEY `idx_sr_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------------------
-- 7. CHƯƠNG TRÌNH KHUYẾN MÃI / FLASH SALE (PROMOTIONS & PROMOTION_ITEMS)
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `promotions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `store_id` bigint unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` varchar(50) NOT NULL DEFAULT 'flash_sale',
  `start_at` datetime NOT NULL,
  `end_at` datetime NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `banner_color` varchar(50) NOT NULL DEFAULT '#E53935',
  `funding_source` varchar(30) NOT NULL DEFAULT 'STORE',
  `store_share_pct` int NOT NULL DEFAULT 100,
  `platform_share_pct` int NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_promotions_store_id` (`store_id`),
  KEY `idx_promotions_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `promotion_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `promotion_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `original_price` int NOT NULL,
  `sale_price` int NOT NULL,
  `max_quantity` int NOT NULL DEFAULT 0,
  `reserved_quantity` int NOT NULL DEFAULT 0,
  `sold_quantity` int NOT NULL DEFAULT 0,
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_promo_items_promo_id` (`promotion_id`),
  KEY `idx_promo_items_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------------------
-- 8. BẢNG THANH TOÁN CỔNG ONLINE (PAYMENTS)
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `order_code` varchar(32) NOT NULL,
  `transaction_id` varchar(64) NOT NULL,
  `provider` varchar(30) NOT NULL,
  `amount` int NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'pending',
  `provider_transaction_id` varchar(100) DEFAULT NULL,
  `payment_url` text DEFAULT NULL,
  `qr_code_url` text DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `metadata` longtext DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payments_transaction_id` (`transaction_id`),
  KEY `idx_payments_order_id` (`order_id`),
  KEY `idx_payments_order_code` (`order_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------------------
-- 9. BẢNG QUẢN LÝ TẦNG & SỐ PHÒNG KHÁCH SẠN (HOTEL_FLOORS & HOTEL_PHYSICAL_ROOMS)
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hotel_floors` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `listing_id` bigint unsigned NOT NULL,
  `floor_number` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hotel_floors_listing_id` (`listing_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hotel_physical_rooms` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `listing_id` bigint unsigned NOT NULL,
  `floor_id` bigint unsigned NOT NULL,
  `room_type_id` bigint unsigned NOT NULL,
  `room_number` varchar(50) NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'available',
  `clean_status` varchar(50) NOT NULL DEFAULT 'clean',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hpr_listing_id` (`listing_id`),
  KEY `idx_hpr_floor_id` (`floor_id`),
  KEY `idx_hpr_room_type_id` (`room_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------------------
-- 10. BẢNG PHIÊN BẢN APP & AUDIT LOGS ADMIN (APP_VERSIONS & ADMIN_AUDIT_LOGS)
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `app_versions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `platform` varchar(30) NOT NULL,
  `version` varchar(50) NOT NULL,
  `build_number` int NOT NULL DEFAULT 1,
  `force_update` tinyint(1) NOT NULL DEFAULT 0,
  `update_url` varchar(500) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `admin_id` bigint unsigned NOT NULL,
  `admin_name` varchar(255) DEFAULT NULL,
  `admin_email` varchar(255) DEFAULT NULL,
  `action` varchar(50) NOT NULL,
  `source` varchar(50) NOT NULL DEFAULT 'BACKEND_API',
  `target_type` varchar(100) NOT NULL,
  `target_id` varchar(100) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `before_data` json DEFAULT NULL,
  `after_data` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `location` varchar(255) DEFAULT 'TP. Vinh, Nghệ An, VN',
  `user_agent` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_admin_id` (`admin_id`),
  KEY `idx_audit_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------------------
-- 11. BẢNG BỘ SƯU TẬP TRANG CHỦ & ANALYTICS EVENTS (HOMEPAGE_COLLECTIONS & EVENTS)
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `homepage_collections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `collection_key` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `subtitle` varchar(255) DEFAULT NULL,
  `badge` varchar(100) DEFAULT NULL,
  `banner_color` varchar(50) DEFAULT NULL,
  `banner_url` varchar(500) DEFAULT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `priority` int NOT NULL DEFAULT 50,
  `ui_type` varchar(50) NOT NULL DEFAULT 'FOOD_CAROUSEL',
  `source_type` varchar(50) NOT NULL DEFAULT 'FLASH_SALE',
  `ranking_mode` varchar(50) NOT NULL DEFAULT 'HYBRID',
  `display_limit` int NOT NULL DEFAULT 10,
  `filter_params` json DEFAULT NULL,
  `start_at` datetime DEFAULT NULL,
  `end_at` datetime DEFAULT NULL,
  `created_by` varchar(100) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_homepage_collections_key` (`collection_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `homepage_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_name` varchar(64) NOT NULL,
  `user_id` int DEFAULT NULL,
  `anonymous_device_id` varchar(128) DEFAULT NULL,
  `feed_session_id` varchar(128) DEFAULT NULL,
  `collection_key` varchar(64) DEFAULT NULL,
  `item_id` int DEFAULT NULL,
  `restaurant_id` int DEFAULT NULL,
  `position` int DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_he_event_name` (`event_name`),
  KEY `idx_he_user_id` (`user_id`),
  KEY `idx_he_anonymous_id` (`anonymous_device_id`),
  KEY `idx_he_collection_key` (`collection_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------------------
-- 12. BỔ SUNG CÁC CỘT MỚI VÀO CÁC BẢNG CÓ SẴN CỦA BOOKING-NA (NẾU CHƯA CÓ)
-- --------------------------------------------------------------------------------------
-- Bảng restaurant_reservations
ALTER TABLE `restaurant_reservations`
  ADD COLUMN IF NOT EXISTS `booking_code` varchar(20) DEFAULT NULL COMMENT 'Mã đặt bàn dạng TB100589',
  ADD COLUMN IF NOT EXISTS `area` varchar(100) DEFAULT NULL COMMENT 'Khu vực (Phòng riêng, Ngoài trời...)',
  ADD COLUMN IF NOT EXISTS `confirmed_at` datetime DEFAULT NULL COMMENT 'Thời điểm nhà hàng xác nhận';

-- Bảng hotel_reservations
ALTER TABLE `hotel_reservations`
  ADD COLUMN IF NOT EXISTS `deposit_method` varchar(30) DEFAULT NULL COMMENT 'deposit_10 | deposit_30 | pay_at_hotel',
  ADD COLUMN IF NOT EXISTS `deposit_percentage` int DEFAULT NULL COMMENT 'Phần trăm cọc: 10, 30, 0',
  ADD COLUMN IF NOT EXISTS `deposit_amount` bigint DEFAULT NULL COMMENT 'Số tiền cọc thực tế (VND)',
  ADD COLUMN IF NOT EXISTS `total_price` bigint DEFAULT NULL COMMENT 'Tổng tiền phòng (VND)',
  ADD COLUMN IF NOT EXISTS `payment_status` varchar(30) DEFAULT 'pending' COMMENT 'pending | paid',
  ADD COLUMN IF NOT EXISTS `payment_transaction_id` varchar(100) DEFAULT NULL COMMENT 'Mã giao dịch thanh toán online';

-- Bảng users
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `fcm_token` varchar(500) DEFAULT NULL COMMENT 'Token Firebase Cloud Messaging push notification',
  ADD COLUMN IF NOT EXISTS `partner_status` varchar(50) DEFAULT NULL COMMENT 'Trạng thái đối tác gian hàng';

-- Bảng listings
ALTER TABLE `listings`
  ADD COLUMN IF NOT EXISTS `is_flash_sale_active` tinyint(1) DEFAULT 0 COMMENT 'Gian hàng đang có flash sale',
  ADD COLUMN IF NOT EXISTS `active_discount_pct` int DEFAULT 0 COMMENT 'Phần trăm giảm giá hiển thị badge';

SET FOREIGN_KEY_CHECKS = 1;
