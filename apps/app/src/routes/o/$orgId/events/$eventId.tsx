import { Button } from "@everband/ui/components/button";
import { Input } from "@everband/ui/components/input";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { uploadEventAttachment } from "~/server/attachments.ts";
import {
  createEventUpdate,
  getEventDetail,
  publishEventUpdate,
  transitionEvent,
} from "~/server/events.ts";

export const Route = createFileRoute("/o/$orgId/events/$eventId")({
  loader: async ({ params }) => {
    try {
      return await getEventDetail({ data: { orgId: params.orgId, eventId: params.eventId } });
    } catch {
      throw redirect({ to: "/o/$orgId/events", params: { orgId: params.orgId } });
    }
  },
  component: EventDetailPage,
});

function EventDetailPage() {
  const { event, groups, updates, attachments, role } = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const router = useRouter();
  const isStaff = role === "owner" || role === "staff";
  const [message, setMessage] = useState<string | null>(null);

  async function handleTransition(status: "published" | "cancelled" | "completed") {
    setMessage(null);
    const result = await transitionEvent({ data: { orgId, eventId: event.id, status } });
    if (!result.ok) {
      setMessage(result.error);
    }
    await router.invalidate();
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{event.title}</h1>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {event.status}
          </span>
        </div>
        <p className="text-muted-foreground num">
          {new Date(event.startsAtUtc).toLocaleString()}
          {event.endsAtUtc ? ` → ${new Date(event.endsAtUtc).toLocaleString()}` : ""}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          Audience:{" "}
          {event.isOrgWide
            ? "whole organization"
            : groups.map((group) => group.name).join(", ") || "no groups"}
        </p>
        {event.description && <p className="max-w-2xl text-foreground">{event.description}</p>}
        {isStaff && (
          <div className="flex gap-2 pt-2">
            {event.status === "draft" && (
              <Button onClick={() => handleTransition("published")}>Publish</Button>
            )}
            {event.status === "published" && (
              <>
                <Button variant="outline" onClick={() => handleTransition("completed")}>
                  Mark completed
                </Button>
                <Button variant="destructive-outline" onClick={() => handleTransition("cancelled")}>
                  Cancel event
                </Button>
              </>
            )}
          </div>
        )}
        {message && <p className="text-sm text-destructive-foreground">{message}</p>}
      </header>

      <UpdatesSection updates={updates} isStaff={isStaff} eventId={event.id} />
      <AttachmentsSection attachments={attachments} isStaff={isStaff} eventId={event.id} />
    </div>
  );
}

type Detail = Awaited<ReturnType<typeof getEventDetail>>;

function UpdatesSection({
  updates,
  isStaff,
  eventId,
}: {
  updates: Detail["updates"];
  isStaff: boolean;
  eventId: string;
}) {
  const { orgId } = Route.useParams();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await createEventUpdate({
        data: {
          orgId,
          eventId,
          title: String(form.get("title")),
          body: String(form.get("body")),
        },
      });
      setIsOpen(false);
      await router.invalidate();
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePublish(updateId: string) {
    await publishEventUpdate({ data: { orgId, updateId } });
    await router.invalidate();
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Updates</h2>
        {isStaff && !isOpen && (
          <Button variant="outline" onClick={() => setIsOpen(true)}>
            New update
          </Button>
        )}
      </div>

      {isOpen && (
        <form
          onSubmit={handleCreate}
          className="flex max-w-2xl flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <label className="flex flex-col gap-1.5" htmlFor="update-title">
            <span className="text-sm font-medium text-foreground">Title</span>
            <Input id="update-title" name="title" required />
          </label>
          <label className="flex flex-col gap-1.5" htmlFor="update-body">
            <span className="text-sm font-medium text-foreground">Message</span>
            <textarea
              id="update-body"
              name="body"
              rows={4}
              required
              className="rounded-md border border-input bg-popover px-3 py-2 text-base text-foreground sm:text-sm"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" loading={isBusy}>
              Save draft
            </Button>
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {updates.length === 0 ? (
        <p className="text-muted-foreground">No updates yet.</p>
      ) : (
        <ul className="flex max-w-2xl flex-col gap-3">
          {updates.map((update) => (
            <li
              key={update.id}
              className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-foreground">{update.title}</h3>
                {isStaff && update.status === "draft" && (
                  <Button size="xs" onClick={() => handlePublish(update.id)}>
                    Publish
                  </Button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">{update.body}</p>
              <p className="text-xs text-muted-foreground">
                {update.status === "published" && update.publishedAt
                  ? `Published ${new Date(update.publishedAt).toLocaleString()}`
                  : "Draft"}
                {update.lastEditedAt
                  ? ` · edited ${new Date(update.lastEditedAt).toLocaleString()}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AttachmentsSection({
  attachments,
  isStaff,
  eventId,
}: {
  attachments: Detail["attachments"];
  isStaff: boolean;
  eventId: string;
}) {
  const { orgId } = Route.useParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setError(null);
    setIsBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      const result = await uploadEventAttachment({
        data: {
          orgId,
          eventId,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          dataBase64: btoa(binary),
        },
      });
      if (!result.ok) {
        setError(result.error);
      }
      await router.invalidate();
    } finally {
      setIsBusy(false);
      event.target.value = "";
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-foreground">Attachments</h2>
      {isStaff && (
        <label className="flex max-w-md flex-col gap-1.5" htmlFor="attachment-file">
          <span className="text-sm font-medium text-foreground">
            Upload file (max 5 MB) {isBusy && "…"}
          </span>
          <input
            id="attachment-file"
            type="file"
            onChange={handleFileChange}
            className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-popover file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          />
        </label>
      )}
      {error && <p className="text-sm text-destructive-foreground">{error}</p>}
      {attachments.length === 0 ? (
        <p className="text-muted-foreground">No attachments.</p>
      ) : (
        <ul className="flex max-w-2xl flex-col gap-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-sm"
            >
              <a
                href={`/api/orgs/${orgId}/attachments/${attachment.id}`}
                className="font-medium text-primary hover:underline"
              >
                {attachment.fileName}
              </a>
              <span className="text-muted-foreground num">
                {attachment.contentType} · {(attachment.sizeBytes / 1024).toFixed(1)} KB
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
