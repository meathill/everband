// domain 包运行于 Workers 与 Node，两端都有 Web Crypto 全局；
// 为保持零 types 依赖（不引入 dom/node lib），只声明用到的最小面。
declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};
