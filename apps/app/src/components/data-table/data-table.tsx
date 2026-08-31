import { Checkbox } from "@everband/ui/components/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@everband/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@everband/ui/components/table";
import { cn } from "@everband/ui/lib/utils";
import type { SortOrder } from "@everband/validation";
import { CaretDownIcon, CaretUpDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import type React from "react";

export type DataTableColumn<T> = {
  /** 列标识；可排序列的 key 必须落在 createListQuerySchema 的 sortFields 内 */
  key: string;
  header: React.ReactNode;
  sortable?: boolean;
  /** 首次点击该列时使用的方向，默认 asc（时间列一般传 desc） */
  defaultOrder?: SortOrder;
  className?: string;
  render: (row: T) => React.ReactNode;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** 空态节点；不传则渲染统一的 "No results" */
  empty?: React.ReactNode;
  sort?: string;
  order?: SortOrder;
  onSortChange?: (sort: string, order: SortOrder) => void;
  /** 可选：多选。选中状态由页面持有（翻页保留已选 ID，不随页清空） */
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /** 行的复选框无障碍标签（如 "Select Alice"） */
  selectionLabel?: (row: T) => string;
  onRowClick?: (row: T) => void;
  className?: string;
};

// 表头排序按钮用原生 button 而不是 Button 组件：Button 的 pointer-coarse 扩展热区（44px）
// 在紧凑表头里会互相遮挡，移动端点击容易被邻列拦截（见 DEV_NOTE 移动端触控热区）。
const sortButtonClassName =
  "-mx-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/24 data-[active=true]:text-foreground";

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  sort,
  order = "asc",
  onSortChange,
  selectedIds,
  onSelectionChange,
  selectionLabel,
  onRowClick,
  className,
}: DataTableProps<T>): React.ReactElement {
  function handleSort(column: DataTableColumn<T>): void {
    if (!onSortChange) return;
    const isActive = sort === column.key;
    const nextOrder: SortOrder = isActive
      ? order === "asc"
        ? "desc"
        : "asc"
      : (column.defaultOrder ?? "asc");
    onSortChange(column.key, nextOrder);
  }

  const hasSelection = Boolean(onSelectionChange);
  const pageKeys = rows.map(rowKey);
  const selected = selectedIds ?? new Set<string>();
  const allSelected = pageKeys.length > 0 && pageKeys.every((key) => selected.has(key));
  const someSelected = !allSelected && pageKeys.some((key) => selected.has(key));

  function togglePage(checked: boolean) {
    const next = new Set(selected);
    for (const key of pageKeys) {
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
    }
    onSelectionChange?.(next);
  }

  function toggleRow(row: T, checked: boolean) {
    const next = new Set(selected);
    const key = rowKey(row);
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    onSelectionChange?.(next);
  }

  return (
    <Table className={className} variant="card">
      <TableHeader>
        <TableRow>
          {hasSelection && (
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all rows"
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={togglePage}
              />
            </TableHead>
          )}
          {columns.map((column) => {
            const isActive = sort === column.key;
            const isSortable = Boolean(column.sortable && onSortChange);
            return (
              <TableHead
                aria-sort={isActive ? (order === "asc" ? "ascending" : "descending") : undefined}
                className={column.className}
                key={column.key}
              >
                {isSortable ? (
                  <button
                    className={sortButtonClassName}
                    data-active={isActive}
                    onClick={() => handleSort(column)}
                    type="button"
                  >
                    {column.header}
                    <SortIndicator isActive={isActive} order={order} />
                  </button>
                ) : (
                  column.header
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              className="whitespace-normal p-0"
              colSpan={columns.length + (hasSelection ? 1 : 0)}
            >
              {empty ?? <DataTableEmpty />}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow
              className={onRowClick ? "cursor-pointer hover:bg-muted/50" : undefined}
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {hasSelection && (
                <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    aria-label={selectionLabel?.(row) ?? "Select row"}
                    checked={selected.has(rowKey(row))}
                    onCheckedChange={(checked) => toggleRow(row, checked)}
                  />
                </TableCell>
              )}
              {columns.map((column) => (
                <TableCell className={cn(column.className)} key={column.key}>
                  {column.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function SortIndicator({
  isActive,
  order,
}: {
  isActive: boolean;
  order: SortOrder;
}): React.ReactElement {
  if (!isActive) return <CaretUpDownIcon className="size-3.5 opacity-40" />;
  return order === "asc" ? (
    <CaretUpIcon className="size-3.5" />
  ) : (
    <CaretDownIcon className="size-3.5" />
  );
}

function DataTableEmpty(): React.ReactElement {
  return (
    <Empty className="py-12 md:py-12">
      <EmptyHeader>
        <EmptyTitle>No results</EmptyTitle>
        <EmptyDescription>Try a different search or filter.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
