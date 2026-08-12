import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import type React from "react";
import { FormDrawer } from "~/components/form-drawer.tsx";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
import { createRehearsalSeries } from "~/server/rehearsals.ts";

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export interface SeriesFormOption {
  id: string;
  name: string;
}

export interface SeriesFormDrawerProps {
  orgId: string;
  terms: SeriesFormOption[];
  /** 预选的星期几（0=周日 … 6=周六），来自日历点击的日期 */
  defaultWeekday?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 原生 select 的统一外观（Base UI 的 Select 是受控组件，与非受控红线冲突）
const selectClassName =
  "h-9 rounded-md border border-input bg-popover px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/24 sm:h-8 sm:text-sm";

/** 新建每周排练。全部字段非受控（`name` + FormData 读值）。 */
export function SeriesFormDrawer({
  orgId,
  terms,
  defaultWeekday = 3,
  open,
  onOpenChange,
}: SeriesFormDrawerProps): React.ReactElement {
  const create = useServerFormAction({
    action: createRehearsalSeries,
    successMessage: "Weekly rehearsal created",
    onSuccess: () => onOpenChange(false),
  });

  async function handleSubmit(formData: FormData) {
    const location = String(formData.get("location") ?? "").trim();
    await create.submit({
      orgId,
      termId: String(formData.get("termId") ?? ""),
      weekday: Number(formData.get("weekday")),
      startTimeLocal: String(formData.get("startTime") ?? ""),
      endTimeLocal: String(formData.get("endTime") ?? ""),
      location: location || undefined,
      helpersNeeded: Number(formData.get("helpersNeeded")),
    });
  }

  return (
    <FormDrawer
      description="Rehearsals are generated for every matching week of the term, with helper duty rotated across families."
      error={create.error}
      isBusy={create.isBusy}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      open={open}
      submitLabel="Create rehearsals"
      title="New weekly rehearsal"
    >
      <Frame>
        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Schedule</FrameTitle>
          </FrameHeader>
          <Field>
            <FieldLabel htmlFor="series-term">Term</FieldLabel>
            <select className={selectClassName} id="series-term" name="termId" required>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
            <FieldDescription>Rehearsals only span the dates of this term.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="series-weekday">Weekday</FieldLabel>
            <select
              className={selectClassName}
              defaultValue={defaultWeekday}
              id="series-weekday"
              name="weekday"
            >
              {WEEKDAYS.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="series-start">Starts</FieldLabel>
            <Input defaultValue="17:30" id="series-start" name="startTime" required type="time" />
          </Field>
          <Field>
            <FieldLabel htmlFor="series-end">Ends</FieldLabel>
            <Input defaultValue="19:00" id="series-end" name="endTime" required type="time" />
          </Field>
        </FramePanel>

        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Details</FrameTitle>
          </FrameHeader>
          <Field>
            <FieldLabel htmlFor="series-location">Location</FieldLabel>
            <Input id="series-location" name="location" placeholder="School hall" />
          </Field>
          <Field>
            <FieldLabel htmlFor="series-helpers">Helpers needed</FieldLabel>
            <Input
              defaultValue={1}
              id="series-helpers"
              max={10}
              min={1}
              name="helpersNeeded"
              required
              type="number"
            />
          </Field>
        </FramePanel>
      </Frame>
    </FormDrawer>
  );
}
