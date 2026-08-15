"use client";

import { cn } from "@everband/ui/lib/utils";
import { CalendarBlankIcon } from "@phosphor-icons/react";
import type React from "react";
import { useState } from "react";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group";
import { Popover, PopoverPopup, PopoverTrigger } from "./popover";

export interface DatePickerProps {
  /** 表单提交字段名；不传则只有日历按钮（纯展示场景） */
  name?: string;
  /** 初始日期（YYYY-MM-DD） */
  defaultValue?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  placeholder?: string;
  /** 日历按钮与输入框共用的可访问名 */
  "aria-label"?: string;
  className?: string;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): Date | undefined {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return undefined;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 日期选择器：日历弹层（Popover + Calendar）+ 可手输的 YYYY-MM-DD 输入框。
 * 组合模式来自 coss/ui 的 date-picker（With Input + Close on Select）。
 *
 * 输入框就是表单值的真实来源（`name` 直接进 FormData），日历与输入双向同步；
 * 组件内部用 state 持有值，初始值来自 `defaultValue`，配合表单的非受控约定。
 */
export function DatePicker({
  name,
  defaultValue,
  disabled = false,
  required = false,
  id,
  placeholder,
  "aria-label": ariaLabel = "Select date",
  className,
}: DatePickerProps): React.ReactElement {
  const [value, setValue] = useState(defaultValue ?? "");
  const [selected, setSelected] = useState<Date | undefined>(() =>
    defaultValue ? parseDate(defaultValue) : undefined,
  );
  const [month, setMonth] = useState<Date>(() => selected ?? new Date());
  const [open, setOpen] = useState(false);

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    setValue(next);
    const parsed = parseDate(next);
    setSelected(parsed);
    if (parsed) {
      setMonth(parsed);
    }
  }

  function handleSelect(date: Date | undefined): void {
    setSelected(date);
    if (date) {
      setValue(formatDate(date));
      setMonth(date);
    }
    setOpen(false);
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <InputGroup className={className}>
        <InputGroupInput
          aria-label={ariaLabel}
          className="*:[input]:[&::-webkit-calendar-picker-indicator]:hidden *:[input]:[&::-webkit-calendar-picker-indicator]:appearance-none"
          disabled={disabled}
          id={id}
          name={name}
          onChange={handleInputChange}
          placeholder={placeholder}
          required={required}
          type="date"
          value={value}
        />
        <InputGroupAddon align="inline-end">
          <PopoverTrigger
            aria-label={ariaLabel}
            disabled={disabled}
            render={<Button aria-label={ariaLabel} size="icon-xs" variant="ghost" />}
          >
            <CalendarBlankIcon aria-hidden="true" />
          </PopoverTrigger>
        </InputGroupAddon>
      </InputGroup>
      <PopoverPopup align="start" alignOffset={-4} sideOffset={8}>
        <Calendar
          mode="single"
          month={month}
          onMonthChange={setMonth}
          onSelect={handleSelect}
          selected={selected}
        />
      </PopoverPopup>
    </Popover>
  );
}
