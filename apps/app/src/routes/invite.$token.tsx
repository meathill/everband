import { createFileRoute, redirect } from "@tanstack/react-router";
import { verifyLoginToken } from "~/server/auth.ts";

// 邀请链接：与 magic link 同一消费路径（purpose=invite 会激活 membership）
export const Route = createFileRoute("/invite/$token")({
  loader: async ({ params }) => {
    const result = await verifyLoginToken({ data: { token: params.token } });
    if (result.ok) {
      throw redirect({ to: result.redirectTo });
    }
    return { error: result.error };
  },
  component: InvitePage,
});

function InvitePage() {
  const data = Route.useLoaderData();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Invitation</h1>
      <p className="text-muted-foreground">{data.error}</p>
      <p className="text-sm text-muted-foreground">
        Ask the person who invited you to send a new invitation.
      </p>
    </main>
  );
}
