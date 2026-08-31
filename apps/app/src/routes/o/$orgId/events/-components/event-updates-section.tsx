import { formatOrgDateTime } from "@everband/domain";
import { Button } from "@everband/ui/components/button";
import { Checkbox } from "@everband/ui/components/checkbox";
import { Field, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import { toastManager } from "@everband/ui/components/toast";
import {
  EnvelopeSimpleIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { FormDrawer } from "~/components/form-drawer.tsx";
import { RichTextEditor } from "~/components/rich-text-editor.tsx";
import { deleteAttachment, uploadUpdateAttachment } from "~/server/attachments.ts";
import {
  createEventUpdate,
  deleteEventUpdate,
  editEventUpdate,
  publishEventUpdate,
} from "~/server/event-updates.ts";
import { sendUpdateEmail } from "~/server/notify.ts";

export interface EventUpdateRow {
  id: string;
  title: string;
  body: string;
  status: "draft" | "published";
  publishedAt: number | null;
  lastEditedAt: number | null;
}

export interface UpdateAttachmentRow {
  id: string;
  ownerId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface EventUpdatesSectionProps {
  orgId: string;
  eventId: string;
  timezone: string;
  isStaff: boolean;
  updates: EventUpdateRow[];
  updateAttachments?: UpdateAttachmentRow[];
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function EventUpdatesSection({
  orgId,
  eventId,
  timezone,
  isStaff,
  updates,
  updateAttachments = [],
}: EventUpdatesSectionProps): React.ReactElement {
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<EventUpdateRow | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [alsoSend, setAlsoSend] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  function openCreate() {
    setEditing(undefined);
    setTitle("");
    setHtml("");
    setText("");
    setAlsoSend(false);
    setError(null);
    setIsDrawerOpen(true);
  }

  function openEdit(update: EventUpdateRow) {
    setEditing(update);
    setTitle(update.title);
    // 存量纯文本当作 html 文本回填，TipTap 会转成段落
    setHtml(update.body);
    setText(update.body.replace(/<[^>]+>/g, " ").trim());
    setAlsoSend(false);
    setError(null);
    setIsDrawerOpen(true);
  }

  function close() {
    setIsDrawerOpen(false);
  }

  async function handleSubmit(_formData: FormData) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    if (!html.trim() && !text.trim()) {
      setError("Message is required.");
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      if (editing) {
        const result = await editEventUpdate({
          data: {
            orgId,
            updateId: editing.id,
            title: trimmedTitle,
            body: text || html,
            bodyHtml: html,
          },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        await router.invalidate();
        toastManager.add({ title: "Update saved", type: "success" });
        close();
        return;
      }
      const result = await createEventUpdate({
        data: {
          orgId,
          eventId,
          title: trimmedTitle,
          body: text || html.replace(/<[^>]+>/g, " ").trim() || " ",
          bodyHtml: html,
          alsoSendEmail: alsoSend,
        },
      });
      // biome-ignore lint/suspicious/noExplicitAny: server fn 返回扩展字段
      const anyResult = result as any;
      if (!anyResult.ok) {
        setError(anyResult.error ?? "Failed to save update.");
        return;
      }
      await router.invalidate();
      if (anyResult.emailed) {
        toastManager.add({
          title: anyResult.deduplicated
            ? "Already emailed — no duplicate sent"
            : "Update published and email queued",
          type: "success",
        });
      } else {
        toastManager.add({
          title: anyResult.emailError
            ? `Update saved but email not sent: ${anyResult.emailError}`
            : "Update saved as draft",
          type: anyResult.emailError ? "info" : "success",
        });
      }
      close();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successMessage: string,
  ): Promise<boolean> {
    const result = await action();
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return false;
    }
    await router.invalidate();
    toastManager.add({ title: successMessage, type: "success" });
    return true;
  }

  async function handleSendEmail(updateId: string): Promise<boolean> {
    const result = await sendUpdateEmail({ data: { orgId, updateId } });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return false;
    }
    await router.invalidate();
    toastManager.add({
      title: result.deduplicated
        ? "This version was already emailed — no duplicate sent"
        : "Email queued. Check Notifications for delivery status.",
      type: "success",
    });
    return true;
  }

  async function handleFileChange(updateId: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingId(updateId);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await uploadUpdateAttachment({
        data: {
          orgId,
          updateId,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          dataBase64: toBase64(bytes),
        },
      });
      if (!result.ok) {
        toastManager.add({ title: result.error, type: "error" });
        return;
      }
      await router.invalidate();
      toastManager.add({ title: "File uploaded", type: "success" });
    } finally {
      setUploadingId(null);
      event.target.value = "";
    }
  }

  async function handleDeleteAttachment(attachmentId: string): Promise<boolean> {
    const result = await deleteAttachment({ data: { orgId, attachmentId } });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return false;
    }
    await router.invalidate();
    toastManager.add({ title: "File deleted", type: "success" });
    return true;
  }

  const attachmentsByUpdate = new Map<string, UpdateAttachmentRow[]>();
  for (const attachment of updateAttachments) {
    const list = attachmentsByUpdate.get(attachment.ownerId);
    if (list) list.push(attachment);
    else attachmentsByUpdate.set(attachment.ownerId, [attachment]);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-foreground text-xl">Updates</h2>
        {isStaff && (
          <Button onClick={openCreate} variant="outline">
            <PlusIcon />
            New update
          </Button>
        )}
      </div>

      {updates.length === 0 ? (
        <p className="text-muted-foreground">No updates yet.</p>
      ) : (
        <ul className="flex max-w-2xl flex-col gap-3">
          {updates.map((update) => {
            const files = attachmentsByUpdate.get(update.id) ?? [];
            return (
              <li
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm"
                key={update.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium text-foreground">{update.title}</h3>
                  {isStaff && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        aria-label={`Edit ${update.title}`}
                        onClick={() => openEdit(update)}
                        size="icon"
                        variant="ghost"
                      >
                        <PencilSimpleIcon />
                      </Button>
                      {update.status === "draft" ? (
                        <>
                          <ConfirmDialog
                            confirmLabel="Publish"
                            description="Families will be able to read this update. Publishing does not send email on its own."
                            onConfirm={() =>
                              run(
                                () => publishEventUpdate({ data: { orgId, updateId: update.id } }),
                                "Update published",
                              )
                            }
                            title={`Publish ${update.title}?`}
                            trigger={
                              <Button
                                aria-label={`Publish ${update.title}`}
                                size="icon"
                                variant="ghost"
                              >
                                <PaperPlaneTiltIcon />
                              </Button>
                            }
                          />
                          <ConfirmDialog
                            confirmLabel="Delete"
                            description="This draft update will be removed. This cannot be undone."
                            destructive
                            onConfirm={() =>
                              run(
                                () => deleteEventUpdate({ data: { orgId, updateId: update.id } }),
                                "Update deleted",
                              )
                            }
                            title={`Delete ${update.title}?`}
                            trigger={
                              <Button
                                aria-label={`Delete ${update.title}`}
                                size="icon"
                                variant="ghost"
                              >
                                <TrashIcon />
                              </Button>
                            }
                          />
                        </>
                      ) : (
                        <ConfirmDialog
                          confirmLabel="Send email"
                          description="Every family in the audience gets this update by email. Sending the same version twice is skipped automatically."
                          onConfirm={() => handleSendEmail(update.id)}
                          title={`Email ${update.title}?`}
                          trigger={
                            <Button
                              aria-label={`Email ${update.title}`}
                              size="icon"
                              variant="ghost"
                            >
                              <EnvelopeSimpleIcon />
                            </Button>
                          }
                        />
                      )}
                    </div>
                  )}
                </div>
                {/* 富文本正文：body 存 html，直接 prose 渲染；旧纯文本无标签也会正常显示 */}
                <div
                  className="prose prose-sm max-w-none text-foreground prose-headings:font-semibold prose-a:text-primary prose-a:underline prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:pl-3 prose-ul:list-disc prose-ol:list-decimal dark:prose-invert"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: 受控富文本，服务端未做额外 sanitize 但来源为 staff
                  dangerouslySetInnerHTML={{ __html: update.body }}
                />
                {/* 每条 Update 的附件（属于该邮件） */}
                {files.length > 0 && (
                  <ul className="flex flex-col gap-1 pt-1">
                    {files.map((file) => (
                      <li
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        key={file.id}
                      >
                        <a
                          className="truncate font-medium text-primary hover:underline"
                          href={`/api/orgs/${orgId}/attachments/${file.id}`}
                        >
                          {file.fileName}
                        </a>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-muted-foreground tabular-nums">
                            {(file.sizeBytes / 1024).toFixed(1)} KB
                          </span>
                          {isStaff && (
                            <ConfirmDialog
                              confirmLabel="Delete"
                              description="The file is removed from storage and the download link stops working."
                              destructive
                              onConfirm={() => handleDeleteAttachment(file.id)}
                              title={`Delete ${file.fileName}?`}
                              trigger={
                                <Button
                                  aria-label={`Delete ${file.fileName}`}
                                  size="icon"
                                  variant="ghost"
                                >
                                  <TrashIcon />
                                </Button>
                              }
                            />
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {isStaff && (
                  <label className="flex items-center gap-2 pt-1 text-sm">
                    <UploadSimpleIcon className="text-muted-foreground" />
                    <span className="font-medium text-foreground">
                      Attach file{uploadingId === update.id ? " …" : ""}
                    </span>
                    <input
                      className="text-foreground text-sm file:mr-2 file:rounded-md file:border file:border-input file:bg-popover file:px-2 file:py-1 file:text-xs"
                      disabled={uploadingId === update.id}
                      onChange={(e) => handleFileChange(update.id, e)}
                      type="file"
                    />
                  </label>
                )}
                <p className="text-muted-foreground text-xs">
                  {update.status === "published" && update.publishedAt
                    ? `Published ${formatOrgDateTime(update.publishedAt, timezone)}`
                    : "Draft"}
                  {update.lastEditedAt
                    ? ` · edited ${formatOrgDateTime(update.lastEditedAt, timezone)}`
                    : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <FormDrawer
        description={
          editing
            ? "Published updates stay visible to families. Editing one never re-sends its email."
            : "Create a rich update for this event. Check the box to also email the audience."
        }
        error={error}
        isBusy={isBusy}
        onOpenChange={setIsDrawerOpen}
        onSubmit={handleSubmit}
        open={isDrawerOpen}
        submitLabel={editing ? "Save changes" : alsoSend ? "Publish and email" : "Save draft"}
        title={editing ? "Edit update" : "New update"}
      >
        <Frame>
          <FramePanel>
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>Update</FrameTitle>
            </FrameHeader>
            <Field>
              <FieldLabel htmlFor="update-title">Title</FieldLabel>
              <Input
                id="update-title"
                name="title"
                onChange={(e) => setTitle(e.target.value)}
                required
                value={title}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="update-body">Message</FieldLabel>
              <RichTextEditor
                onChange={({ html: h, text: t }) => {
                  setHtml(h);
                  setText(t);
                }}
                placeholder="Write the update… Paste a Google Form link here if you need a form."
                value={html || editing?.body || ""}
              />
            </Field>
            {!editing && (
              <div className="flex items-center gap-2 pt-2">
                <Checkbox
                  checked={alsoSend}
                  id="also-send"
                  onCheckedChange={(v) => setAlsoSend(v === true)}
                />
                <label className="text-sm text-foreground" htmlFor="also-send">
                  also send email notification to the audience
                </label>
              </div>
            )}
          </FramePanel>
        </Frame>
      </FormDrawer>
    </section>
  );
}
