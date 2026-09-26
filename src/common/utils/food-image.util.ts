/**
 * Food Image Utility
 * Quy tắc: Mỗi món chỉ được tối đa 1 ảnh và mỗi topping 1 ảnh.
 * Nếu món chưa được thêm ảnh (null hoặc rỗng), trả về null/empty để phía App/Web
 * hiển thị ICON MÓN ĂN MẶC ĐỊNH, tuyệt đối không lấy ảnh ngẫu nhiên hoặc ảnh lung tung.
 */
export function getFoodImageByDishName(name?: string, category?: string, explicitImg?: string): string {
  if (explicitImg && explicitImg.trim().length > 0) {
    return explicitImg.trim();
  }
  // Nếu không có ảnh chỉ định cụ thể, trả về rỗng để hiển thị icon món ăn mặc định
  return '';
}
