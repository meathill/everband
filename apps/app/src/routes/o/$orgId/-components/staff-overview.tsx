import type { OverviewEventItem, StaffGroupItem } from "@everband/core";
import { formatOrgDateTimeMaybe } from "@everband/domain";
import { Badge } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import { Card, CardHeader, CardPanel, CardTitle } from "@everband/ui/components/card";
import { Checkbox } from "@everband/ui/components/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@everband/ui/components/empty";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";

export interface StaffOverviewProps {
  orgId: string;
  timezone: string;
  groups: StaffGroupItem[];
  wipEvents: OverviewEventItem[];
}

export function StaffOverview({
  orgId,
  timezone,
  groups,
  wipEvents,
}: StaffOverviewProps): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <GroupsPanel groups={groups} orgId={orgId} />
      </div>
      <div className="lg:col-span-2">
        <WipPanel events={wipEvents} orgId={orgId} timezone={timezone} />
      </div>
    </div>
  );
}

function GroupsPanel({
  groups,
  orgId,
}: {
  groups: StaffGroupItem[];
  orgId: string;
}): React.ReactElement {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  function toggle(groupId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedIds.size === groups.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(groups.map((g) => g.id)));
    }
  }

  const selectedCount = selectedIds.size;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Groups</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs tabular-nums">{groups.length} groups</span>
          {groups.length > 0 && (
            <>
              <Button onClick={handleSelectAll} size="sm" variant="ghost">
                {selectedCount === groups.length && groups.length > 0 ? "Clear" : "Select all"}
              </Button>
              <Button
                onClick={() => setSelectedIds(new Set())}
                size="sm"
                variant="ghost"
                disabled={selectedCount === 0}
              >
                Clear
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardPanel className="flex flex-col gap-3 pt-0">
        {groups.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle>No groups yet</EmptyTitle>
              <EmptyDescription>
                Groups organize students — create one to email families.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map((group) => (
              <li
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
                key={group.id}
              >
                <Checkbox
                  aria-label={`Select ${group.name}`}
                  checked={selectedIds.has(group.id)}
                  onCheckedChange={() => toggle(group.id)}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
                  {group.name}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button
          disabled={selectedCount === 0}
          onClick={() =>
            navigate({
              to: "/o/$orgId/emails",
              params: { orgId },
              search: { groups: [...selectedIds] },
            })
          }
          variant="outline"
          className="w-full"
        >
          <EnvelopeSimpleIcon />
          Email{selectedCount > 0 ? ` ${selectedCount} group${selectedCount > 1 ? "s" : ""}` : ""}
        </Button>
      </CardPanel>
    </Card>
  );
}

function WipPanel({
  events,
  orgId,
  timezone,
}: {
  events: OverviewEventItem[];
  orgId: string;
  timezone: string;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Work in Progress</CardTitle>
        <p className="text-muted-foreground text-xs">
          Draft and published events, ordered by date.
        </p>
      </CardHeader>
      <CardPanel className="pt-0">
        {events.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle>No events in progress</EmptyTitle>
              <EmptyDescription>Draft and published events will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:border-ring hover:bg-accent/40"
                  params={{ orgId, eventId: event.id }}
                  to="/o/$orgId/events/$eventId"
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {event.title}
                    </span>
                    <Badge
                      className="shrink-0 capitalize"
                      variant={event.status === "published" ? "default" : "secondary"}
                    >
                      {event.status}
                    </Badge>
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatOrgDateTimeMaybe(event.startsAtUtc, timezone, event.startsAtHasTime)}
                    {event.endsAtUtc
                      ? ` → ${formatOrgDateTimeMaybe(event.endsAtUtc, timezone, event.endsAtHasTime)}`
                      : ""}
                    {event.location ? ` · ${event.location}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardPanel>
    </Card>
  );
}
