import React, { createContext, useContext, useState, ReactNode } from 'react';

type QuickViewType = 'project' | 'task' | 'user' | 'effort' | null;

interface QuickViewFrame {
  type: Exclude<QuickViewType, null>;
  id: number;
}

interface QuickViewContextType {
  activeType: QuickViewType;
  activeId: number | null;
  openQuickView: (type: QuickViewType, id: number) => void;
  closeQuickView: () => void;
  goBack: () => void;
  canGoBack: boolean;
}

const QuickViewContext = createContext<QuickViewContextType | undefined>(undefined);

export function QuickViewProvider({ children }: { children: ReactNode }) {
  // Navigation stack — the last frame is the one currently shown.
  const [stack, setStack] = useState<QuickViewFrame[]>([]);

  const openQuickView = (type: QuickViewType, id: number) => {
    if (type === null) { setStack([]); return; }
    setStack(prev => {
      const top = prev[prev.length - 1];
      // Avoid pushing a duplicate of what's already shown
      if (top && top.type === type && top.id === id) return prev;
      return [...prev, { type, id }];
    });
  };

  const closeQuickView = () => setStack([]);

  const goBack = () => setStack(prev => (prev.length > 1 ? prev.slice(0, -1) : []));

  const current = stack[stack.length - 1] ?? null;

  return (
    <QuickViewContext.Provider value={{
      activeType: current?.type ?? null,
      activeId: current?.id ?? null,
      openQuickView,
      closeQuickView,
      goBack,
      canGoBack: stack.length > 1,
    }}>
      {children}
    </QuickViewContext.Provider>
  );
}

export function useQuickView() {
  const context = useContext(QuickViewContext);
  if (context === undefined) {
    throw new Error('useQuickView must be used within a QuickViewProvider');
  }
  return context;
}
