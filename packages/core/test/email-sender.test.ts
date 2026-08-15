import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { MockEmailSender } from "@everband/integrations/email";
import { describe, expect, it, vi } from "vitest";
import {
  CloudflareEmailSender,
  chooseEmailSender,
  DevEmailSender,
  type SendEmailBinding,
} from "../src/email-sender.ts";

function fakeDb() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values });
  return { db: { insert } as unknown as Database, insert, values };
}

describe("chooseEmailSender", () => {
  it("mock 模式 → MockEmailSender", () => {
    const { db } = fakeDb();
    expect(chooseEmailSender(db, "mock")).toBeInstanceOf(MockEmailSender);
  });

  it("cloudflare 模式带 options → CloudflareEmailSender", () => {
    const { db } = fakeDb();
    const binding: SendEmailBinding = { send: vi.fn() };
    expect(
      chooseEmailSender(db, "cloudflare", { binding, fromEmail: "a@b.c", fromName: "X" }),
    ).toBeInstanceOf(CloudflareEmailSender);
  });

  it("cloudflare 模式缺 options → 降级 DevEmailSender", () => {
    const { db } = fakeDb();
    expect(chooseEmailSender(db, "cloudflare")).toBeInstanceOf(DevEmailSender);
  });

  it("其他模式（dev/未配置）→ DevEmailSender", () => {
    const { db } = fakeDb();
    expect(chooseEmailSender(db, "dev")).toBeInstanceOf(DevEmailSender);
    expect(chooseEmailSender(db, undefined)).toBeInstanceOf(DevEmailSender);
  });
});

describe("CloudflareEmailSender", () => {
  const options = (binding: SendEmailBinding) => ({
    binding,
    fromEmail: "no-reply@everband.app",
    fromName: "Everband",
  });

  it("发送成功返回 ok:true（含 cc 透传）", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const sender = new CloudflareEmailSender(options({ send }));
    const result = await sender.send({
      to: "a@b.c",
      subject: "Hi",
      text: "body",
      cc: "cc@b.c",
      kind: "invite",
    });
    expect(result).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith({
      to: "a@b.c",
      from: { email: "no-reply@everband.app", name: "Everband" },
      subject: "Hi",
      text: "body",
      html: undefined,
      cc: "cc@b.c",
    });
  });

  it("binding 抛带 E_* code 的错误 → error 含 code", async () => {
    const error = Object.assign(new Error("recipient suppressed"), {
      code: "E_RECIPIENT_SUPPRESSED",
    });
    const sender = new CloudflareEmailSender(options({ send: vi.fn().mockRejectedValue(error) }));
    const result = await sender.send({ to: "a@b.c", subject: "Hi", text: "body", kind: "invite" });
    expect(result).toEqual({ ok: false, error: "E_RECIPIENT_SUPPRESSED: recipient suppressed" });
  });

  it("binding 抛无 code 的错误 → error 仅含 message", async () => {
    const sender = new CloudflareEmailSender(
      options({ send: vi.fn().mockRejectedValue(new Error("boom")) }),
    );
    const result = await sender.send({ to: "a@b.c", subject: "Hi", text: "body", kind: "invite" });
    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

describe("DevEmailSender", () => {
  it("写入 dev_outbox 并返回 ok:true（含 cc）", async () => {
    const { db, insert, values } = fakeDb();
    const sender = new DevEmailSender(db);
    const result = await sender.send({
      to: "a@b.c",
      subject: "Hi",
      text: "body",
      cc: "cc@b.c",
      kind: "magic-link",
    });
    expect(result).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith(schema.devOutbox);
    const record = values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(record).toMatchObject({
      toEmail: "a@b.c",
      subject: "Hi",
      body: "body",
      cc: "cc@b.c",
      kind: "magic-link",
    });
    expect(record.id).toMatch(/^send/);
    expect(typeof record.createdAt).toBe("number");
  });
});

describe("MockEmailSender", () => {
  it("记录发送消息", async () => {
    const sender = new MockEmailSender();
    const message = { to: "a@b.c", subject: "Hi", text: "body", kind: "invite" };
    await expect(sender.send(message)).resolves.toEqual({ ok: true });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toEqual(message);
  });

  it("failNext 触发一次失败后复位", async () => {
    const sender = new MockEmailSender();
    sender.failNext = true;
    await expect(
      sender.send({ to: "a@b.c", subject: "Hi", text: "body", kind: "invite" }),
    ).resolves.toEqual({
      ok: false,
      error: "mock failure",
    });
    expect(sender.sent).toHaveLength(0);
    await expect(
      sender.send({ to: "a@b.c", subject: "Hi", text: "body", kind: "invite" }),
    ).resolves.toEqual({
      ok: true,
    });
    expect(sender.sent).toHaveLength(1);
  });
});
