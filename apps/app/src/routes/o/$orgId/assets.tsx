import type { AssetRow } from "@everband/core";
import { formatOrgDateTime } from "@everband/domain";
import { Badge } from "@everband/ui/components/badge";
import { Button } from "@everband/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import { toastManager } from "@everband/ui/components/toast";
import type { AssetStatusFilter } from "@everband/validation";
import { ASSET_STATUS_FILTERS, assetsListSchema } from "@everband/validation";
import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  DownloadSimpleIcon,
  EyeIcon,
  PencilSimpleIcon,
  PlusIcon,
  ProhibitIcon,
  QrCodeIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { createFileRoute, getRouteApi, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ConfirmDialog } from "~/components/confirm-dialog.tsx";
import { DataTable, type DataTableColumn } from "~/components/data-table/data-table.tsx";
import { DataTablePagination } from "~/components/data-table/data-table-pagination.tsx";
import { DataTableToolbar } from "~/components/data-table/data-table-toolbar.tsx";
import { useListSearch } from "~/components/data-table/use-list-search.ts";
import { PageSkeleton } from "~/components/page-loaders.tsx";
import {
  generateAssetQr,
  listAssetHolderOptions,
  listAssets,
  refreshAssetQrStats,
  updateAssetStatus,
} from "~/server/assets.ts";
import { getQrImageData } from "~/server/public.ts";
import { AssetFormDrawer } from "./-components/asset-form-drawer.tsx";

export const Route = createFileRoute("/o/$orgId/assets")({
  validateSearch: assetsListSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    try {
      const [list, holderOptions] = await Promise.all([
        listAssets({ data: { orgId: params.orgId, ...deps } }),
        listAssetHolderOptions({ data: { orgId: params.orgId } }),
      ]);
      return { list, holderOptions };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: AssetsPage,
  pendingComponent: PageSkeleton,
});

const orgRoute = getRouteApi("/o/$orgId");

const STATUS_LABELS: Record<AssetStatusFilter, string> = {
  all: "All equipment",
  active: "Active",
  retired: "Retired",
};

function AssetsPage() {
  const { list, holderOptions } = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const { org } = orgRoute.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const listSearch = useListSearch({
    search,
    onChange: (patch) =>
      navigate({ replace: true, search: (current) => ({ ...current, ...patch }) }),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRow | undefined>();

  function openCreate() {
    setEditing(undefined);
    setOpen(true);
  }

  function openEdit(asset: AssetRow) {
    setEditing(asset);
    setOpen(true);
  }

  async function setAssetStatus(asset: AssetRow): Promise<boolean> {
    const status = asset.status === "active" ? "retired" : "active";
    const result = await updateAssetStatus({ data: { orgId, assetId: asset.id, status } });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return false;
    }
    await router.invalidate();
    toastManager.add({
      title: status === "retired" ? "Equipment retired" : "Equipment restored",
      type: "success",
    });
    return true;
  }

  async function createQr(asset: AssetRow) {
    const result = await generateAssetQr({ data: { orgId, assetId: asset.id } });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return;
    }
    await router.invalidate();
    toastManager.add({
      title: result.changed ? "QR code generated" : "QR code already exists",
      type: "success",
    });
  }

  async function refreshStats(asset: AssetRow) {
    const result = await refreshAssetQrStats({ data: { orgId, assetId: asset.id } });
    await router.invalidate();
    toastManager.add({
      title: result.ok ? "Scan count refreshed" : result.error,
      type: result.ok ? "success" : "error",
    });
  }

  async function downloadQr(asset: AssetRow, format: "svg" | "png") {
    if (!asset.qrCodeId) return;
    const result = await getQrImageData({
      data: { orgId, qrId: asset.qrCodeId, format },
    });
    if (!result.ok) {
      toastManager.add({ title: result.error, type: "error" });
      return;
    }
    const bytes = Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: result.contentType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `everband-${asset.id}-qr.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const columns: DataTableColumn<AssetRow>[] = [
    {
      key: "name",
      header: "Equipment",
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.name}</p>
          {row.serialNumber && <p className="text-muted-foreground text-xs">{row.serialNumber}</p>}
        </div>
      ),
    },
    { key: "type", header: "Category", sortable: true, render: (row) => row.type },
    {
      key: "holder",
      header: "Current holder",
      render: (row) =>
        row.currentHolderName ? (
          <div>
            <span>{row.currentHolderName}</span>
            {row.currentHolderStatus !== "active" && (
              <p className="flex items-center gap-1 text-warning-foreground text-xs">
                <WarningCircleIcon /> Needs review
              </p>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">Not assigned</span>
        ),
    },
    {
      key: "qr",
      header: "QR label",
      render: (row) => (
        <QrCell
          asset={row}
          onDownload={downloadQr}
          onGenerate={createQr}
          onRefresh={refreshStats}
          timezone={org.timezone}
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => (
        <Badge variant={row.status === "active" ? "success" : "secondary"}>{row.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "w-0",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            aria-label="Open public equipment card"
            render={<Link params={{ assetId: row.id }} target="_blank" to="/a/$assetId" />}
            size="icon-sm"
            variant="ghost"
          >
            <EyeIcon />
          </Button>
          <Button
            aria-label="Edit equipment"
            onClick={() => openEdit(row)}
            size="icon-sm"
            variant="ghost"
          >
            <PencilSimpleIcon />
          </Button>
          <ConfirmDialog
            confirmLabel={row.status === "active" ? "Retire equipment" : "Restore equipment"}
            description={
              row.status === "active"
                ? "The printed QR label will show an inactive message until this item is restored."
                : "The existing QR label will show this equipment card again if the link is healthy."
            }
            destructive={row.status === "active"}
            onConfirm={() => setAssetStatus(row)}
            title={row.status === "active" ? "Retire this equipment?" : "Restore this equipment?"}
            trigger={
              <Button
                aria-label={row.status === "active" ? "Retire equipment" : "Restore equipment"}
                size="icon-sm"
                variant="ghost"
              >
                {row.status === "active" ? <ProhibitIcon /> : <ArrowCounterClockwiseIcon />}
              </Button>
            }
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Equipment</h1>
        <p className="mt-1 text-muted-foreground">
          Track identification and current holders, then print a read-only QR label.
        </p>
      </div>
      <DataTableToolbar
        actions={
          <Button onClick={openCreate}>
            <PlusIcon /> New equipment
          </Button>
        }
        defaultQuery={search.q}
        key={search.q ?? ""}
        onQueryChange={listSearch.setQuery}
        searchPlaceholder="Search name, category or number"
      >
        <Select
          items={STATUS_LABELS}
          onValueChange={(value: AssetStatusFilter | null) =>
            value && listSearch.setFilter("status", value)
          }
          value={search.status}
        >
          <SelectTrigger className="w-auto min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSET_STATUS_FILTERS.map((value) => (
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
      <AssetFormDrawer
        asset={editing}
        holderOptions={holderOptions}
        onOpenChange={setOpen}
        open={open}
        orgId={orgId}
      />
    </div>
  );
}

function QrCell({
  asset,
  onDownload,
  onGenerate,
  onRefresh,
  timezone,
}: {
  asset: AssetRow;
  onDownload: (asset: AssetRow, format: "svg" | "png") => Promise<void>;
  onGenerate: (asset: AssetRow) => Promise<void>;
  onRefresh: (asset: AssetRow) => Promise<void>;
  timezone: string;
}) {
  if (!asset.qrCodeId) {
    return asset.status === "active" ? (
      <Button onClick={() => onGenerate(asset)} size="xs" variant="outline">
        <QrCodeIcon /> Generate
      </Button>
    ) : (
      <span className="text-muted-foreground text-xs">Not generated</span>
    );
  }
  if (asset.qrStatus === "broken") {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <Badge variant="destructive">broken</Badge>
        <ConfirmDialog
          confirmLabel="Replace QR code"
          description="The old printed code cannot be repaired. Generate and print a new label."
          onConfirm={async () => {
            await onGenerate(asset);
            return true;
          }}
          title="Replace this QR code?"
          trigger={
            <Button size="xs" variant="outline">
              <QrCodeIcon /> Replace
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <div className="flex min-w-40 flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Badge variant={asset.qrStatus === "active" ? "outline" : "secondary"}>
          {asset.qrStatus}
        </Badge>
        <span className="text-muted-foreground text-xs">scans: {asset.scanCount ?? "—"}</span>
      </div>
      {asset.lastStatsSyncAt && (
        <span className="text-muted-foreground text-xs">
          Updated {formatOrgDateTime(asset.lastStatsSyncAt, timezone)}
        </span>
      )}
      <div className="flex gap-1">
        <Button
          aria-label="Download QR as SVG"
          onClick={() => onDownload(asset, "svg")}
          size="xs"
          variant="outline"
        >
          <DownloadSimpleIcon /> SVG
        </Button>
        <Button
          aria-label="Download QR as PNG"
          onClick={() => onDownload(asset, "png")}
          size="xs"
          variant="outline"
        >
          PNG
        </Button>
        <Button
          aria-label="Refresh QR scan count"
          onClick={() => onRefresh(asset)}
          size="icon-xs"
          variant="ghost"
        >
          <ArrowsClockwiseIcon />
        </Button>
      </div>
    </div>
  );
}
