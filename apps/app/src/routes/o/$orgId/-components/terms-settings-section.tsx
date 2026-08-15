import { Button } from "@everband/ui/components/button";
import { DatePicker } from "@everband/ui/components/date-picker";
import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import { PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { DataTable, type DataTableColumn } from "~/components/data-table/data-table.tsx";
import { FormDrawer } from "~/components/form-drawer.tsx";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
import { createTerm, type listTerms } from "~/server/members.ts";
import { deleteTerm, updateTerm } from "~/server/terms.ts";

type TermRow = Awaited<ReturnType<typeof listTerms>>[number];

export function TermsSettingsSection({
  orgId,
  terms,
}: {
  orgId: string;
  terms: TermRow[];
}): React.ReactElement {
  const [editing, setEditing] = useState<TermRow | undefined>();
  const [isOpen, setIsOpen] = useState(false);
  const create = useServerFormAction({
    action: createTerm,
    successMessage: "Term created",
    onSuccess: closeDrawer,
  });
  const update = useServerFormAction({
    action: updateTerm,
    successMessage: "Term updated",
    onSuccess: closeDrawer,
  });
  const remove = useServerFormAction({ action: deleteTerm, successMessage: "Term deleted" });
  const active = editing ? update : create;

  function closeDrawer() {
    setIsOpen(false);
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) setEditing(undefined);
  }

  function openCreate() {
    setEditing(undefined);
    setIsOpen(true);
  }

  function openEdit(term: TermRow) {
    setEditing(term);
    setIsOpen(true);
  }

  async function handleSubmit(formData: FormData) {
    const input = {
      orgId,
      name: String(formData.get("name") ?? "").trim(),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
    };
    if (editing) {
      await update.submit({ ...input, termId: editing.id });
      return;
    }
    await create.submit(input);
  }

  const columns: DataTableColumn<TermRow>[] = [
    { header: "Name", key: "name", render: (row) => row.name },
    { className: "tabular-nums", header: "Starts", key: "start", render: (row) => row.startDate },
    { className: "tabular-nums", header: "Ends", key: "end", render: (row) => row.endDate },
    {
      className: "text-end",
      header: <span className="sr-only">Actions</span>,
      key: "actions",
      render: (row) => (
        <span className="inline-flex items-center gap-1">
          <Button
            aria-label={`Edit ${row.name}`}
            onClick={() => openEdit(row)}
            size="icon"
            variant="ghost"
          >
            <PencilSimpleIcon />
          </Button>
          <ConfirmDialog
            confirmLabel="Delete term"
            description="This is only allowed when no rehearsal series references the term."
            destructive
            onConfirm={() => remove.submit({ orgId, termId: row.id })}
            title={`Delete ${row.name}?`}
            trigger={
              <Button aria-label={`Delete ${row.name}`} size="icon" variant="ghost">
                <TrashIcon />
              </Button>
            }
          />
        </span>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground text-xl">School terms</h2>
          <p className="text-muted-foreground text-sm">
            Weekly rehearsals repeat inside these dates in the organization timezone.
          </p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon />
          Add term
        </Button>
      </div>

      <DataTable columns={columns} rowKey={(row) => row.id} rows={terms} />
      {remove.error && (
        <p className="text-destructive-foreground text-sm" role="alert">
          {remove.error}
        </p>
      )}

      <FormDrawer
        description="Dates are interpreted in the organization timezone."
        error={active.error}
        isBusy={active.isBusy}
        onOpenChange={handleOpenChange}
        onSubmit={handleSubmit}
        open={isOpen}
        submitLabel={editing ? "Save changes" : "Add term"}
        title={editing ? "Edit term" : "New term"}
      >
        <Frame>
          <FramePanel>
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>Term details</FrameTitle>
            </FrameHeader>
            <Field>
              <FieldLabel htmlFor="term-name">Name</FieldLabel>
              <Input autoFocus defaultValue={editing?.name} id="term-name" name="name" required />
            </Field>
          </FramePanel>
          <FramePanel>
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>Date range</FrameTitle>
            </FrameHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="term-start">Start</FieldLabel>
                <DatePicker
                  aria-label="Term start date"
                  defaultValue={editing?.startDate}
                  id="term-start"
                  name="startDate"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="term-end">End</FieldLabel>
                <DatePicker
                  aria-label="Term end date"
                  defaultValue={editing?.endDate}
                  id="term-end"
                  name="endDate"
                  required
                />
              </Field>
            </div>
            <FieldDescription className="mt-3">
              Changing dates does not rebuild rehearsal occurrences that already exist.
            </FieldDescription>
          </FramePanel>
        </Frame>
      </FormDrawer>
    </section>
  );
}
