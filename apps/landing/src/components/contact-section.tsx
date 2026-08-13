import { type FormEvent, useState } from "react";

// 反馈表单（contact us）：直接提交到 app-feedback（feedback.meathill.com）的公开 API。
// appId 标识来源站点；contact 合并 "Name <email>"，content 为用户消息正文。
// 跨域由对方 API 的 CORS 头（Access-Control-Allow-Origin: *）放行。
const FEEDBACK_API_URL = "https://feedback.meathill.com/api/feedbacks";
const FEEDBACK_APP_ID = "everband-landing";

export function ContactSection({ appUrl }: { appUrl: string }) {
  const [status, setStatus] = useState<"idle" | "busy" | "sent" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("busy");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name"));
    const email = String(form.get("email"));
    const message = String(form.get("message"));
    try {
      const response = await fetch(FEEDBACK_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: FEEDBACK_APP_ID,
          content: message,
          contact: `${name} <${email}>`,
        }),
      });
      setStatus(response.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  const inputClass =
    "rounded-md border border-input bg-background px-3 py-2 text-base text-foreground sm:text-sm";

  return (
    <div className="flex w-full flex-col gap-6">
      <p className="text-muted-foreground">
        Have a question or feedback? We read every message. Ready to try it?{" "}
        <a href={`${appUrl}/new-org`} className="text-primary underline-offset-4 hover:underline">
          Get started
        </a>{" "}
        in minutes.
      </p>

      {status === "sent" ? (
        <p className="text-foreground">Thanks — we've received your message.</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5" htmlFor="contact-name">
              <span className="text-sm font-medium text-foreground">Name</span>
              <input id="contact-name" name="name" required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5" htmlFor="contact-email">
              <span className="text-sm font-medium text-foreground">Email</span>
              <input id="contact-email" name="email" type="email" required className={inputClass} />
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
              Something went wrong — please try again in a moment.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
