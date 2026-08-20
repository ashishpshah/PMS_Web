import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, XCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

type AlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

interface Alert {
  id: string;
  message: string;
  type: AlertType;
  duration?: number;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface SweetAlertContextType {
  showAlert: (message: string, type?: AlertType, duration?: number) => void;
  confirmAlert: (message: string, onConfirm?: () => void, onCancel?: () => void) => void;
}

const SweetAlertContext = createContext<SweetAlertContextType | undefined>(undefined);

export function SweetAlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const showAlert = useCallback((message: string, type: AlertType = 'info', duration: number = 3000) => {
    const id = Math.random().toString(36).substr(2, 9);
    setAlerts(prev => [...prev, { id, message, type, duration }]);
    if (duration > 0) {
      setTimeout(() => {
        setAlerts(prev => prev.filter(a => a.id !== id));
      }, duration);
    }
  }, []);

  const confirmAlert = useCallback((message: string, onConfirm?: () => void, onCancel?: () => void) => {
    const id = Math.random().toString(36).substr(2, 9);
    setAlerts(prev => [...prev, { id, message, type: 'confirm', onConfirm, onCancel }]);
  }, []);

  const removeAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const handleConfirm = (alert: Alert) => {
    alert.onConfirm?.();
    removeAlert(alert.id);
  };

  const handleCancel = (alert: Alert) => {
    alert.onCancel?.();
    removeAlert(alert.id);
  };

  const icons = {
    success: <CheckCircle className="h-8 w-8 text-emerald-500" />,
    error: <XCircle className="h-8 w-8 text-red-500" />,
    warning: <AlertTriangle className="h-8 w-8 text-amber-500" />,
    info: <Info className="h-8 w-8 text-blue-500" />,
    confirm: <AlertCircle className="h-8 w-8 text-indigo-500" />,
  };

  const alertStyles = {
    success: 'bg-white dark:bg-gray-900 border-emerald-200 dark:border-emerald-800',
    error: 'bg-white dark:bg-gray-900 border-red-200 dark:border-red-800',
    warning: 'bg-white dark:bg-gray-900 border-amber-200 dark:border-amber-800',
    info: 'bg-white dark:bg-gray-900 border-blue-200 dark:border-blue-800',
    confirm: 'bg-white dark:bg-gray-900 border-indigo-200 dark:border-indigo-800',
  };

  const iconBgColors = {
    success: 'bg-emerald-100 dark:bg-emerald-900/30',
    error: 'bg-red-100 dark:bg-red-900/30',
    warning: 'bg-amber-100 dark:bg-amber-900/30',
    info: 'bg-blue-100 dark:bg-blue-900/30',
    confirm: 'bg-indigo-100 dark:bg-indigo-900/30',
  };

  return (
    <SweetAlertContext.Provider value={{ showAlert, confirmAlert }}>
      {children}
      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => alert.type === 'confirm' ? null : removeAlert(alert.id)}
          >
            <div 
              className={cn(
                "w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden",
                alertStyles[alert.type]
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 text-center">
                <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4", iconBgColors[alert.type])}>
                  {icons[alert.type]}
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{alert.message}</p>
              </div>
              
              <div className="border-t border-gray-100 dark:border-gray-800">
                {alert.type === 'confirm' ? (
                  <div className="flex">
                    <button
                      onClick={() => handleCancel(alert)}
                      className="flex-1 py-3 text-sm font-bold uppercase text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <div className="w-px bg-gray-100 dark:bg-gray-800" />
                    <button
                      onClick={() => handleConfirm(alert)}
                      className="flex-1 py-3 text-sm font-bold uppercase text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                    >
                      Confirm
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => removeAlert(alert.id)}
                    className="w-full py-3 text-sm font-bold uppercase text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    OK
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </SweetAlertContext.Provider>
  );
}

export function useSweetAlert() {
  const context = useContext(SweetAlertContext);
  if (!context) {
    throw new Error('useSweetAlert must be used within SweetAlertProvider');
  }
  return context;
}