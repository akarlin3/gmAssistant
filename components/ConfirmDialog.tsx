'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertOctagon } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setOptions(opts);
      setIsOpen(true);
      resolveRef.current = resolve;
    });
  }, []);

  const handleClose = (value: boolean) => {
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(value);
      resolveRef.current = null;
    }
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {isOpen && options && (
        <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[2px] duration-200">
          <div className="animate-in fade-in zoom-in-95 w-full max-w-md space-y-4 rounded border border-rule bg-parchment p-6 shadow-page duration-200">
            <div className="flex items-start gap-4">
              <div className={`shrink-0 rounded-full p-2 ${options.isDestructive ? 'bg-crimson/10 text-crimson' : 'bg-brass/10 text-brass-deep'}`}>
                <AlertOctagon size={24} />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <h3 className="truncate font-display text-lg tracking-wide text-ink">
                  {options.title}
                </h3>
                <p className="break-words font-serif text-sm italic leading-relaxed text-ink-soft">
                  {options.message}
                </p>
              </div>
            </div>
            <div className="flourish"><span>❦</span></div>
            <div className="flex justify-end gap-3 font-display text-xs uppercase tracking-wider">
              <button
                onClick={() => handleClose(false)}
                className="rounded border border-brass px-4 py-2 text-brass-deep transition-colors hover:bg-brass/10"
              >
                {options.cancelText || 'Cancel'}
              </button>
              <button
                onClick={() => handleClose(true)}
                className={`rounded px-4 py-2 text-parchment transition-colors ${
                  options.isDestructive
                    ? 'bg-crimson hover:bg-wine'
                    : 'bg-brass-deep hover:bg-brass-deep/90'
                }`}
              >
                {options.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context.confirm;
}
