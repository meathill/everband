import type { OverviewCalendarItem } from "@everband/core";
import { currentMonthInTimezone, toLocalDateString } from "@everband/domain";
import { Badge } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import { Calendar } from "@everband/ui/components/calendar";
import { Card } from "@everband/ui/components/card";
import { Popover, PopoverPopup, PopoverTrigger } from "@everband/ui/components/popover";
import { ScrollArea } from "@everband/ui/components/scroll-area";
import { Separator } from "@everband/ui/components/separator";
import { ToggleGroup, ToggleGroupItem } from "@everband/ui/components/toggle-group";
import {
  CalendarBlankIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  MusicNotesIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

type CalendarKind = OverviewCalendarItem["kind"];

export interface OverviewMonthCalendarProps {
  items: OverviewCalendarItem[];
  month: string;
  orgId: string;
  timezone: string;
  onMonthChange: (month: string) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthDate(month: string): Date {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year ?? 0, (monthNumber ?? 1) - 1, 1, 12);
}

function localDate(date: string): Date {
  const [year, monthNumber, day] = date.split("-").map(Number);
  return new Date(year ?? 0, (monthNumber ?? 1) - 1, day ?? 1, 12);
}

function dateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftMonth(month: string, amount: number): string {
  const date = monthDate(month);
  date.setMonth(date.getMonth() + amount);
  return dateValue(date).slice(0, 7);
}

function monthGrid(month: string): Date[] {
  const first = monthDate(month);
  first.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return date;
  });
}

function itemEndDate(item: OverviewCalendarItem, timezone: string): string {
  return item.endsAtUtc ? toLocalDateString(item.endsAtUtc, timezone) : item.localDate;
}

function isItemOnDate(item: OverviewCalendarItem, date: string, timezone: string): boolean {
  return item.localDate <= date && itemEndDate(item, timezone) >= date;
}

function Chevron({ orientation }: { orientation?: "left" | "right" | "up" | "down" }) {
  if (orientation === "left") return <CaretLeftIcon />;
  if (orientation === "right") return <CaretRightIcon />;
  if (orientation === "up") return <CaretUpIcon />;
  return <CaretDownIcon />;
}

export function OverviewMonthCalendar({
  items,
  month,
  orgId,
  timezone,
  onMonthChange,
}: OverviewMonthCalendarProps) {
  const [visibleKinds, setVisibleKinds] = useState<Set<CalendarKind>>(
    () => new Set(["event", "rehearsal"]),
  );
  const [selectedDate, setSelectedDate] = useState(`${month}-01`);

  useEffect(() => {
    setSelectedDate(`${month}-01`);
  }, [month]);

  const days = useMemo(() => monthGrid(month), [month]);
  const filteredItems = items.filter((item) => visibleKinds.has(item.kind));
  const selectedItems = filteredItems.filter((item) => isItemOnDate(item, selectedDate, timezone));

  function toggleKind(kind: CalendarKind, isPressed: boolean) {
    setVisibleKinds((current) => {
      const next = new Set(current);
      if (isPressed) next.add(kind);
      else next.delete(kind);
      return next;
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-2">
          <Button
            aria-label="Previous month"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            size="icon"
            variant="outline"
          >
            <CaretLeftIcon />
          </Button>
          <Button
            onClick={() => onMonthChange(currentMonthInTimezone(Date.now(), timezone))}
            variant="outline"
          >
            Today
          </Button>
          <Button
            aria-label="Next month"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            size="icon"
            variant="outline"
          >
            <CaretRightIcon />
          </Button>
          <h2 className="ml-2 font-semibold text-lg">
            {new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).format(
              monthDate(month),
            )}
          </h2>
        </div>
        <ToggleGroup aria-label="Calendar item types">
          <ToggleGroupItem
            aria-label="Show events"
            onPressedChange={(pressed) => toggleKind("event", pressed)}
            pressed={visibleKinds.has("event")}
          >
            <CalendarBlankIcon /> Events
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Show rehearsals"
            onPressedChange={(pressed) => toggleKind("rehearsal", pressed)}
            pressed={visibleKinds.has("rehearsal")}
          >
            <MusicNotesIcon /> Rehearsals
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="hidden md:block">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WEEKDAYS.map((weekday) => (
            <div className="px-3 py-2 font-medium text-muted-foreground text-xs" key={weekday}>
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((date) => {
            const value = dateValue(date);
            const dayItems = filteredItems.filter((item) => isItemOnDate(item, value, timezone));
            const isOutside = value.slice(0, 7) !== month;
            return (
              <div
                className="min-h-32 border-b border-r p-2 last:border-r-0"
                data-date={value}
                key={value}
              >
                <time
                  className={isOutside ? "text-muted-foreground/60 text-xs" : "text-xs"}
                  dateTime={value}
                >
                  {date.getDate()}
                </time>
                <div className="mt-2 flex flex-col gap-1">
                  {dayItems.slice(0, 3).map((item) => (
                    <CalendarItem item={item} key={item.id} orgId={orgId} />
                  ))}
                  {dayItems.length > 3 && (
                    <Popover>
                      <PopoverTrigger className="rounded px-1.5 py-1 text-left text-muted-foreground text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                        +{dayItems.length - 3} more
                      </PopoverTrigger>
                      <PopoverPopup align="start" className="w-72">
                        <div className="flex flex-col gap-1">
                          {dayItems.slice(3).map((item) => (
                            <CalendarItem item={item} key={item.id} orgId={orgId} />
                          ))}
                        </div>
                      </PopoverPopup>
                    </Popover>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-0 md:hidden">
        <div className="flex justify-center p-3">
          <Calendar
            components={{ Chevron }}
            fixedWeeks
            mode="single"
            month={monthDate(month)}
            onMonthChange={(date) => onMonthChange(dateValue(date).slice(0, 7))}
            onSelect={(date) => date && setSelectedDate(dateValue(date))}
            selected={localDate(selectedDate)}
          />
        </div>
        <Separator />
        <ScrollArea className="h-64" scrollbarGutter>
          <div className="flex flex-col gap-2 p-4">
            <h3 className="font-medium text-sm">{selectedDate}</h3>
            {selectedItems.length === 0 ? (
              <p className="text-muted-foreground text-sm">No events or rehearsals.</p>
            ) : (
              selectedItems.map((item) => <CalendarItem item={item} key={item.id} orgId={orgId} />)
            )}
          </div>
        </ScrollArea>
      </div>
    </Card>
  );
}

function CalendarItem({
  item,
  orgId,
}: {
  item: OverviewCalendarItem;
  orgId: string;
}): React.ReactElement {
  const isMuted = item.status === "cancelled" || item.status === "completed";
  const link =
    item.kind === "event" ? (
      <Link params={{ eventId: item.id, orgId }} to="/o/$orgId/events/$eventId" />
    ) : (
      <Link params={{ orgId }} search={{ occurrenceId: item.id }} to="/o/$orgId/rehearsals" />
    );
  return (
    <Badge
      className={`h-auto min-h-6 w-full justify-start overflow-hidden px-1.5 py-1 text-left ${
        item.kind === "event"
          ? "bg-info/10 text-info-foreground"
          : "bg-warning/10 text-warning-foreground"
      } ${isMuted ? "opacity-60 line-through" : ""}`}
      render={link}
      variant="outline"
    >
      <span className="truncate">{item.title}</span>
      {item.status !== "published" && item.status !== "scheduled" && (
        <span className="ml-auto text-[0.625rem] uppercase">{item.status}</span>
      )}
    </Badge>
  );
}
