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
    defaultNotFoundComponent: NotFoundPage,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
