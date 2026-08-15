import type { AudienceContact, EmailDraftRow } from "@everband/core";
import { Button } from "@everband/ui/components/button";
import { Checkbox } from "@everband/ui/components/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@everband/ui/components/empty";
import { Field, FieldLabel } from "@everband/ui/components/field";
import { Input } from "@everband/ui/components/input";
import { toastManager } from "@everband/ui/components/toast";
import type { EmailComposeSearch } from "@everband/validation";
import { ArrowLeftIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { RichTextEditor } from "~/components/rich-text-editor.tsx";
import { getEmailComposeData, saveEmailDraft, sendBulkEmail } from "~/server/notify.ts";

export interface EmailComposeViewProps {
  orgId: string;
  /** 初始收件人（loader 解析结果或草稿快照） */
  initialRecipients: AudienceContact[];
  initialCounts: { excludedByFormCount: number; suppressedCount: number };
  eventTitle: string | null | undefined;
  search: EmailComposeSearch;
  /** 恢复中的草稿；null 表示新邮件 */
  draft: EmailDraftRow | null;
}

type SaveState = "idle" | "saving" | "saved";

/**
 * 群发写信视图：Subject + CC + 富文本正文 + 收件人多选。
 * 内容变化后 debounce 自动保存草稿（每成员一条），未保存（dirty）时离开会询问。
 */
export function EmailComposeView({
  orgId,
  initialRecipients,
  initialCounts,
  eventTitle,
  search,
  draft,
}: EmailComposeViewProps): React.ReactElement {
  const navigate = useNavigate();
  const router = useRouter();

  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [cc, setCc] = useState(draft?.cc ?? "");
  const [html, setHtml] = useState(draft?.html ?? "");
  const [text, setText] = useState(draft?.text ?? "");
  const [recipients, setRecipients] = useState<AudienceContact[]>(initialRecipients);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialRecipients.map((recipient) => recipient.email)),
  );
  const [selection, setSelection] = useState({
    groups: search.groups,
    students: search.students,
    event: search.event,
    excludeForm: search.excludeForm,
  });
  const [counts, setCounts] = useState(initialCounts);
  const [saveState, setSaveState] = useState<SaveState>(draft ? "saved" : "idle");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRecipients = useMemo(
    () => recipients.filter((recipient) => selected.has(recipient.email)),
    [recipients, selected],
  );

  // dirty 判定：当前内容 key 与最后成功保存的快照不一致（收件人变化也算）
  const currentKey = JSON.stringify([subject, cc, html, text, [...selected].sort()]);
  const savedKeyRef = useRef(currentKey);
  const isDirty = savedKeyRef.current !== currentKey;

  const persistDraft = useCallback(async () => {
    const result = await saveEmailDraft({
      data: {
        orgId,
        subject,
        cc,
        html,
        text,
        recipients: selectedRecipients,
        selection,
      },
    });
    if (!result.ok) {
      return;
    }
    savedKeyRef.current = currentKey;
    // 草稿已变化：邮件中心列表的 loader 缓存（staleTime 60s）需要失效
    await router.invalidate();
  }, [cc, currentKey, html, orgId, router, selectedRecipients, selection, subject, text]);

  // debounce 自动保存：输入停止 1s 后静默落库；有任何内容（含收件人）就保存，
  // 纯空白页面不落草稿
  const hasContent = Boolean(subject || cc || html || text || selectedRecipients.length > 0);
  useEffect(() => {
    if (!isDirty || !hasContent) {
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(() => {
      persistDraft()
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("idle"));
    }, 1000);
    return () => clearTimeout(timer);
  }, [hasContent, isDirty, persistDraft]);

  // 离开拦截：刷新/关闭走 beforeunload；站内链接点击走捕获阶段 confirm
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function handleClick(event: MouseEvent) {
      const anchor = (event.target as Element).closest("a[href]");
      if (!anchor) {
        return;
      }
      const href = (anchor as HTMLAnchorElement).getAttribute("href") ?? "";
      if (/^(https?:)?\/\//.test(href)) {
        return;
      }
      if (!window.confirm("You have unsaved changes to this email. Leave anyway?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [isDirty]);

  // RSVP 排除开关：重新解析受众（已提交表单的人从列表消失）
  const toggleExcludeForm = useCallback(async () => {
    const nextSelection = { ...selection, excludeForm: !selection.excludeForm };
    setSelection(nextSelection);
    setError(null);
    try {
      const data = await getEmailComposeData({
        data: {
          orgId,
          groups: nextSelection.groups,
          students: nextSelection.students,
          event: nextSelection.event,
          excludeForm: nextSelection.excludeForm,
        },
      });
      setRecipients(data.recipients);
      setCounts({
        excludedByFormCount: data.excludedByFormCount,
        suppressedCount: data.suppressedCount,
      });
      setSelected(new Set(data.recipients.map((recipient) => recipient.email)));
    } catch {
      setError("Failed to reload recipients. Try again.");
    }
  }, [orgId, selection]);

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

  function goBack() {
    navigate({ to: "/o/$orgId/emails", params: { orgId }, search: {} });
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
    if (selectedRecipients.length === 0) {
      setError("Select at least one recipient.");
      return false;
    }
    setError(null);
    setIsSending(true);
    try {
      const result = await sendBulkEmail({
        data: {
          orgId,
          subject,
          cc: cc.trim() || undefined,
          html,
          text,
          groups: selection.groups,
          students: selection.students,
          event: selection.event,
          excludeForm: selection.excludeForm,
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
        await router.invalidate();
        goBack();
        return true;
      }
      toastManager.add({
        title: `Email queued for ${result.queuedCount} recipient${result.queuedCount === 1 ? "" : "s"}. Check Emails for delivery status.`,
        type: "success",
      });
      await router.invalidate();
      goBack();
      return true;
    } catch {
      setError("Something went wrong. Try again.");
      return false;
    } finally {
      setIsSending(false);
    }
  }

  const sourceLabel = useMemo(() => {
    if (selection.event) {
      return eventTitle ? `Audience of ${eventTitle}` : "Event audience";
    }
    const parts: string[] = [];
    if (selection.students?.length) {
      parts.push(
        `${selection.students.length} selected student${selection.students.length > 1 ? "s" : ""}`,
      );
    }
    if (selection.groups?.length) {
      parts.push(`${selection.groups.length} group${selection.groups.length > 1 ? "s" : ""}`);
    }
    return parts.join(" · ") || "Organization";
  }, [eventTitle, selection]);

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-3xl text-foreground tracking-tight">Email</h1>
          <p className="text-muted-foreground text-sm">
            To: {sourceLabel}
            {draft ? " · draft" : ""}
          </p>
        </div>
        <span className="flex items-center gap-3">
          <span aria-live="polite" className="text-muted-foreground text-xs tabular-nums">
            {saveState === "saving"
              ? "Saving draft…"
              : saveState === "saved" && isDirty
                ? "Saving draft…"
                : saveState === "saved"
                  ? "Draft saved"
                  : ""}
          </span>
          <Button onClick={goBack} variant="ghost">
            <ArrowLeftIcon />
            All emails
          </Button>
        </span>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-xs/5">
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
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-xs/5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <h2 className="font-semibold text-foreground">Recipients</h2>
          {selection.event && (
            <span className="flex items-center gap-2 text-foreground">
              <Checkbox
                aria-label="Exclude families who already submitted the event form"
                checked={selection.excludeForm ?? false}
                onCheckedChange={toggleExcludeForm}
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
          {counts.excludedByFormCount > 0 && (
            <span className="text-muted-foreground">
              {counts.excludedByFormCount} already submitted the form
            </span>
          )}
          {counts.suppressedCount > 0 && (
            <span className="text-muted-foreground">
              {counts.suppressedCount} opted out of email
            </span>
          )}
        </div>

        {recipients.length === 0 ? (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyTitle>
                {counts.excludedByFormCount > 0 || counts.suppressedCount > 0
                  ? "No sendable recipients"
                  : "No recipients in this audience"}
              </EmptyTitle>
              <EmptyDescription>
                {counts.excludedByFormCount > 0 || counts.suppressedCount > 0
                  ? "Everyone in the audience was excluded by form submission or email preference."
                  : "Add students to the selected groups, or pick an event with an audience."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-1">
            {recipients.map((recipient) => (
              <li
                className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-1.5 text-sm shadow-sm"
                key={recipient.email}
              >
                <Checkbox
                  aria-label={`Include ${recipient.name}`}
                  checked={selected.has(recipient.email)}
                  onCheckedChange={() => toggleRecipient(recipient.email)}
                />
                <span className="truncate font-medium text-foreground">{recipient.name}</span>
                <span className="truncate text-muted-foreground">{recipient.email}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex items-center gap-3">
        <ConfirmDialog
          confirmLabel="Send email"
          description={`This will send to ${selectedRecipients.length} recipient${selectedRecipients.length === 1 ? "" : "s"}. Sending the same message to the same recipients twice is skipped automatically.`}
          onConfirm={handleSend}
          title="Send this email?"
          trigger={
            <Button disabled={selectedRecipients.length === 0} loading={isSending}>
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
