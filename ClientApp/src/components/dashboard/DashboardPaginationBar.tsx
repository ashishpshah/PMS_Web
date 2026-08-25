import { ChevronLeft, ChevronRight } from 'lucide-react';

// ── Shared client-side pagination for any Dashboard list card whose full
// record set could exceed 10 rows — 10 per page, clamps out-of-range pages
// (e.g. after the underlying filter/tab changes) instead of showing blank. ──
export const DASHBOARD_PAGE_SIZE = 10;

export function paginate<T>(items: T[], page: number, pageSize = DASHBOARD_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  return { pageItems: items.slice((clampedPage - 1) * pageSize, clampedPage * pageSize), totalPages, page: clampedPage, totalCount: items.length };
}

export function DashboardPaginationBar({ page, totalPages, totalCount, onPrev, onNext }: {
  page: number; totalPages: number; totalCount: number; onPrev: () => void; onNext: () => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-100 dark:border-gray-800">
      <span className="text-[10px] text-gray-400 font-mono">Page {page} of {totalPages} · {totalCount} total</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onPrev}
          disabled={page <= 1}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={12} /> Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
