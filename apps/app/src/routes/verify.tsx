import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { verifyLoginToken } from "~/server/auth.ts";

// magic link 落地页：loader 内消费 token，成功即跳转
export const Route = createFileRoute("/verify")({
  validateSearch: z.object({ token: z.string().optional() }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }) => {
    if (!deps.token) {
      throw redirect({ to: "/login" });
    }
    const result = await verifyLoginToken({ data: { token: deps.token } });
    if (result.ok) {
      throw redirect({ to: result.redirectTo });
    }
    return { error: result.error };
  },
  component: VerifyPage,
});

function VerifyPage() {
  const data = Route.useLoaderData();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Sign-in link</h1>
      <p className="text-muted-foreground">{data.error}</p>
      <a href="/login" className="text-primary underline-offset-4 hover:underline">
        Request a new code
      </a>
    </main>
  );
}
