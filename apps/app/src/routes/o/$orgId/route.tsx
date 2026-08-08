import { Button } from "@everband/ui/components/button";
import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { logout } from "~/server/auth.ts";
import { getOrgContext } from "~/server/org.ts";

// 组织布局：进入即校验 membership（服务端），失败回登录页。
// 子路由通过 Route.useLoaderData 拿 org/role。
export const Route = createFileRoute("/o/$orgId")({
  loader: async ({ params }) => {
    try {
      return await getOrgContext({ data: { orgId: params.orgId } });
    } catch {
      throw redirect({ to: "/login" });
    }
  },
  component: OrgLayout,
});

function OrgLayout() {
  const { org, role } = Route.useLoaderData();
  const navigate = useNavigate();
  const isStaff = role === "owner" || role === "staff";

  async function handleLogout() {
    await logout();
    await navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-6">
          <Link to="/o/$orgId" params={{ orgId: org.id }} className="font-semibold text-foreground">
            {org.name}
          </Link>
          {isStaff && (
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link
                to="/o/$orgId/settings"
                params={{ orgId: org.id }}
                className="hover:text-foreground"
              >
                Settings
              </Link>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {role}
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
