import type { OverviewCalendarItem } from "@everband/core";
import { currentMonthInTimezone, toLocalDateString } from "@everband/domain";
import { Badge } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import { Calendar } from "@everband/ui/components/calendar";
import { Card } from "@everband/ui/components/card";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@everband/ui/components/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "@everband/ui/components/popover";
import { ScrollArea } from "@everband/ui/components/scroll-area";
import { Separator } from "@everband/ui/components/separator";
import {
  ToggleGroup,
  ToggleGroupItem,
  ToggleGroupSeparator,
} from "@everband/ui/components/toggle-group";
import { cn } from "@everband/ui/lib/utils";
import {
  CalendarBlankIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  MusicNotesIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { EventFormDrawer } from "../events/-components/event-form-drawer.tsx";
import {
  SeriesFormDrawer,
  type SeriesFormOption,
} from "../rehearsals/-components/series-form-drawer.tsx";

type CalendarKind = OverviewCalendarItem["kind"];
type QuickCreateKind = "event" | "rehearsal";

export interface OverviewMonthCalendarProps {
  items: OverviewCalendarItem[];
  month: string;
  orgId: string;
  timezone: string;
  /** staff/owner 才有快捷创建入口 */
  isStaff: boolean;
  /** 新建每周排练的 term 下拉数据；为空时菜单里的排练项禁用 */
  terms: SeriesFormOption[];
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
  isStaff,
  terms,
  onMonthChange,
}: OverviewMonthCalendarProps) {
  const [visibleKinds, setVisibleKinds] = useState<Set<CalendarKind>>(
    () => new Set(["event", "rehearsal"]),
  );
  const [selectedDate, setSelectedDate] = useState(`${month}-01`);
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [isEventOpen, setIsEventOpen] = useState(false);
  const [isSeriesOpen, setIsSeriesOpen] = useState(false);

  useEffect(() => {
    setSelectedDate(`${month}-01`);
  }, [month]);

  const days = useMemo(() => monthGrid(month), [month]);
  const filteredItems = items.filter((item) => visibleKinds.has(item.kind));
  const selectedItems = filteredItems.filter((item) => isItemOnDate(item, selectedDate, timezone));

  function toggleKinds(values: CalendarKind[]) {
    setVisibleKinds(new Set(values));
  }

  function openQuickCreate(kind: QuickCreateKind, date: string) {
    setCreateDate(date);
    if (kind === "event") setIsEventOpen(true);
    else setIsSeriesOpen(true);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
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
        {/* Base UI 的 group 里 pressed 由 item 的 value 决定，pressed prop 会被忽略，必须走受控 value */}
        <ToggleGroup
          aria-label="Calendar item types"
          onValueChange={(values) => toggleKinds(values as CalendarKind[])}
          value={[...visibleKinds]}
          variant="outline"
        >
          <ToggleGroupItem aria-label="Show events" value="event">
            <CalendarBlankIcon /> Events
          </ToggleGroupItem>
          <ToggleGroupSeparator />
          <ToggleGroupItem aria-label="Show rehearsals" value="rehearsal">
            <MusicNotesIcon /> Rehearsals
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="hidden md:block">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
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
                className="min-h-32 border-b border-r border-border p-2 last:border-r-0"
                data-date={value}
                key={value}
              >
                <DateQuickCreateMenu
                  date={value}
                  hasTerm={terms.length > 0}
                  isStaff={isStaff}
                  onQuickCreate={(kind) => openQuickCreate(kind, value)}
                  triggerClassName={isOutside ? "text-muted-foreground/60" : "text-foreground"}
                >
                  <time dateTime={value}>{date.getDate()}</time>
                </DateQuickCreateMenu>
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
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">{selectedDate}</h3>
              <DateQuickCreateMenu
                date={selectedDate}
                hasTerm={terms.length > 0}
                isStaff={isStaff}
                onQuickCreate={(kind) => openQuickCreate(kind, selectedDate)}
                triggerClassName="h-8 w-8 border border-border bg-background text-foreground hover:bg-accent"
              >
                <PlusIcon />
                <span className="sr-only">Create on {selectedDate}</span>
              </DateQuickCreateMenu>
            </div>
            {selectedItems.length === 0 ? (
              <p className="text-muted-foreground text-sm">No events or rehearsals.</p>
            ) : (
              selectedItems.map((item) => <CalendarItem item={item} key={item.id} orgId={orgId} />)
            )}
          </div>
        </ScrollArea>
      </div>

      {isStaff && (
        <>
          <EventFormDrawer
            defaultStartsAtLocal={createDate ? `${createDate}T09:00` : undefined}
            onOpenChange={setIsEventOpen}
            open={isEventOpen}
            orgId={orgId}
            timezone={timezone}
          />
          <SeriesFormDrawer
            defaultWeekday={createDate ? weekdayOf(createDate) : undefined}
            onOpenChange={setIsSeriesOpen}
            open={isSeriesOpen}
            orgId={orgId}
            terms={terms}
          />
        </>
      )}
    </Card>
  );
}

function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12).getDay();
}

/**
 * 日期格上的快捷创建菜单：staff/owner 点击日期数字弹出，可跳转活动或每周排练抽屉。
 * 非 staff 直接返回 null，不占任何交互位。
 */
function DateQuickCreateMenu({
  children,
  date,
  hasTerm,
  isStaff,
  onQuickCreate,
  triggerClassName,
}: {
  children: React.ReactNode;
  date: string;
  hasTerm: boolean;
  isStaff: boolean;
  onQuickCreate: (kind: QuickCreateKind) => void;
  triggerClassName?: string;
}): React.ReactElement | null {
  if (!isStaff) return null;
  return (
    <Menu>
      <MenuTrigger
        aria-label={`Create on ${date}`}
        className={cn(
          "inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent hover:bg-accent text-sm",
          triggerClassName,
        )}
      >
        {children}
      </MenuTrigger>
      <MenuPopup align="start" side="bottom">
        <MenuGroup>
          <MenuGroupLabel>{date}</MenuGroupLabel>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem onClick={() => onQuickCreate("event")}>
          <CalendarBlankIcon />
          New event
        </MenuItem>
        <MenuItem disabled={!hasTerm} onClick={() => onQuickCreate("rehearsal")}>
          <MusicNotesIcon />
          New weekly rehearsal
        </MenuItem>
      </MenuPopup>
    </Menu>
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
