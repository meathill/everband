import { createFileRoute } from "@tanstack/react-router";
import { getPublicPage } from "~/server/public.ts";

// 组织公开主页（PRD §6.6）：无需登录；只展示白名单字段。
// 关闭或不存在 → 统一"暂未开放"，不泄露组织是否存在。
export const Route = createFileRoute("/p/$publicSlug")({
  loader: async ({ params }) => {
    try {
      return { page: await getPublicPage({ data: { slug: params.publicSlug } }) };
    } catch {
      return { page: null };
    }
  },
  component: PublicPage,
});

function PublicPage() {
  const { page } = Route.useLoaderData();

  if (!page) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          This page isn't available
        </h1>
        <p className="text-muted-foreground">
          The page you're looking for is not open right now. If you followed a printed QR code,
          check back later or contact the organization directly.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {page.type === "band" ? "Community band" : "Community organization"}
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-foreground">{page.displayName}</h1>
      {page.summary && <p className="max-w-md text-lg text-muted-foreground">{page.summary}</p>}
      <p className="pt-4 text-sm text-muted-foreground">
        Members and parents sign in from their invitation email.
      </p>
    </main>
  );
}
