import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  const titleId = `modal-title-${React.useId()}`;
  const closeRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Focus close button when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => closeRef.current?.focus(), 50);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            aria-hidden="true"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={cn(
              'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-[60] overflow-hidden',
              className
            )}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 id={titleId} className="text-xl font-bold">{title}</h3>
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="Close dialog"
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
              >
                <X size={20} className="text-gray-500" aria-hidden="true" />
              </button>
            </div>
            <div className="p-6 max-h-[80vh] overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
