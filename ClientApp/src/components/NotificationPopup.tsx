import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Button } from './ui/Button';

export function NotificationPopup() {
  const { activeAlert, dismissAlert } = useData();

  return (
    <AnimatePresence>
      {activeAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissAlert}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800"
          >
            <div className="p-6">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 mx-auto mb-4">
                {activeAlert.title.includes('OVERDUE') ? (
                  <AlertTriangle size={32} className="animate-pulse" />
                ) : (
                  <Bell size={32} />
                )}
              </div>
              
              <h3 className="text-center text-lg font-black uppercase tracking-tight text-gray-900 dark:text-white mb-2">
                {activeAlert.title}
              </h3>
              
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
                {activeAlert.message}
              </p>

              <div className="flex flex-col gap-2">
                <Button 
                  onClick={dismissAlert}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2"
                >
                  <CheckCircle size={16} />
                  Acknowledge Clearance
                </Button>
                <button 
                  onClick={dismissAlert}
                  className="w-full py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Dismiss for now
                </button>
              </div>
            </div>
            
            <button 
              onClick={dismissAlert}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X size={20} />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
