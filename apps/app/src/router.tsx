import { createRouter, Link } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.ts";

// 与 /p/$publicSlug 降级页同风格的 404（issue #5）
function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        This page isn't available
      </h1>
      <p className="text-muted-foreground">
        The page you're looking for doesn't exist or may have moved. Check the address, or head back
        to the start.
      </p>
      <Link to="/" className="text-primary underline-offset-4 hover:underline">
        Back to home
      </Link>
    </main>
  );
}

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // 不用 defaultPendingComponent：它是 root Transitioner 的 Suspense fallback，
    // 水合瞬间会渲染并替换整棵 <html>，触发 React hydration mismatch（#418）。
    // 加载反馈改由各路由的 pendingComponent 提供（org 布局/子页面骨架 + 公开页 FullPageLoader）。
    defaultPendingMs: 150,
    // 水合后不立即重载：默认 staleTime 0 会让 SSR 数据一落地就过期，水合后立刻
    // re-fetch，有 pendingComponent 的路由会渲染 fallback 与 SSR HTML 不一致
    // （#418）。60s 内同参数重访复用缓存；搜索/翻页/提交走 invalidate，不受影响。
    defaultStaleTime: 60_000,
    defaultNotFoundComponent: NotFoundPage,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
