'use client';

import React, { createContext, useContext, useState, useCallback, useId } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
  onUndo?: () => void;
  undoLabel?: string;
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  showToast: (options: ToastOptions | string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions | string) => {
    const opts: ToastOptions = typeof options === 'string' ? { message: options, type: 'success' } : options;
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration = opts.duration ?? (opts.onUndo ? 5000 : 3500);

    const newToast: ToastItem = {
      id,
      message: opts.message,
      type: opts.type || 'success',
      duration,
      onUndo: opts.onUndo,
      undoLabel: opts.undoLabel || 'Undo',
    };

    setToasts(prev => [...prev.slice(-4), newToast]); // Keep at most 5 active toasts

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Floating Top-Right Toast Stack */}
      <div
        className="fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none font-sans"
        aria-live="polite"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map(toast => {
            const isSuccess = toast.type === 'success';
            const isError = toast.type === 'error';
            const isWarning = toast.type === 'warning';

            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                className={`pointer-events-auto rounded-xl border p-3.5 shadow-2xl backdrop-blur-md flex items-start gap-3 transition-colors ${
                  isSuccess
                    ? 'bg-slate-900/95 border-emerald-500/40 text-slate-100 shadow-emerald-950/20'
                    : isError
                    ? 'bg-slate-900/95 border-rose-500/40 text-slate-100 shadow-rose-950/20'
                    : isWarning
                    ? 'bg-slate-900/95 border-amber-500/40 text-slate-100 shadow-amber-950/20'
                    : 'bg-slate-900/95 border-cyan-500/40 text-slate-100 shadow-cyan-950/20'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {isError && <AlertCircle className="w-4 h-4 text-rose-400" />}
                  {isWarning && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                  {!isSuccess && !isError && !isWarning && <Info className="w-4 h-4 text-cyan-400" />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200 leading-snug break-words">
                    {toast.message}
                  </p>

                  {toast.onUndo && (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          toast.onUndo?.();
                          removeToast(toast.id);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono font-medium transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{toast.undoLabel}</span>
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="shrink-0 p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  aria-label="Dismiss notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
