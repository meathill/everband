import { formatOrgDateTime } from "@everband/domain";
import { Button } from "@everband/ui/components/button";
import { Field, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import { Textarea } from "@everband/ui/components/textarea";
import { toastManager } from "@everband/ui/components/toast";
import {
  EnvelopeSimpleIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { FormDrawer } from "~/components/form-drawer.tsx";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
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

export interface EventUpdatesSectionProps {
  orgId: string;
  eventId: string;
  timezone: string;
  isStaff: boolean;
  updates: EventUpdateRow[];
}

export function EventUpdatesSection({
  orgId,
  eventId,
  timezone,
  isStaff,
  updates,
}: EventUpdatesSectionProps): React.ReactElement {
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<EventUpdateRow | undefined>(undefined);

  function close() {
    setIsDrawerOpen(false);
  }

  const create = useServerFormAction({
    action: createEventUpdate,
    onSuccess: close,
    successMessage: "Update saved as draft",
  });
  const edit = useServerFormAction({
    action: editEventUpdate,
    onSuccess: close,
    successMessage: "Update saved",
  });
  const active = editing ? edit : create;

  async function handleSubmit(formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    if (editing) {
      await edit.submit({ body, orgId, title, updateId: editing.id });
      return;
    }
    await create.submit({ body, eventId, orgId, title });
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

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-foreground text-xl">Updates</h2>
        {isStaff && (
          <Button
            onClick={() => {
              setEditing(undefined);
              setIsDrawerOpen(true);
            }}
            variant="outline"
          >
            <PlusIcon />
            New update
          </Button>
        )}
      </div>

      {updates.length === 0 ? (
        <p className="text-muted-foreground">No updates yet.</p>
      ) : (
        <ul className="flex max-w-2xl flex-col gap-3">
          {updates.map((update) => (
            <li
              className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 shadow-sm"
              key={update.id}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-foreground">{update.title}</h3>
                {isStaff && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      aria-label={`Edit ${update.title}`}
                      onClick={() => {
                        setEditing(update);
                        setIsDrawerOpen(true);
                      }}
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
                          <Button aria-label={`Email ${update.title}`} size="icon" variant="ghost">
                            <EnvelopeSimpleIcon />
                          </Button>
                        }
                      />
                    )}
                  </div>
                )}
              </div>
              <p className="whitespace-pre-wrap text-foreground text-sm">{update.body}</p>
              <p className="text-muted-foreground text-xs">
                {update.status === "published" && update.publishedAt
                  ? `Published ${formatOrgDateTime(update.publishedAt, timezone)}`
                  : "Draft"}
                {update.lastEditedAt
                  ? ` · edited ${formatOrgDateTime(update.lastEditedAt, timezone)}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      <FormDrawer
        description="Published updates stay visible to families. Editing one never re-sends its email."
        error={active.error}
        isBusy={active.isBusy}
        onOpenChange={setIsDrawerOpen}
        onSubmit={handleSubmit}
        open={isDrawerOpen}
        submitLabel={editing ? "Save changes" : "Save draft"}
        title={editing ? "Edit update" : "New update"}
      >
        <Frame>
          <FramePanel>
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>Update</FrameTitle>
            </FrameHeader>
            <Field>
              <FieldLabel htmlFor="update-title">Title</FieldLabel>
              <Input defaultValue={editing?.title} id="update-title" name="title" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="update-body">Message</FieldLabel>
              <Textarea
                defaultValue={editing?.body}
                id="update-body"
                name="body"
                required
                rows={6}
              />
            </Field>
          </FramePanel>
        </Frame>
      </FormDrawer>
    </section>
  );
}
