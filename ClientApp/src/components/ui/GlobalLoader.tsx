import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { subscribe } from '../../lib/loadingBus';

// Full-screen blocking overlay shown while any API/database request is in flight.
// A short show-delay prevents flicker on fast calls.
const SHOW_DELAY_MS = 250;

export function GlobalLoader() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = subscribe(active => {
      if (active > 0) {
        // Schedule showing only if not already scheduled (setVisible(true) is idempotent).
        if (timer == null) {
          timer = setTimeout(() => { setVisible(true); timer = null; }, SHOW_DELAY_MS);
        }
      } else {
        // No requests left — cancel a pending show and hide.
        if (timer != null) { clearTimeout(timer); timer = null; }
        setVisible(false);
      }
    });

    return () => {
      if (timer != null) clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/30 dark:bg-black/50 backdrop-blur-[1px] cursor-wait"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white dark:bg-gray-900 px-8 py-6 shadow-2xl ring-1 ring-gray-100 dark:ring-gray-800">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 animate-pulse">Please wait…</p>
      </div>
    </div>
  );
}
