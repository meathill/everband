import { type EventStatus, formatOrgDateTime, hasStaffAccess } from "@everband/domain";
import { Badge } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import { toastManager } from "@everband/ui/components/toast";
import {
  CheckCircleIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  ProhibitIcon,
} from "@phosphor-icons/react";
import { createFileRoute, getRouteApi, redirect, useRouter } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { EventFormSection } from "~/components/event-form-section.tsx";
import { PageSkeleton } from "~/components/page-loaders.tsx";
import { getEventDetail, transitionEvent } from "~/server/events.ts";
import { getEventForm, listFormResults } from "~/server/forms.ts";
import { EventAttachmentsSection } from "./-components/event-attachments-section.tsx";
import { EventFormDrawer } from "./-components/event-form-drawer.tsx";
import { EventUpdatesSection } from "./-components/event-updates-section.tsx";

export const Route = createFileRoute("/o/$orgId/events/$eventId")({
  loader: async ({ params }) => {
    try {
      const input = { data: { eventId: params.eventId, orgId: params.orgId } };
      const [detail, formData] = await Promise.all([getEventDetail(input), getEventForm(input)]);
      const isStaff = hasStaffAccess(detail.role, detail.staffAccess);
      const results =
        isStaff && formData.form
          ? await listFormResults({ data: { formId: formData.form.id, orgId: params.orgId } })
          : [];
      return { ...detail, formData, results };
    } catch {
      throw redirect({ params: { orgId: params.orgId }, to: "/o/$orgId/events" });
    }
  },
  component: EventDetailPage,
  pendingComponent: PageSkeleton,
});

const orgRoute = getRouteApi("/o/$orgId");

function EventDetailPage(): React.ReactElement {
  const { event, updates, attachments, role, staffAccess, formData, results } =
    Route.useLoaderData();
  const { org } = orgRoute.useLoaderData();
  const { orgId } = Route.useParams();
  const isStaff = hasStaffAccess(role, staffAccess);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-semibold text-3xl text-foreground tracking-tight">{event.title}</h1>
          <Badge className="capitalize" variant="outline">
            {event.status}
          </Badge>
        </div>
        <p className="text-muted-foreground tabular-nums">
          {formatOrgDateTime(event.startsAtUtc, org.timezone)}
          {event.endsAtUtc ? ` → ${formatOrgDateTime(event.endsAtUtc, org.timezone)}` : ""}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        <p className="text-muted-foreground text-sm">
          Audience: {event.isOrgWide ? "whole organization" : "restricted legacy audience"}
        </p>
        {event.description && <p className="max-w-2xl text-foreground">{event.description}</p>}
        {isStaff && (
          <StatusActions
            eventId={event.id}
            onEdit={() => setIsDrawerOpen(true)}
            orgId={orgId}
            status={event.status}
            title={event.title}
          />
        )}
      </header>

      <EventUpdatesSection
        eventId={event.id}
        isStaff={isStaff}
        orgId={orgId}
        timezone={org.timezone}
        updates={updates}
      />
      <EventFormSection
        eventId={event.id}
        formData={formData}
        isStaff={isStaff}
        orgId={orgId}
        results={results}
        timezone={org.timezone}
      />
      <EventAttachmentsSection
        attachments={attachments}
        eventId={event.id}
        isStaff={isStaff}
        orgId={orgId}
      />

      {isStaff && (
        <EventFormDrawer
          event={{
            description: event.description,
            endsAtUtc: event.endsAtUtc,
            groupIds: [],
            id: event.id,
            isOrgWide: event.isOrgWide,
            location: event.location,
            startsAtUtc: event.startsAtUtc,
            status: event.status,
            title: event.title,
          }}
          onOpenChange={setIsDrawerOpen}
          open={isDrawerOpen}
          orgId={orgId}
          timezone={org.timezone}
        />
      )}
    </div>
  );
}

function StatusActions({
  eventId,
  orgId,
  status,
  title,
  onEdit,
}: {
  eventId: string;
  orgId: string;
  status: EventStatus;
  title: string;
  onEdit: () => void;
}): React.ReactElement {
  const router = useRouter();

  async function run(
    target: "published" | "cancelled" | "completed",
    successMessage: string,
  ): Promise<boolean> {
    const result = await transitionEvent({ data: { eventId, orgId, status: target } });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return false;
    }
    await router.invalidate();
    toastManager.add({ title: successMessage, type: "success" });
    return true;
  }

  const isEditable = status === "draft" || status === "published";

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {isEditable && (
        <Button onClick={onEdit} variant="outline">
          <PencilSimpleIcon />
          Edit
        </Button>
      )}
      {status === "draft" && (
        // 发布不可逆且立刻对家长可见，所以走二次确认
        <ConfirmDialog
          confirmLabel="Publish"
          description="Families in the audience will see this event right away. A published event cannot go back to draft."
          onConfirm={() => run("published", "Event published")}
          title={`Publish ${title}?`}
          trigger={
            <Button>
              <PaperPlaneTiltIcon />
              Publish
            </Button>
          }
        />
      )}
      {status === "published" && (
        <>
          <ConfirmDialog
            confirmLabel="Mark completed"
            description="Completed events stay visible in the history but can no longer change."
            onConfirm={() => run("completed", "Event completed")}
            title={`Mark ${title} as completed?`}
            trigger={
              <Button variant="outline">
                <CheckCircleIcon />
                Mark completed
              </Button>
            }
          />
          <ConfirmDialog
            confirmLabel="Cancel event"
            description="Families keep seeing the event, marked as cancelled. This cannot be undone."
            destructive
            onConfirm={() => run("cancelled", "Event cancelled")}
            title={`Cancel ${title}?`}
            trigger={
              <Button variant="destructive-outline">
                <ProhibitIcon />
                Cancel event
              </Button>
            }
          />
        </>
      )}
    </div>
  );
}
