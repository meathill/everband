import type { LedgerEntryRow } from "@everband/core";
import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from "@everband/ui/components/number-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import { Textarea } from "@everband/ui/components/textarea";
import type React from "react";
import { FormDrawer } from "~/components/form-drawer.tsx";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
import { createLedgerEntry, updateLedgerEntry } from "~/server/finance.ts";

export interface LedgerEntryFormDrawerProps {
  currencyCode: string;
  entry?: LedgerEntryRow;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  orgId: string;
}

export function LedgerEntryFormDrawer({
  currencyCode,
  entry,
  onOpenChange,
  open,
  orgId,
}: LedgerEntryFormDrawerProps): React.ReactElement {
  const isEdit = Boolean(entry);
  const create = useServerFormAction({
    action: createLedgerEntry,
    successMessage: "Ledger entry added",
    onSuccess: () => onOpenChange(false),
  });
  const update = useServerFormAction({
    action: updateLedgerEntry,
    successMessage: "Ledger entry updated",
    onSuccess: () => onOpenChange(false),
  });
  const active = isEdit ? update : create;

  async function handleSubmit(formData: FormData) {
    const amount = Number(formData.get("amount"));
    const input = {
      direction: String(formData.get("direction")) as "income" | "expense",
      amountMinor: Math.round(amount * 100),
      occurredOn: String(formData.get("occurredOn")),
      category: String(formData.get("category")),
      description: String(formData.get("description") ?? "").trim() || undefined,
    };
    if (entry) await update.submit({ orgId, entryId: entry.id, ...input });
    else await create.submit({ orgId, ...input });
  }

  return (
    <FormDrawer
      description="Use the smallest currency unit internally; the form shows normal currency values."
      error={active.error}
      isBusy={active.isBusy}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      open={open}
      submitLabel={isEdit ? "Save changes" : "Add entry"}
      title={isEdit ? "Edit ledger entry" : "New ledger entry"}
    >
      <Frame>
        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Entry details</FrameTitle>
          </FrameHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ledger-direction">Type</FieldLabel>
              <Select defaultValue={entry?.direction ?? "income"} name="direction">
                <SelectTrigger id="ledger-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ledger-date">Date</FieldLabel>
              <Input
                defaultValue={entry?.occurredOn ?? new Date().toISOString().slice(0, 10)}
                id="ledger-date"
                name="occurredOn"
                required
                type="date"
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="ledger-amount">Amount ({currencyCode})</FieldLabel>
            <NumberField
              defaultValue={entry ? entry.amountMinor / 100 : undefined}
              id="ledger-amount"
              min={0.01}
              name="amount"
              required
              step={0.01}
            >
              <NumberFieldGroup>
                <NumberFieldInput placeholder="0.00" />
              </NumberFieldGroup>
            </NumberField>
            <FieldDescription>
              Enter a positive amount; the type determines its effect.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="ledger-category">Category</FieldLabel>
            <Input defaultValue={entry?.category} id="ledger-category" name="category" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="ledger-description">Description</FieldLabel>
            <Textarea
              defaultValue={entry?.description ?? ""}
              id="ledger-description"
              name="description"
            />
          </Field>
        </FramePanel>
      </Frame>
    </FormDrawer>
  );
}
