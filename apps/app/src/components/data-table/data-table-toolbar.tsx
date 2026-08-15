import { Button } from "@everband/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@everband/ui/components/input-group";
import { cn } from "@everband/ui/lib/utils";
import { ArrowClockwiseIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import type React from "react";

export type DataTableToolbarProps = {
  searchPlaceholder?: string;
  /** 初始关键词，通常来自 URL 的 q */
  defaultQuery?: string;
  /** 回车提交时触发；不传则不渲染搜索框 */
  onQueryChange?: (query: string) => void;
  /** 筛选器（Select 等），渲染在搜索框右侧 */
  children?: React.ReactNode;
  /** 右侧操作区，如 New xxx 按钮 */
  actions?: React.ReactNode;
  /** 右上角刷新按钮（通常接 router.invalidate） */
  onRefresh?: () => void;
  className?: string;
};

/**
 * 列表页工具条。搜索框是**非受控**的（`defaultValue` + 提交时读 FormData），
 * 规避受控输入在水合完成前被清空的竞态，也不需要 debounce（见 DEV_NOTE）。
 *
 * 因为非受控，外部改写 q（如"清除筛选"）不会自动同步到输入框；这种场景给
 * 组件挂 `key={search.q ?? ""}` 强制重挂即可。
 */
export function DataTableToolbar({
  searchPlaceholder = "Search",
  defaultQuery,
  onQueryChange,
  children,
  actions,
  onRefresh,
  className,
}: DataTableToolbarProps): React.ReactElement {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!onQueryChange) return;
    const value = new FormData(event.currentTarget).get("q");
    onQueryChange(typeof value === "string" ? value.trim() : "");
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {onQueryChange && (
        <form className="w-full sm:w-64" onSubmit={handleSubmit}>
          <InputGroup>
            <InputGroupAddon>
              <MagnifyingGlassIcon />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={searchPlaceholder}
              defaultValue={defaultQuery}
              name="q"
              placeholder={searchPlaceholder}
              type="search"
            />
          </InputGroup>
          {/* 键盘/读屏用户的显式提交入口，视觉上不占位 */}
          <button className="sr-only" type="submit">
            Search
          </button>
        </form>
      )}
      {children}
      {actions && (
        <div className="ms-auto flex items-center gap-2">
          {onRefresh && (
            <Button aria-label="Refresh" onClick={onRefresh} size="icon" variant="ghost">
              <ArrowClockwiseIcon />
            </Button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
