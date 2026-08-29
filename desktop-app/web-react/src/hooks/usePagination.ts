import { useMemo, useState } from 'react';

export function usePagination<T>(items: T[], pageSizeDefault = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeDefault);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );
  return {
    page: safePage,
    totalPages,
    pageSize,
    paged,
    setPage,
    setPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
    resetPage: () => setPage(1),
  };
}
