import type { SortOrder } from "@everband/validation";
import { useMemo } from "react";

/** createListQuerySchema 产出的基础字段；调用方的 search 类型只要包含它们即可 */
export type ListSearchState = {
  page: number;
  pageSize: number;
  sort: string;
  order: SortOrder;
  q?: string;
};

export type ListSearchControls<TSearch extends ListSearchState> = {
  setPage: (page: number) => void;
  /** 签名与 DataTable 的 onSortChange 对齐，可直接 onSortChange={list.setSort} */
  setSort: (sort: string, order: SortOrder) => void;
  setQuery: (query: string) => void;
  setFilter: <K extends keyof TSearch & string>(key: K, value: TSearch[K] | undefined) => void;
};

export type UseListSearchOptions<TSearch extends ListSearchState> = {
  /** 当前 search，来自 Route.useSearch() */
  search: TSearch;
  /** 把补丁合并进 URL；固定写法见下方注释 */
  onChange: (patch: Partial<TSearch>) => void;
};

// 泛型下 TS 无法自证"字面量对象是 TSearch 的子集"，这里收敛一次断言，
// 换取调用方零样板；键名的正确性由 setFilter 的 keyof 约束在编译期保证。
function toPatch<TSearch extends ListSearchState>(
  patch: Record<string, unknown>,
): Partial<TSearch> {
  return patch as Partial<TSearch>;
}

/**
 * 列表页 URL 状态的统一操作入口。刻意不吞 useNavigate——它的类型依赖路由注册表，
 * 包一层泛型只会更难用；调用方传一行 onChange 即可，且 prev 由路由自带类型。
 *
 * ```tsx
 * const search = Route.useSearch();
 * const navigate = Route.useNavigate();
 * const list = useListSearch({
 *   search,
 *   onChange: (patch) => navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true }),
 * });
 * ```
 *
 * 约定：改变结果集的操作（搜索、筛选、排序）一律把 page 复位到 1，
 * 否则会停在一个语义已经变了的页码上；navigate 用 replace 避免污染前进/后退历史。
 */
export function useListSearch<TSearch extends ListSearchState>({
  search,
  onChange,
}: UseListSearchOptions<TSearch>): ListSearchControls<TSearch> {
  const { sort, order } = search;

  return useMemo<ListSearchControls<TSearch>>(
    () => ({
      setFilter(key, value) {
        onChange(toPatch<TSearch>({ [key]: value, page: 1 }));
      },
      setPage(page) {
        onChange(toPatch<TSearch>({ page: Math.max(1, page) }));
      },
      setQuery(query) {
        const next = query.trim();
        onChange(toPatch<TSearch>({ page: 1, q: next.length > 0 ? next : undefined }));
      },
      setSort(nextSort, nextOrder) {
        if (nextSort === sort && nextOrder === order) return;
        onChange(toPatch<TSearch>({ order: nextOrder, page: 1, sort: nextSort }));
      },
    }),
    [onChange, order, sort],
  );
}
