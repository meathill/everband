import { createFileRoute } from "@tanstack/react-router";
import { listDevOutbox } from "~/server/dev.ts";

// dev 专用发件箱：查看 magic link/OTP 邮件（生产模式 server fn 直接拒绝）
export const Route = createFileRoute("/dev/outbox")({
  loader: async () => ({ messages: await listDevOutbox() }),
  component: DevOutboxPage,
});

function DevOutboxPage() {
  const { messages } = Route.useLoaderData();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dev outbox</h1>
      {messages.length === 0 && <p className="text-muted-foreground">No emails yet.</p>}
      {messages.map((message) => (
        <article
          key={message.id}
          className="rounded-lg border border-border bg-card p-4 shadow-sm"
          data-kind={message.kind}
        >
          <p className="text-sm text-muted-foreground">
            To: {message.toEmail} · {new Date(message.createdAt).toLocaleString()} · {message.kind}
          </p>
          <h2 className="mt-1 font-medium text-foreground">{message.subject}</h2>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-sm text-foreground">
            {message.body}
          </pre>
        </article>
      ))}
    </main>
  );
}
