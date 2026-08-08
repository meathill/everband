import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// 联系表单：Turnstile siteverify 反滥用（PRD §8.2）。
// MVP 阶段提交只记录到 Workers Logs；正式发信待 Email Service 域名验证后接入。

const contactSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  message: z.string().trim().min(1).max(2000),
  token: z.string().min(1),
});

export const Route = createFileRoute("/api/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = contactSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ ok: false }, { status: 400 });
        }

        const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: env.TURNSTILE_SECRET ?? "",
            response: parsed.data.token,
          }),
        });
        const outcome = (await verify.json()) as { success: boolean };
        if (!outcome.success) {
          return Response.json({ ok: false }, { status: 400 });
        }

        console.log("landing contact submission", {
          name: parsed.data.name,
          email: parsed.data.email,
          length: parsed.data.message.length,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
