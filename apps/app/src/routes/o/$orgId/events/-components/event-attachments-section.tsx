import { Button } from "@everband/ui/components/button";
import { toastManager } from "@everband/ui/components/toast";
import { TrashIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { deleteAttachment, uploadEventAttachment } from "~/server/attachments.ts";

export interface AttachmentRow {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface EventAttachmentsSectionProps {
  orgId: string;
  eventId: string;
  isStaff: boolean;
  attachments: AttachmentRow[];
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function EventAttachmentsSection({
  orgId,
  eventId,
  isStaff,
  attachments,
}: EventAttachmentsSectionProps): React.ReactElement {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setIsBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await uploadEventAttachment({
        data: {
          contentType: file.type || "application/octet-stream",
          dataBase64: toBase64(bytes),
          eventId,
          fileName: file.name,
          orgId,
        },
      });
      if (!result.ok) {
        toastManager.add({ title: result.error, type: "error" });
        return;
      }
      await router.invalidate();
      toastManager.add({ title: "File uploaded", type: "success" });
    } finally {
      setIsBusy(false);
      event.target.value = "";
    }
  }

  async function handleDelete(attachmentId: string): Promise<boolean> {
    const result = await deleteAttachment({ data: { attachmentId, orgId } });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return false;
    }
    await router.invalidate();
    toastManager.add({ title: "File deleted", type: "success" });
    return true;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold text-foreground text-xl">Attachments</h2>
      {isStaff && (
        <label className="flex max-w-md flex-col gap-1.5" htmlFor="attachment-file">
          <span className="flex items-center gap-1.5 font-medium text-foreground text-sm">
            <UploadSimpleIcon />
            Upload file (max 5 MB){isBusy ? " …" : ""}
          </span>
          <input
            className="text-foreground text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-popover file:px-3 file:py-1.5 file:text-foreground file:text-sm"
            disabled={isBusy}
            id="attachment-file"
            onChange={handleFileChange}
            type="file"
          />
        </label>
      )}
      {attachments.length === 0 ? (
        <p className="text-muted-foreground">No attachments.</p>
      ) : (
        <ul className="flex max-w-2xl flex-col gap-2">
          {attachments.map((attachment) => (
            <li
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-sm"
              key={attachment.id}
            >
              <a
                className="truncate font-medium text-primary hover:underline"
                href={`/api/orgs/${orgId}/attachments/${attachment.id}`}
              >
                {attachment.fileName}
              </a>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-muted-foreground tabular-nums">
                  {(attachment.sizeBytes / 1024).toFixed(1)} KB
                </span>
                {isStaff && (
                  <ConfirmDialog
                    confirmLabel="Delete"
                    description="The file is removed from storage and the download link stops working."
                    destructive
                    onConfirm={() => handleDelete(attachment.id)}
                    title={`Delete ${attachment.fileName}?`}
                    trigger={
                      <Button
                        aria-label={`Delete ${attachment.fileName}`}
                        size="icon"
                        variant="ghost"
                      >
                        <TrashIcon />
                      </Button>
                    }
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
