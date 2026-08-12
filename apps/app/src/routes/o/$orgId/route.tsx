import { Separator } from "@everband/ui/components/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@everband/ui/components/sidebar";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { OrgLayoutSkeleton } from "~/components/page-loaders.tsx";
import { getRouteAuthErrorCode } from "~/lib/route-auth-error.ts";
import { getUnreadNotificationCount } from "~/server/notify.ts";
import { getOrgContext, getSidebarOpen, listMyOrganizations } from "~/server/org.ts";
import { OrgSidebar } from "./-components/org-sidebar.tsx";

// 组织布局：进入即校验 membership（服务端），失败回登录页。
// 子路由通过 Route.useLoaderData 拿 org/role（字段名不可改，多个子路由依赖）。
export const Route = createFileRoute("/o/$orgId")({
  loader: async ({ params }) => {
    try {
      const [ctx, orgs, sidebarOpen, unreadCount] = await Promise.all([
        getOrgContext({ data: { orgId: params.orgId } }),
        listMyOrganizations(),
        getSidebarOpen(),
        getUnreadNotificationCount({ data: { orgId: params.orgId } }),
      ]);
      return { ...ctx, orgs, sidebarOpen, unreadCount };
    } catch (cause) {
      const authError = getRouteAuthErrorCode(cause);
      if (authError === "unauthenticated") throw redirect({ to: "/login" });
      if (authError === "forbidden") throw redirect({ to: "/select-org" });
      throw cause;
    }
  },
  component: OrgLayout,
  // 从 select-org/侧边栏切换组织时，布局 loader（4 个 server fn）需要几秒，先给整页骨架
  pendingComponent: OrgLayoutSkeleton,
});

function OrgLayout() {
  const { org, role, email, orgs, sidebarOpen, unreadCount } = Route.useLoaderData();

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <OrgSidebar org={org} role={role} email={email} orgs={orgs} unreadCount={unreadCount} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
          <Separator className="h-4" orientation="vertical" />
          <span className="truncate font-medium text-foreground text-sm">{org.name}</span>
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
