// 应用站地址（dev 走 localhost，生产指向 everband-app.meathill.com；换域名时同步改，见 DEPLOYMENT.md）
export const APP_URL = import.meta.env.DEV
  ? "http://localhost:3000"
  : "https://everband-app.meathill.com";
