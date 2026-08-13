// dyqr.me 短链/二维码封装（PRD §8.5）。
// 平台统一账号模型：token 是账号级全权限凭证，只在服务端集成模块使用，
// 不写入业务表/日志/前端响应。降级要求：dyqr 不可用只影响
// 生成/更新/统计，核心运营流程不受影响 —— 调用方须捕获 ShortLinkError。

import { DyqrApiError, DyqrClient } from "@dyqr/sdk";

export type ShortLinkErrorKind = "not_found" | "quota" | "unauthorized" | "unavailable";

export class ShortLinkError extends Error {
  constructor(
    message: string,
    readonly kind: ShortLinkErrorKind = "unavailable",
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface CreatedShortLink {
  alias: string;
  shortUrl: string;
}

export interface QrImageResult {
  contentType: string;
  bytes: Uint8Array;
}

export interface ShortLinkService {
  createLink(input: { targetUrl: string; title?: string }): Promise<CreatedShortLink>;
  updateTarget(alias: string, targetUrl: string): Promise<void>;
  removeLink(alias: string): Promise<void>;
  getQrImage(alias: string, format: "svg" | "png"): Promise<QrImageResult>;
  // 扫描统计（轮询同步，非强一致；不可用时返回 null）
  getScanCount(alias: string): Promise<number | null>;
}

const DYQR_BASE_URL = "https://dyqr.me";

export class DyqrShortLinkService implements ShortLinkService {
  private readonly client: DyqrClient;

  constructor(token: string) {
    this.client = new DyqrClient({ baseUrl: DYQR_BASE_URL, token });
  }

  private wrap(cause: unknown): ShortLinkError {
    if (!(cause instanceof DyqrApiError)) {
      return new ShortLinkError("dyqr.me is temporarily unavailable");
    }
    const kind: ShortLinkErrorKind =
      cause.status === 404
        ? "not_found"
        : cause.status === 402
          ? "quota"
          : cause.status === 401 || cause.status === 403
            ? "unauthorized"
            : "unavailable";
    return new ShortLinkError(`dyqr API error: ${cause.message}`, kind, cause.status);
  }

  async createLink(input: { targetUrl: string; title?: string }): Promise<CreatedShortLink> {
    try {
      const result = await this.client.links.create({
        targetUrl: input.targetUrl,
        title: input.title,
      });
      return { alias: result.link.alias, shortUrl: result.shortUrl };
    } catch (cause) {
      throw this.wrap(cause);
    }
  }

  async updateTarget(alias: string, targetUrl: string): Promise<void> {
    try {
      await this.client.links.update(alias, { targetUrl });
    } catch (cause) {
      throw this.wrap(cause);
    }
  }

  async removeLink(alias: string): Promise<void> {
    try {
      await this.client.links.remove(alias);
    } catch (cause) {
      throw this.wrap(cause);
    }
  }

  async getQrImage(alias: string, format: "svg" | "png"): Promise<QrImageResult> {
    try {
      const image = await this.client.links.qr(alias, { format });
      return { contentType: image.contentType, bytes: image.bytes };
    } catch (cause) {
      throw this.wrap(cause);
    }
  }

  async getScanCount(alias: string): Promise<number | null> {
    try {
      const result = await this.client.links.get(alias);
      const link = result.link as { clicks?: number; clickCount?: number };
      return link.clicks ?? link.clickCount ?? null;
    } catch (cause) {
      const wrapped = this.wrap(cause);
      // 只有明确的 404 才能判定已打印标签损坏；网络/限流只做降级。
      if (wrapped.kind === "not_found") throw wrapped;
      return null;
    }
  }
}

// dev/CI：内存实现，不发任何外部请求（PRD §12.3）
export class MockShortLinkService implements ShortLinkService {
  private readonly links = new Map<string, string>();
  private counter = 0;

  createLink(input: { targetUrl: string }): Promise<CreatedShortLink> {
    this.counter += 1;
    const alias = `mock${this.counter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    this.links.set(alias, input.targetUrl);
    return Promise.resolve({ alias, shortUrl: `${DYQR_BASE_URL}/${alias}` });
  }

  updateTarget(alias: string, targetUrl: string): Promise<void> {
    this.links.set(alias, targetUrl);
    return Promise.resolve();
  }

  removeLink(alias: string): Promise<void> {
    this.links.delete(alias);
    return Promise.resolve();
  }

  getQrImage(alias: string): Promise<QrImageResult> {
    // dev 占位图：包含短链文本的 SVG（真实扫码图由 dyqr 生成）
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" fill="#fff"/><rect x="20" y="20" width="60" height="60" fill="#000"/><rect x="160" y="20" width="60" height="60" fill="#000"/><rect x="20" y="160" width="60" height="60" fill="#000"/><text x="120" y="130" font-size="12" text-anchor="middle" font-family="monospace">${DYQR_BASE_URL}/${alias}</text><text x="120" y="150" font-size="10" text-anchor="middle" font-family="monospace">(dev placeholder)</text></svg>`;
    return Promise.resolve({
      contentType: "image/svg+xml",
      bytes: new TextEncoder().encode(svg),
    });
  }

  getScanCount(): Promise<number | null> {
    return Promise.resolve(0);
  }
}

export function chooseShortLinkService(
  mode: string | undefined,
  token: string | undefined,
): ShortLinkService {
  if (mode === "dyqr" && token) {
    return new DyqrShortLinkService(token);
  }
  return new MockShortLinkService();
}
