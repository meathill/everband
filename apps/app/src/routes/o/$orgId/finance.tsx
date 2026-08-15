import type { LedgerEntryRow } from "@everband/core";
import { Badge } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import { Card, CardPanel } from "@everband/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import type { LedgerDirectionFilter, LedgerStatusFilter } from "@everband/validation";
import {
  LEDGER_DIRECTION_FILTERS,
  LEDGER_STATUS_FILTERS,
  ledgerEntriesListSchema,
} from "@everband/validation";
import { PencilSimpleIcon, PlusIcon, ProhibitIcon } from "@phosphor-icons/react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { DataTable, type DataTableColumn } from "~/components/data-table/data-table.tsx";
import { DataTablePagination } from "~/components/data-table/data-table-pagination.tsx";
import { DataTableToolbar } from "~/components/data-table/data-table-toolbar.tsx";
import { useListSearch } from "~/components/data-table/use-list-search.ts";
import { PageSkeleton } from "~/components/page-loaders.tsx";
import { listLedgerEntries, voidLedgerEntry } from "~/server/finance.ts";
import { LedgerEntryFormDrawer } from "./-components/ledger-entry-form-drawer.tsx";

export const Route = createFileRoute("/o/$orgId/finance")({
  validateSearch: ledgerEntriesListSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    try {
      return await listLedgerEntries({ data: { orgId: params.orgId, ...deps } });
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: FinancePage,
  pendingComponent: PageSkeleton,
});

const DIRECTION_LABELS: Record<LedgerDirectionFilter, string> = {
  all: "All types",
  expense: "Expenses",
  income: "Income",
};
const STATUS_LABELS: Record<LedgerStatusFilter, string> = {
  all: "All records",
  posted: "Posted",
  voided: "Voided",
};

function formatCurrency(valueMinor: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-AU", { currency: currencyCode, style: "currency" }).format(
    valueMinor / 100,
  );
}

function FinancePage() {
  const { list, summary, currencyCode, month } = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const listSearch = useListSearch({
    search,
    onChange: (patch) =>
      navigate({ replace: true, search: (current) => ({ ...current, ...patch }) }),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerEntryRow | undefined>();

  function openCreate() {
    setEditing(undefined);
    setOpen(true);
  }

  function openEdit(entry: LedgerEntryRow) {
    setEditing(entry);
    setOpen(true);
  }

  async function voidEntry(entryId: string): Promise<boolean> {
    const result = await voidLedgerEntry({ data: { entryId, orgId } });
    if (!result.ok) return false;
    await router.invalidate();
    return true;
  }

  const columns: DataTableColumn<LedgerEntryRow>[] = [
    {
      key: "occurredOn",
      header: "Date",
      sortable: true,
      defaultOrder: "desc",
      render: (row) => row.occurredOn,
    },
    {
      key: "category",
      header: "Category",
      render: (row) => (
        <div>
          <p className="font-medium">{row.category}</p>
          {row.description && (
            <p className="max-w-64 truncate text-muted-foreground text-xs">{row.description}</p>
          )}
        </div>
      ),
    },
    {
      key: "direction",
      header: "Type",
      render: (row) => (
        <Badge variant={row.direction === "income" ? "success" : "warning"}>{row.direction}</Badge>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      sortable: true,
      className: "text-right tabular-nums",
      render: (row) => (
        <span
          className={
            row.status === "voided"
              ? "text-muted-foreground line-through"
              : row.direction === "income"
                ? "text-success-foreground"
                : "text-foreground"
          }
        >
          {row.direction === "income" ? "+" : "−"}
          {formatCurrency(row.amountMinor, currencyCode)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={row.status === "posted" ? "outline" : "secondary"}>{row.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "w-0",
      render: (row) =>
        row.status === "posted" ? (
          <div className="flex justify-end gap-1">
            <Button
              aria-label="Edit entry"
              onClick={() => openEdit(row)}
              size="icon-sm"
              variant="ghost"
            >
              <PencilSimpleIcon />
            </Button>
            <ConfirmDialog
              confirmLabel="Void entry"
              description="The record stays in the audit trail and no longer affects totals."
              destructive
              onConfirm={() => voidEntry(row.id)}
              title="Void this ledger entry?"
              trigger={
                <Button aria-label="Void entry" size="icon-sm" variant="ghost">
                  <ProhibitIcon />
                </Button>
              }
            />
          </div>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Finance</h1>
        <p className="mt-1 text-muted-foreground">
          A lightweight public-funds ledger in {currencyCode}.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Balance" value={formatCurrency(summary.balanceMinor, currencyCode)} />
        <SummaryCard
          label={`${month} income`}
          value={formatCurrency(summary.monthIncomeMinor, currencyCode)}
        />
        <SummaryCard
          label={`${month} expenses`}
          value={formatCurrency(summary.monthExpenseMinor, currencyCode)}
        />
      </div>
      <DataTableToolbar
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            New entry
          </Button>
        }
        defaultQuery={search.q}
        key={search.q ?? ""}
        onQueryChange={listSearch.setQuery}
        onRefresh={() => router.invalidate()}
        searchPlaceholder="Search category or description"
      >
        <Select
          items={DIRECTION_LABELS}
          onValueChange={(value: LedgerDirectionFilter | null) =>
            value && listSearch.setFilter("direction", value)
          }
          value={search.direction}
        >
          <SelectTrigger className="w-auto min-w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEDGER_DIRECTION_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {DIRECTION_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={STATUS_LABELS}
          onValueChange={(value: LedgerStatusFilter | null) =>
            value && listSearch.setFilter("status", value)
          }
          value={search.status}
        >
          <SelectTrigger className="w-auto min-w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEDGER_STATUS_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataTableToolbar>
      <DataTable
        columns={columns}
        onSortChange={listSearch.setSort}
        order={search.order}
        rowKey={(row) => row.id}
        rows={list.items}
        sort={search.sort}
      />
      <DataTablePagination
        onPageChange={listSearch.setPage}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
      />
      <LedgerEntryFormDrawer
        currencyCode={currencyCode}
        entry={editing}
        onOpenChange={setOpen}
        open={open}
        orgId={orgId}
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardPanel className="p-4">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="mt-2 font-semibold text-xl tabular-nums">{value}</p>
      </CardPanel>
    </Card>
  );
}
