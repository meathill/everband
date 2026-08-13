import { Skeleton } from "@everband/ui/components/skeleton";
import { Spinner } from "@everband/ui/components/spinner";
import type React from "react";

// 页面跳转的加载反馈。原则：骨架屏优先（org 系路由），spinner 兜底（其余路由）。
// 仅对"页面级切换"生效：search 变化（翻页/筛选/搜索）走 background reload，不触发 pending UI。

/** 全局兜底：任何路由 pending 且未配置专属骨架屏时显示（login/verify/invite/select-org 等） */
export function FullPageLoader(): React.ReactElement {
  return (
    <main
      aria-busy="true"
      className="flex min-h-screen flex-col items-center justify-center gap-3 px-4"
      role="status"
    >
      <Spinner className="size-6 text-muted-foreground" />
      <p className="text-muted-foreground text-sm">Loading…</p>
    </main>
  );
}

/** org 内容区通用骨架：标题两行 + 卡片/表格区块，供 org 布局内各子页面复用 */
export function PageSkeleton(): React.ReactElement {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="hidden h-24 w-full rounded-lg sm:block" />
        <Skeleton className="hidden h-24 w-full rounded-lg xl:block" />
      </div>
    </div>
  );
}

/** /o/$orgId 布局骨架：侧边栏 + 顶栏 + 内容区，首次进入组织（布局 loader 未完成）时显示 */
export function OrgLayoutSkeleton(): React.ReactElement {
  return (
    <div aria-busy="true" className="flex h-screen w-full overflow-hidden">
      <aside className="hidden w-(--sidebar-width) shrink-0 flex-col gap-4 border-r border-border bg-sidebar p-3 md:flex">
        <div className="flex items-center gap-2 rounded-md p-2">
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <div className="flex flex-col gap-2 px-2">
          {["overview", "events", "rehearsals", "members", "equipment", "finance"].map((key) => (
            <Skeleton key={key} className="h-8 w-full rounded-md" />
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2 px-2">
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <Skeleton className="size-4 shrink-0 rounded-sm" />
          <Skeleton className="h-4 w-px" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
          <PageSkeleton />
        </div>
      </div>
    </div>
  );
}
