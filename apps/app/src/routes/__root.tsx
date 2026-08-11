import { ToastProvider } from "@everband/ui/components/toast";
import appCss from "@everband/ui/styles/globals.css?url";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Everband" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "256x256" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* ToastProvider 自带 viewport（Toasts），全站共用 toastManager。
            top-center：默认 bottom-right 会盖住右侧 FormDrawer 的底部操作区。 */}
        <ToastProvider position="top-center">{children}</ToastProvider>
        <Scripts />
      </body>
    </html>
  );
}
