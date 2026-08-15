import { formatOrgDateTime } from "@everband/domain";
import { Button } from "@everband/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@everband/ui/components/empty";
import { emailComposeSearchSchema } from "@everband/validation";
import { EnvelopeSimpleIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import type React from "react";
import { PageSkeleton } from "~/components/page-loaders.tsx";
import { getEmailComposeData, listEmailDrafts, listEmailSends } from "~/server/notify.ts";
import { EmailComposeView } from "./emails/-components/email-compose-view.tsx";
import { EmailSendsTable } from "./emails/-components/email-sends-table.tsx";

export const Route = createFileRoute("/o/$orgId/emails")({
  validateSearch: emailComposeSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const orgId = params.orgId;
    try {
      // 恢复草稿：收件人用保存时的快照，不再重新解析受众
      if (deps.draft) {
        const drafts = await listEmailDrafts({ data: { orgId } });
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
      const isCompose =
        Boolean(deps.compose) ||
        Boolean(deps.groups?.length) ||
        Boolean(deps.students?.length) ||
        Boolean(deps.event);
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
      // 邮件中心：草稿 + 发送历史
      const [drafts, sends] = await Promise.all([
        listEmailDrafts({ data: { orgId } }),
        listEmailSends({ data: { orgId } }),
      ]);
      return {
        view: "list" as const,
        compose: null,
        eventTitle: null,
        search: deps,
        draft: null,
        drafts,
        sends,
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
  const navigate = Route.useNavigate();

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

  const draft = data.drafts[0];

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
              navigate({
                to: "/o/$orgId/emails",
                params: { orgId },
                search: { draft: draft.id },
              })
            }
            type="button"
          >
            <EnvelopeSimpleIcon className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground">
                {draft.subject || "Untitled"}
              </span>
              <span className="block truncate text-sm text-muted-foreground">
                Saved {formatOrgDateTime(draft.updatedAt, org.timezone)} · {draft.recipients.length}{" "}
                recipient{draft.recipients.length === 1 ? "" : "s"}
              </span>
            </span>
          </button>
        </section>
      )}

      {data.sends.length === 0 && !draft ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyTitle>No emails yet</EmptyTitle>
            <EmptyDescription>
              Select groups or members and send the first message, or start writing from a draft.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <EmailSendsTable rows={data.sends} timezone={org.timezone} />
      )}
    </div>
  );
}
