import { useEffect, useRef, useState } from "react";

// Turnstile 保护的联系表单（PRD §8.2）。
// site key 是公开值（嵌入客户端）；dev 用官方测试 key（恒通过），生产用真实 widget。
// secret 是敏感值，只在 landing Worker 侧（wrangler secret put TURNSTILE_SECRET）。
const TURNSTILE_SITE_KEY = import.meta.env.DEV
  ? "1x00000000000000000000AA"
  : "0x4AAAAAAELrOpqyKsHPTod_";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void },
      ) => void;
    };
  }
}

export function ContactSection({ appUrl }: { appUrl: string }) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "busy" | "sent" | "error">("idle");

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      if (widgetRef.current && window.turnstile) {
        window.turnstile.render(widgetRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: setToken,
        });
      }
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setStatus("error");
      return;
    }
    setStatus("busy");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name")),
        email: String(form.get("email")),
        message: String(form.get("message")),
        token,
      }),
    });
    setStatus(response.ok ? "sent" : "error");
  }

  const inputClass =
    "rounded-md border border-input bg-background px-3 py-2 text-base text-foreground sm:text-sm";

  return (
    <section id="contact" className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-16">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground">Get started</h2>
        <p className="text-muted-foreground">
          Ready to try it?{" "}
          <a href={`${appUrl}/new-org`} className="text-primary underline-offset-4 hover:underline">
            Create your organization
          </a>{" "}
          — or send us a question below.
        </p>

        {status === "sent" ? (
          <p className="text-foreground">Thanks — we'll get back to you soon.</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5" htmlFor="contact-name">
                <span className="text-sm font-medium text-foreground">Name</span>
                <input id="contact-name" name="name" required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5" htmlFor="contact-email">
                <span className="text-sm font-medium text-foreground">Email</span>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  required
                  className={inputClass}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5" htmlFor="contact-message">
              <span className="text-sm font-medium text-foreground">Message</span>
              <textarea
                id="contact-message"
                name="message"
                rows={4}
                required
                className={inputClass}
              />
            </label>
            <div ref={widgetRef} />
            <div>
              <button
                type="submit"
                disabled={status === "busy"}
                className="rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground shadow-sm disabled:opacity-64"
              >
                Send message
              </button>
            </div>
            {status === "error" && (
              <p className="text-sm text-destructive-foreground">
                Something went wrong — check the verification and try again.
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
