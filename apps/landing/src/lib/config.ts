// 应用站地址（dev 走 localhost，生产指向 everband-app.meathill.com；换域名时同步改，见 DEPLOYMENT.md）
export const APP_URL = import.meta.env.DEV
  ? "http://localhost:3000"
  : "https://everband-app.meathill.com";

// 营销站地址（SEO canonical/OG 使用；换域名时同步改，见 DEPLOYMENT.md）
export const SITE_URL = import.meta.env.DEV
  ? "http://localhost:3001"
  : "https://everband.meathill.com";

export const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;
