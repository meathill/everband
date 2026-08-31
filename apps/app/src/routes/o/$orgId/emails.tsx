import { formatOrgDateTime } from "@everband/domain";
import { Button } from "@everband/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@everband/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import {
  type EmailSendsListQuery,
  emailComposeSearchSchema,
  emailSendsListSchema,
} from "@everband/validation";
import { EnvelopeSimpleIcon, PaperPlaneTiltIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { createFileRoute, getRouteApi, redirect, useRouter } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { DataTablePagination } from "~/components/data-table/data-table-pagination.tsx";
import { DataTableToolbar } from "~/components/data-table/data-table-toolbar.tsx";
import { useListSearch } from "~/components/data-table/use-list-search.ts";
import { PageSkeleton } from "~/components/page-loaders.tsx";
import { getEmailComposeData, listEmailDrafts, listEmailSendsPage } from "~/server/notify.ts";
import { EmailComposeView } from "./emails/-components/email-compose-view.tsx";
import { EmailSendDrawer } from "./emails/-components/email-send-drawer.tsx";
import { type EmailSendRow, EmailSendsTable } from "./emails/-components/email-sends-table.tsx";

const emailsSearchSchema = emailSendsListSchema.merge(emailComposeSearchSchema);

export const Route = createFileRoute("/o/$orgId/emails")({
  validateSearch: emailsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const orgId = params.orgId;
    try {
      // 角色判定：草稿接口只对 staff 开放，家长调用必然 forbidden
      // （比在 loader 里另发请求更省事；异常统一走外层 catch）
      let drafts: Awaited<ReturnType<typeof listEmailDrafts>> = [];
      let isStaff = true;
      try {
        drafts = await listEmailDrafts({ data: { orgId } });
      } catch {
        isStaff = false;
      }
      const isCompose =
        Boolean(deps.compose) ||
        Boolean(deps.groups?.length) ||
        Boolean(deps.students?.length) ||
        Boolean(deps.event);

      if (isStaff) {
        // 恢复草稿：收件人用保存时的快照，不再重新解析受众
        if (deps.draft) {
          const draft = drafts.find((candidate) => candidate.id === deps.draft);
          if (!draft) {
            throw redirect({ to: "/o/$orgId/emails", params: { orgId }, search: {} });
          }
          return {
            view: "compose" as const,
            compose: {
              recipients: draft.recipients,
              excludedByFormCount: 0,
              suppressedCount: 0,
            },
            eventTitle: null,
            search: deps,
            draft,
            drafts: [],
            sends: [],
          };
        }
        if (isCompose) {
          const compose = await getEmailComposeData({
            data: {
              orgId,
              groups: deps.groups,
              students: deps.students,
              event: deps.event,
              excludeForm: deps.excludeForm,
            },
          });
          return {
            view: "compose" as const,
            compose: {
              recipients: compose.recipients,
              excludedByFormCount: compose.excludedByFormCount,
              suppressedCount: compose.suppressedCount,
            },
            eventTitle: compose.eventTitle,
            search: deps,
            draft: null,
            drafts: [],
            sends: [],
          };
        }
      } else if (isCompose) {
        // 家长访问写信参数：没有写信能力，回列表（"发给我的邮件"）
        throw redirect({ to: "/o/$orgId/emails", params: { orgId }, search: {} });
      }

      // 邮件中心：staff 看草稿 + 分页发送历史；家长只看发给自己的
      const sendsPage = await listEmailSendsPage({
        data: {
          orgId,
          page: (deps.page as number) ?? 1,
          pageSize: (deps.pageSize as number) ?? 20,
          sort: (deps.sort as "createdAt" | "subject" | "status") ?? "createdAt",
          order: (deps.order as "asc" | "desc") ?? "desc",
          q: deps.q as string | undefined,
          status: deps.status as "queued" | "succeeded" | "partial" | "failed" | undefined,
          kind: deps.kind as "bulk" | "event-update" | undefined,
        },
      });
      return {
        view: "list" as const,
        compose: null,
        eventTitle: null,
        search: deps,
        draft: null,
        drafts,
        sendsPage,
        isStaff,
      };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId } });
    }
  },
  component: EmailsPage,
  pendingComponent: PageSkeleton,
});

const orgRoute = getRouteApi("/o/$orgId");

function EmailsPage(): React.ReactElement {
  const data = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const { org } = orgRoute.useLoaderData();

  if (data.view === "compose") {
    return (
      <EmailComposeView
        draft={data.draft}
        eventTitle={data.eventTitle}
        initialCounts={{
          excludedByFormCount: data.compose.excludedByFormCount,
          suppressedCount: data.compose.suppressedCount,
        }}
        initialRecipients={data.compose.recipients}
        orgId={orgId}
        search={data.search}
      />
    );
  }

  if (!data.isStaff) {
    return <MyEmailsView page={data.sendsPage} timezone={org.timezone} orgId={orgId} />;
  }

  const draft = data.drafts[0];

  return (
    <StaffEmailsView
      drafts={data.drafts}
      draft={draft}
      sendsPage={data.sendsPage}
      timezone={org.timezone}
      orgId={orgId}
      search={data.search as unknown as EmailSendsListQuery & Record<string, unknown>}
    />
  );
}

type StaffSearch = EmailSendsListQuery & {
  compose?: boolean;
  draft?: string;
  groups?: string[];
  students?: string[];
  event?: string;
  excludeForm?: boolean;
  kind?: string;
  status?: string;
};

function StaffEmailsView({
  drafts,
  draft,
  sendsPage,
  timezone,
  orgId,
  search,
}: {
  drafts: Awaited<ReturnType<typeof listEmailDrafts>>;
  draft: (typeof drafts)[number] | undefined;
  sendsPage: Awaited<ReturnType<typeof listEmailSendsPage>>;
  timezone: string;
  orgId: string;
  search: StaffSearch;
}): React.ReactElement {
  const navigate = Route.useNavigate();
  const router = useRouter();
  const list = useListSearch<StaffSearch>({
    search,
    onChange: (patch) =>
      navigate({ search: (prev: StaffSearch) => ({ ...prev, ...patch }), replace: true } as never),
  });
  const [selected, setSelected] = useState<EmailSendRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function openDrawer(row: EmailSendRow) {
    setSelected(row);
    setDrawerOpen(true);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-3xl text-foreground tracking-tight">Emails</h1>
          <p className="text-muted-foreground text-sm">
            Compose messages to families, and review delivery history.
          </p>
        </div>
        <Button
          onClick={() =>
            navigate({ to: "/o/$orgId/emails", params: { orgId }, search: { compose: true } })
          }
        >
          <PencilSimpleIcon />
          New email
        </Button>
      </header>

      {draft && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-xl text-foreground">Drafts</h2>
          <button
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-start shadow-sm transition-colors hover:border-ring"
            onClick={() =>
              navigate({ to: "/o/$orgId/emails", params: { orgId }, search: { draft: draft.id } })
            }
            type="button"
          >
            <EnvelopeSimpleIcon className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground">
                {draft.subject || "Untitled"}
              </span>
              <span className="block truncate text-sm text-muted-foreground">
                Saved {formatOrgDateTime(draft.updatedAt, timezone)} · {draft.recipients.length}{" "}
                recipient
                {draft.recipients.length === 1 ? "" : "s"}
              </span>
            </span>
          </button>
        </section>
      )}

      {sendsPage.items.length === 0 && !draft && !search.q && !search.status && !search.kind ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyTitle>No emails yet</EmptyTitle>
            <EmptyDescription>
              Select groups or members and send the first message, or start writing from a draft.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <DataTableToolbar
            defaultQuery={(search.q as string) ?? ""}
            onQueryChange={list.setQuery}
            searchPlaceholder="Search subject"
            onRefresh={() => router.invalidate()}
          >
            <Select
              onValueChange={(v) =>
                list.setFilter("status", (v === "all" ? undefined : v) as StaffSearch["status"])
              }
              value={(search.status as string) ?? "all"}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="queued">queued</SelectItem>
                <SelectItem value="succeeded">succeeded</SelectItem>
                <SelectItem value="partial">partial</SelectItem>
                <SelectItem value="failed">failed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              onValueChange={(v) =>
                list.setFilter("kind", (v === "all" ? undefined : v) as StaffSearch["kind"])
              }
              value={(search.kind as string) ?? "all"}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="bulk">bulk</SelectItem>
                <SelectItem value="event-update">event-update</SelectItem>
              </SelectContent>
            </Select>
          </DataTableToolbar>

          <EmailSendsTable
            rows={sendsPage.items}
            timezone={timezone}
            sort={search.sort as string}
            order={search.order as "asc" | "desc"}
            onSortChange={list.setSort}
            onRowClick={openDrawer}
          />
          <DataTablePagination
            page={sendsPage.page}
            pageSize={sendsPage.pageSize}
            total={sendsPage.total}
            onPageChange={list.setPage}
          />
          <EmailSendDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            orgId={orgId}
            send={selected}
            timezone={timezone}
            isStaff={true}
          />
        </>
      )}
    </div>
  );
}

// 家长视角：发给自己的邮件（收件人快照按邀请邮箱匹配），可点开抽屉看详情
function MyEmailsView({
  page,
  timezone,
  orgId,
}: {
  page: Awaited<ReturnType<typeof listEmailSendsPage>>;
  timezone: string;
  orgId: string;
}): React.ReactElement {
  const [selected, setSelected] = useState<EmailSendRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const search = Route.useSearch() as unknown as StaffSearch;
  const navigate = Route.useNavigate();
  const list = useListSearch<StaffSearch>({
    search,
    onChange: (patch) =>
      navigate({ search: (prev: StaffSearch) => ({ ...prev, ...patch }), replace: true } as never),
  });

  return (
    <div className="flex w-full flex-col gap-6">
      <header>
        <h1 className="font-semibold text-3xl text-foreground tracking-tight">Emails</h1>
        <p className="text-muted-foreground text-sm">Messages sent to your household.</p>
      </header>

      {page.items.length === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyTitle>No emails yet</EmptyTitle>
            <EmptyDescription>Emails the band sends to you will show up here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <DataTableToolbar
            defaultQuery={search.q}
            onQueryChange={list.setQuery}
            searchPlaceholder="Search subject"
          />
          <ul className="flex w-full flex-col gap-2">
            {page.items.map((row) => (
              <button
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-start text-sm shadow-sm hover:border-ring"
                key={row.id}
                onClick={() => {
                  setSelected(row);
                  setDrawerOpen(true);
                }}
                type="button"
              >
                <PaperPlaneTiltIcon className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">{row.subject}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatOrgDateTime(row.createdAt, timezone)}
                </span>
              </button>
            ))}
          </ul>
          <DataTablePagination
            page={page.page}
            pageSize={page.pageSize}
            total={page.total}
            onPageChange={list.setPage}
          />
          <EmailSendDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            orgId={orgId}
            send={selected}
            timezone={timezone}
            isStaff={false}
          />
        </>
      )}
    </div>
  );
}
