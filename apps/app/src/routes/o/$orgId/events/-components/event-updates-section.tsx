import { formatOrgDateTime } from "@everband/domain";
import { Button } from "@everband/ui/components/button";
import { Checkbox } from "@everband/ui/components/checkbox";
import { Input } from "@everband/ui/components/input";
import { toastManager } from "@everband/ui/components/toast";
import {
  EnvelopeSimpleIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
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
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [alsoSend, setAlsoSend] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const attachmentsByUpdate = new Map<string, UpdateAttachmentRow[]>();
  for (const attachment of updateAttachments) {
    const list = attachmentsByUpdate.get(attachment.ownerId);
    if (list) list.push(attachment);
    else attachmentsByUpdate.set(attachment.ownerId, [attachment]);
  }

  function startCreate() {
    setEditingId(null);
    setTitle("");
    setHtml("");
    setText("");
    setAlsoSend(false);
    setError(null);
    setIsCreating(true);
  }

  function cancelCreate() {
    setIsCreating(false);
    setError(null);
  }

  function startEdit(update: EventUpdateRow) {
    setIsCreating(false);
    setEditingId(update.id);
    setTitle(update.title);
    setHtml(update.body);
    setText(update.body.replace(/<[^>]+>/g, " ").trim());
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function handleCreate() {
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
      // biome-ignore lint/suspicious/noExplicitAny: server fn returns extra fields
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
      setIsCreating(false);
      setTitle("");
      setHtml("");
      setText("");
      setAlsoSend(false);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleEdit(updateId: string) {
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
      const result = await editEventUpdate({
        data: { orgId, updateId, title: trimmedTitle, body: text || html, bodyHtml: html },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await router.invalidate();
      toastManager.add({ title: "Update saved", type: "success" });
      setEditingId(null);
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

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-foreground text-xl">Updates</h2>
        {isStaff && !isCreating && (
          <Button onClick={startCreate} variant="outline">
            <PlusIcon />
            New update
          </Button>
        )}
      </div>

      {isStaff && isCreating && (
        <div className="flex w-full max-w-3xl flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">New update</h3>
            <Button aria-label="Close" onClick={cancelCreate} size="icon" variant="ghost">
              <XIcon />
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="font-medium text-foreground text-sm" htmlFor="new-update-title">
                Title
              </label>
              <Input
                id="new-update-title"
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Update title"
                value={title}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-medium text-foreground text-sm">Message</span>
              <RichTextEditor
                key="new-update-editor"
                onChange={({ html: h, text: t }) => {
                  setHtml(h);
                  setText(t);
                }}
                placeholder="Write the update… Paste a Google Form link here if you need a form."
                value={html}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                checked={alsoSend}
                id="also-send"
                onCheckedChange={(v) => setAlsoSend(v === true)}
              />
              <label className="text-foreground text-sm" htmlFor="also-send">
                also send email notification to the audience
              </label>
            </div>
            {error && (
              <p className="text-destructive-foreground text-sm" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button loading={isBusy} onClick={handleCreate}>
                {alsoSend ? "Publish and email" : "Save draft"}
              </Button>
              <Button disabled={isBusy} onClick={cancelCreate} variant="outline">
                Cancel
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Draft updates are only visible to staff until published.
            </p>
          </div>
        </div>
      )}

      {updates.length === 0 && !isCreating ? (
        <p className="text-muted-foreground">No updates yet.</p>
      ) : (
        <ul className="flex w-full max-w-3xl flex-col gap-3">
          {updates.map((update) => {
            const files = attachmentsByUpdate.get(update.id) ?? [];
            const isEditing = editingId === update.id;

            if (isEditing) {
              return (
                <li
                  className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm"
                  key={update.id}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label
                        className="font-medium text-foreground text-sm"
                        htmlFor={`edit-title-${update.id}`}
                      >
                        Title
                      </label>
                      <Input
                        id={`edit-title-${update.id}`}
                        onChange={(e) => setTitle(e.target.value)}
                        value={title}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="font-medium text-foreground text-sm">Message</span>
                      <RichTextEditor
                        key={`edit-${update.id}`}
                        onChange={({ html: h, text: t }) => {
                          setHtml(h);
                          setText(t);
                        }}
                        value={html}
                      />
                    </div>
                    {error && (
                      <p className="text-destructive-foreground text-sm" role="alert">
                        {error}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button loading={isBusy} onClick={() => handleEdit(update.id)}>
                        Save changes
                      </Button>
                      <Button disabled={isBusy} onClick={cancelEdit} variant="outline">
                        Cancel
                      </Button>
                    </div>
                  </div>
                </li>
              );
            }

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
                        onClick={() => startEdit(update)}
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
                <div
                  className="prose prose-sm max-w-none text-foreground prose-headings:font-semibold prose-a:text-primary prose-a:underline prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:pl-3 prose-ul:list-disc prose-ol:list-decimal dark:prose-invert"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: 受控富文本，来源为 staff
                  dangerouslySetInnerHTML={{ __html: update.body }}
                />
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
    </section>
  );
}
