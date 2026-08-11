import { Button } from "@everband/ui/components/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@everband/ui/components/pagination";
import { cn } from "@everband/ui/lib/utils";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import type React from "react";

export type DataTablePaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
};

type PageItem = number | "gap-start" | "gap-end";

// 首尾各留一页 + 当前页 ±1，其余折叠成省略号
export function buildPageItems(page: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const items: PageItem[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) items.push("gap-start");
  for (let value = start; value <= end; value += 1) items.push(value);
  if (end < pageCount - 1) items.push("gap-end");
  items.push(pageCount);
  return items;
}

/**
 * 列表分页。vendored 的 pagination.tsx 是链接语义（<a>），这里只借它的 nav/ul/li 结构与
 * 省略号，页码本身用 Button 驱动 onPageChange——列表状态在 URL search 里由调用方 navigate，
 * 不需要真实 href。单页（total ≤ pageSize）时整体不渲染。
 */
export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: DataTablePaginationProps): React.ReactElement | null {
  if (total <= pageSize) return null;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const first = (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, total);

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-muted-foreground text-sm tabular-nums">
        Showing {first}–{last} of {total}
      </p>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <Button
              aria-label="Go to previous page"
              disabled={current <= 1}
              onClick={() => onPageChange(current - 1)}
              variant="ghost"
            >
              <CaretLeftIcon className="sm:-ms-1" />
              <span className="max-sm:hidden">Previous</span>
            </Button>
          </PaginationItem>
          {buildPageItems(current, pageCount).map((item) =>
            typeof item === "number" ? (
              <PaginationItem key={item}>
                <Button
                  aria-current={item === current ? "page" : undefined}
                  aria-label={`Go to page ${item}`}
                  className="tabular-nums"
                  onClick={() => onPageChange(item)}
                  size="icon"
                  variant={item === current ? "outline" : "ghost"}
                >
                  {item}
                </Button>
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <PaginationEllipsis />
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <Button
              aria-label="Go to next page"
              disabled={current >= pageCount}
              onClick={() => onPageChange(current + 1)}
              variant="ghost"
            >
              <span className="max-sm:hidden">Next</span>
              <CaretRightIcon className="sm:-me-1" />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
