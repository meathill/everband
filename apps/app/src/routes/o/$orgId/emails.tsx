import type { AudienceContact } from "@everband/core";
import { Button } from "@everband/ui/components/button";
import { Checkbox } from "@everband/ui/components/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@everband/ui/components/empty";
import { Field, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import { toastManager } from "@everband/ui/components/toast";
import { emailComposeSearchSchema } from "@everband/validation";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { PageSkeleton } from "~/components/page-loaders.tsx";
import { RichTextEditor } from "~/components/rich-text-editor.tsx";
import { getEmailComposeData, sendBulkEmail } from "~/server/notify.ts";

export const Route = createFileRoute("/o/$orgId/emails")({
  validateSearch: emailComposeSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    try {
      const data = await getEmailComposeData({ data: { orgId: params.orgId, ...deps } });
      return { compose: data, search: deps };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: EmailsPage,
  pendingComponent: PageSkeleton,
});

function EmailsPage(): React.ReactElement {
  const { compose, search } = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const navigate = Route.useNavigate();
  const router = useRouter();

  const recipients = compose.recipients;
  // 选中的收件人 email 集合；默认全选，用户可取消勾选（催办场景去掉已 RSVP 的人）
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelected(new Set(recipients.map((recipient) => recipient.email)));
  }, [recipients]);

  const [subject, setSubject] = useState("");
  const [cc, setCc] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRecipients = useMemo(
    () => recipients.filter((recipient) => selected.has(recipient.email)),
    [recipients, selected],
  );

  const sourceLabel = useMemo(() => {
    if (search.event) {
      return compose.eventTitle ? `Audience of ${compose.eventTitle}` : "Event audience";
    }
    const parts: string[] = [];
    if (search.students?.length) {
      parts.push(
        `${search.students.length} selected student${search.students.length > 1 ? "s" : ""}`,
      );
    }
    if (search.groups?.length) {
      parts.push(`${search.groups.length} group${search.groups.length > 1 ? "s" : ""}`);
    }
    return parts.join(" · ") || "Organization";
  }, [compose.eventTitle, search]);

  function toggleRecipient(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
  }

  async function handleSend(): Promise<boolean> {
    if (!subject.trim()) {
      setError("Subject is required.");
      return false;
    }
    if (!html.trim() && !text.trim()) {
      setError("Message body is required.");
      return false;
    }
    setError(null);
    setIsBusy(true);
    try {
      const result = await sendBulkEmail({
        data: {
          orgId,
          subject,
          cc: cc.trim() || undefined,
          html,
          text,
          groups: search.groups,
          students: search.students,
          event: search.event,
          excludeForm: search.excludeForm,
          recipients: selectedRecipients,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      if (result.deduplicated) {
        toastManager.add({
          title: "This message was already sent to the same recipients — no duplicate sent.",
          type: "info",
        });
      } else {
        toastManager.add({
          title: `Email queued for ${result.queuedCount} recipient${result.queuedCount === 1 ? "" : "s"}. Check Settings → Email delivery for status.`,
          type: "success",
        });
        await router.invalidate();
      }
      return true;
    } catch {
      setError("Something went wrong. Try again.");
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  const isFiltered = recipients.length < compose.recipients.length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-3xl text-foreground tracking-tight">Email</h1>
        <p className="text-muted-foreground text-sm">To: {sourceLabel}</p>
      </header>

      <section className="flex flex-col gap-3">
        <Frame>
          <FrameHeader>
            <FrameTitle>Message</FrameTitle>
          </FrameHeader>
          <FramePanel className="flex flex-col gap-2">
            <Field className="gap-2">
              <FieldLabel htmlFor="email-subject">Subject</FieldLabel>
              <Input
                id="email-subject"
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject"
                value={subject}
              />
            </Field>
            <Field className="gap-2">
              <FieldLabel htmlFor="email-cc">CC</FieldLabel>
              <Input
                id="email-cc"
                onChange={(event) => setCc(event.target.value)}
                placeholder="e.g. organiser@yourband.org (optional)"
                type="email"
                value={cc}
              />
            </Field>
            <Field className="gap-2">
              <FieldLabel htmlFor="email-body">Body</FieldLabel>
              <RichTextEditor
                onChange={({ html: h, text: t }) => {
                  setHtml(h);
                  setText(t);
                }}
                value={html}
              />
            </Field>
          </FramePanel>
        </Frame>
      </section>

      <section className="flex flex-col gap-3">
        <Frame>
          <FrameHeader>
            <FrameTitle>Recipients</FrameTitle>
          </FrameHeader>
          <FramePanel className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {search.event && (
                <span className="flex items-center gap-2 text-foreground">
                  <Checkbox
                    aria-label="Exclude families who already submitted the event form"
                    checked={search.excludeForm ?? false}
                    onCheckedChange={(checked: boolean) =>
                      navigate({
                        replace: true,
                        search: (prev) => ({ ...prev, excludeForm: checked }),
                      })
                    }
                  />
                  Exclude families who already submitted the event form (RSVP)
                </span>
              )}
              <span className="text-muted-foreground tabular-nums">
                {selectedRecipients.length} of {recipients.length} selected
              </span>
              {recipients.length > 0 && (
                <span className="flex gap-1">
                  <Button
                    onClick={() => setSelected(new Set(recipients.map((r) => r.email)))}
                    size="sm"
                    variant="ghost"
                  >
                    Select all
                  </Button>
                  <Button onClick={() => setSelected(new Set())} size="sm" variant="ghost">
                    Clear
                  </Button>
                </span>
              )}
              {compose.excludedByFormCount > 0 && (
                <span className="text-muted-foreground">
                  {compose.excludedByFormCount} already submitted the form
                </span>
              )}
              {compose.suppressedCount > 0 && (
                <span className="text-muted-foreground">
                  {compose.suppressedCount} opted out of email
                </span>
              )}
            </div>

            {recipients.length === 0 ? (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyTitle>
                    {compose.excludedByFormCount > 0 || compose.suppressedCount > 0
                      ? "No sendable recipients"
                      : "No recipients in this audience"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {isFiltered
                      ? "Everyone in the audience was excluded by form submission or email preference."
                      : "Add students to the selected groups, or pick an event with an audience."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex max-w-3xl flex-col gap-1">
                {recipients.map((recipient) => (
                  <RecipientRow
                    key={recipient.email}
                    onToggle={() => toggleRecipient(recipient.email)}
                    recipient={recipient}
                    selected={selected.has(recipient.email)}
                  />
                ))}
              </ul>
            )}
          </FramePanel>
        </Frame>
      </section>

      <section className="flex items-center gap-3">
        <ConfirmDialog
          confirmLabel="Send email"
          description={`This will send to ${selectedRecipients.length} recipient${selectedRecipients.length === 1 ? "" : "s"}. Sending the same message to the same recipients twice is skipped automatically.`}
          onConfirm={handleSend}
          title="Send this email?"
          trigger={
            <Button disabled={selectedRecipients.length === 0} loading={isBusy}>
              <PaperPlaneTiltIcon />
              Send email
            </Button>
          }
        />
        {error && (
          <p className="text-destructive-foreground text-sm" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function RecipientRow({
  recipient,
  selected,
  onToggle,
}: {
  recipient: AudienceContact;
  selected: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm">
      <Checkbox
        aria-label={`Include ${recipient.name}`}
        checked={selected}
        onCheckedChange={onToggle}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{recipient.name}</span>
        <span className="block truncate text-muted-foreground">{recipient.email}</span>
      </span>
    </li>
  );
}
