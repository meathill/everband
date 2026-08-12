import { afterEach, describe, expect, it, vi } from "vitest";

const { MockClient, DyqrApiErrorMock, clients } = vi.hoisted(() => {
  const clients: MockClient[] = [];
  class DyqrApiErrorMock extends Error {}
  class MockClient {
    readonly links: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      qr: ReturnType<typeof vi.fn>;
    };
    constructor(readonly options: { baseUrl: string; token: string }) {
      this.links = {
        create: vi.fn(),
        update: vi.fn(),
        get: vi.fn(),
        qr: vi.fn(),
      };
      clients.push(this);
    }
  }
  return { MockClient, DyqrApiErrorMock, clients };
});

vi.mock("@dyqr/sdk", () => ({
  DyqrClient: MockClient,
  DyqrApiError: DyqrApiErrorMock,
}));

import {
  chooseShortLinkService,
  DyqrShortLinkService,
  MockShortLinkService,
  ShortLinkError,
} from "../src/dyqr/index.ts";

afterEach(() => {
  clients.length = 0;
});

function lastClient(): InstanceType<typeof MockClient> {
  const client = clients.at(-1);
  if (!client) {
    throw new Error("MockClient 未构造：请先调用 createService()");
  }
  return client;
}

describe("chooseShortLinkService", () => {
  it("dyqr 模式且带 token → DyqrShortLinkService", () => {
    const service = chooseShortLinkService("dyqr", "token-123");
    expect(service).toBeInstanceOf(DyqrShortLinkService);
    expect(clients[0]?.options.token).toBe("token-123");
  });

  it("dyqr 模式无 token → 降级 MockShortLinkService", () => {
    expect(chooseShortLinkService("dyqr", undefined)).toBeInstanceOf(MockShortLinkService);
    expect(clients).toHaveLength(0);
  });

  it("mock 模式 → MockShortLinkService", () => {
    expect(chooseShortLinkService("mock", "token-123")).toBeInstanceOf(MockShortLinkService);
    expect(clients).toHaveLength(0);
  });

  it("未配置模式 → MockShortLinkService", () => {
    expect(chooseShortLinkService(undefined, undefined)).toBeInstanceOf(MockShortLinkService);
  });
});

describe("MockShortLinkService", () => {
  it("createLink 生成 mock 前缀 alias 与可访问短链", async () => {
    const service = new MockShortLinkService();
    const result = await service.createLink({ targetUrl: "https://example.com/band" });
    expect(result.alias).toMatch(/^mock/);
    expect(result.shortUrl).toBe(`https://dyqr.me/${result.alias}`);
  });

  it("updateTarget 更新已建链接的目标地址", async () => {
    const service = new MockShortLinkService();
    const { alias } = await service.createLink({ targetUrl: "https://example.com/a" });
    await expect(service.updateTarget(alias, "https://example.com/b")).resolves.toBeUndefined();
    await expect(service.getScanCount()).resolves.toBe(0);
  });

  it("getQrImage 返回含短链文本的占位 SVG", async () => {
    const service = new MockShortLinkService();
    const { alias, shortUrl } = await service.createLink({ targetUrl: "https://example.com/a" });
    const image = await service.getQrImage(alias);
    expect(image.contentType).toBe("image/svg+xml");
    const text = String.fromCharCode(...image.bytes);
    expect(text).toContain(shortUrl);
  });

  it("getScanCount 返回 0", async () => {
    const service = new MockShortLinkService();
    await expect(service.getScanCount()).resolves.toBe(0);
  });
});

describe("DyqrShortLinkService", () => {
  function createService(): DyqrShortLinkService {
    return new DyqrShortLinkService("token-123");
  }

  it("createLink 透传参数并映射结果", async () => {
    const service = createService();
    const client = lastClient();
    client.links.create.mockResolvedValue({
      link: { alias: "abc123" },
      shortUrl: "https://dyqr.me/abc123",
    });
    const result = await service.createLink({
      targetUrl: "https://example.com/band",
      title: "Everband",
    });
    expect(client.links.create).toHaveBeenCalledWith({
      targetUrl: "https://example.com/band",
      title: "Everband",
    });
    expect(result).toEqual({ alias: "abc123", shortUrl: "https://dyqr.me/abc123" });
  });

  it("createLink 遇 DyqrApiError → ShortLinkError", async () => {
    const service = createService();
    lastClient().links.create.mockRejectedValue(new DyqrApiErrorMock("rate limited"));
    const error = await service
      .createLink({ targetUrl: "https://example.com/a" })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ShortLinkError);
    expect((error as Error).message).toBe("dyqr API error: rate limited");
  });

  it("updateTarget 遇非 API 错误 → 统一的不可用提示", async () => {
    const service = createService();
    lastClient().links.update.mockRejectedValue(new Error("network down"));
    const error = await service
      .updateTarget("abc123", "https://example.com/b")
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ShortLinkError);
    expect((error as Error).message).toBe("dyqr.me is temporarily unavailable");
  });

  it("getQrImage 透传 contentType 与 bytes", async () => {
    const service = createService();
    const bytes = new Uint8Array([1, 2, 3]);
    lastClient().links.qr.mockResolvedValue({ contentType: "image/png", bytes });
    const result = await service.getQrImage("abc123", "png");
    expect(lastClient().links.qr).toHaveBeenCalledWith("abc123", { format: "png" });
    expect(result).toEqual({ contentType: "image/png", bytes });
  });

  it("getScanCount 优先 clicks、回退 clickCount", async () => {
    const service = createService();
    lastClient().links.get.mockResolvedValue({ link: { clicks: 42 } });
    await expect(service.getScanCount("abc123")).resolves.toBe(42);
    lastClient().links.get.mockResolvedValue({ link: { clickCount: 7 } });
    await expect(service.getScanCount("abc123")).resolves.toBe(7);
    lastClient().links.get.mockResolvedValue({ link: {} });
    await expect(service.getScanCount("abc123")).resolves.toBeNull();
  });

  it("getScanCount 异常时返回 null（降级不抛）", async () => {
    const service = createService();
    lastClient().links.get.mockRejectedValue(new Error("boom"));
    await expect(service.getScanCount("abc123")).resolves.toBeNull();
  });
});
