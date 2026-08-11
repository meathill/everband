import { Separator } from "@everband/ui/components/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@everband/ui/components/sidebar";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getOrgContext, getSidebarOpen, listMyOrganizations } from "~/server/org.ts";
import { OrgSidebar } from "./-components/org-sidebar.tsx";

// 组织布局：进入即校验 membership（服务端），失败回登录页。
// 子路由通过 Route.useLoaderData 拿 org/role（字段名不可改，多个子路由依赖）。
export const Route = createFileRoute("/o/$orgId")({
  loader: async ({ params }) => {
    try {
      const [ctx, orgs, sidebarOpen] = await Promise.all([
        getOrgContext({ data: { orgId: params.orgId } }),
        listMyOrganizations(),
        getSidebarOpen(),
      ]);
      return { ...ctx, orgs, sidebarOpen };
    } catch {
      throw redirect({ to: "/login" });
    }
  },
  component: OrgLayout,
});

function OrgLayout() {
  const { org, role, email, orgs, sidebarOpen } = Route.useLoaderData();

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <OrgSidebar org={org} role={role} email={email} orgs={orgs} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
          <Separator className="h-4" orientation="vertical" />
          <span className="truncate font-medium text-foreground text-sm">{org.name}</span>
        </header>
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
