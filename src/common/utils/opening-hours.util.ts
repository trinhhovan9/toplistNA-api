export interface StoreOpenStatus {
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
  openStatusText: string;
}

/**
 * Computes whether a store is currently open or closed based on:
 * 1. listing.status (active/inactive)
 * 2. listing.json_params.is_open (merchant toggle)
 * 3. listing.json_params.opening_hours (scheduled opening hours)
 * All time checks use Vietnam Timezone (Asia/Ho_Chi_Minh - GMT+7).
 */
export function computeStoreOpenStatus(
  jsonParams: any,
  status?: string,
  nowDate: Date = new Date(),
): StoreOpenStatus {
  // If status is explicitly inactive / closed
  if (status && ['inactive', 'closed', 'hidden', 'disabled'].includes(status.toLowerCase())) {
    return {
      isOpen: false,
      openStatusText: 'Tạm ngưng hoạt động',
    };
  }

  let params: any = jsonParams;
  if (typeof params === 'string') {
    try {
      params = JSON.parse(params);
    } catch (_) {
      params = {};
    }
  }
  if (!params || typeof params !== 'object') {
    params = {};
  }

  // If merchant manually toggled is_open to false
  if (params.is_open === false || params.isOpen === false) {
    return {
      isOpen: false,
      openStatusText: 'Quán tạm đóng cửa',
    };
  }

  // Get current time in GMT+7 (Vietnam)
  const vnTimeStr = nowDate.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
  const vnDate = new Date(vnTimeStr);

  const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDayName = daysMap[vnDate.getDay()]; // 'sunday'..'saturday'
  const currentMinutes = vnDate.getHours() * 60 + vnDate.getMinutes();

  let todayOpen = '08:00';
  let todayClose = '22:00';
  let hasHoursConfig = false;

  const hoursConfig = params.opening_hours || params.openingHours || params.hours;

  if (Array.isArray(hoursConfig)) {
    // Array of day configs
    const dayItem = hoursConfig.find(
      (h: any) => h && h.day && h.day.toString().toLowerCase() === currentDayName,
    );
    if (dayItem && dayItem.open && dayItem.close) {
      todayOpen = dayItem.open.toString().trim();
      todayClose = dayItem.close.toString().trim();
      hasHoursConfig = true;
    } else if (hoursConfig.length > 0 && hoursConfig[0]?.open && hoursConfig[0]?.close) {
      todayOpen = hoursConfig[0].open.toString().trim();
      todayClose = hoursConfig[0].close.toString().trim();
      hasHoursConfig = true;
    }
  } else if (hoursConfig && typeof hoursConfig === 'object') {
    if (hoursConfig[currentDayName]) {
      const d = hoursConfig[currentDayName];
      if (d.open && d.close) {
        todayOpen = d.open.toString().trim();
        todayClose = d.close.toString().trim();
        hasHoursConfig = true;
      }
    } else if (hoursConfig.open && hoursConfig.close) {
      todayOpen = hoursConfig.open.toString().trim();
      todayClose = hoursConfig.close.toString().trim();
      hasHoursConfig = true;
    }
  } else if (params.open_time && params.close_time) {
    todayOpen = params.open_time.toString().trim();
    todayClose = params.close_time.toString().trim();
    hasHoursConfig = true;
  }

  const formatHHMM = (t: string) => {
    const parts = t.split(':');
    if (parts.length >= 2) {
      return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    }
    return t;
  };

  const cleanOpen = formatHHMM(todayOpen);
  const cleanClose = formatHHMM(todayClose);

  if (!hasHoursConfig) {
    return {
      isOpen: true,
      openTime: cleanOpen,
      closeTime: cleanClose,
      openStatusText: 'Đang mở cửa',
    };
  }

  const parseMinutes = (t: string) => {
    const parts = t.split(':').map((p) => parseInt(p, 10));
    const h = isNaN(parts[0]) ? 0 : parts[0];
    const m = isNaN(parts[1]) ? 0 : parts[1];
    return h * 60 + m;
  };

  const openMinutes = parseMinutes(cleanOpen);
  const closeMinutes = parseMinutes(cleanClose);

  let isOpen = true;
  if (openMinutes < closeMinutes) {
    // Normal day hours (e.g. 08:00 - 22:00)
    isOpen = currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  } else if (openMinutes > closeMinutes) {
    // Overnight hours (e.g. 17:00 - 02:00)
    isOpen = currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
  } else {
    // openMinutes == closeMinutes -> 24/7
    isOpen = true;
  }

  const openStatusText = isOpen
    ? 'Đang mở cửa'
    : `Tạm đóng cửa • Mở lúc ${cleanOpen}`;

  return {
    isOpen,
    openTime: cleanOpen,
    closeTime: cleanClose,
    openStatusText,
  };
}
