import { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const ConfirmContext = createContext(null);

/**
 * One app-wide confirmation dialog. `confirm(options)` resolves true/false — used
 * for destructive actions and the CONFIRMATION_REQUIRED flow (API_CONTRACT §1.3).
 */
export function ConfirmProvider({ children }) {
  const [options, setOptions] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setOptions(opts);
      }),
    [],
  );

  const close = (answer) => {
    resolverRef.current?.(answer);
    resolverRef.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={options !== null} onOpenChange={(open) => !open && close(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title}</AlertDialogTitle>
            {options?.description && (
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">{options.description}</div>
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>
              {options?.cancelLabel ?? 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                options?.destructive && 'bg-destructive text-white hover:bg-destructive/90',
              )}
              onClick={() => close(true)}
            >
              {options?.confirmLabel ?? 'Continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/**
 * @returns {(opts: { title: string, description?: import('react').ReactNode,
 *   confirmLabel?: string, cancelLabel?: string, destructive?: boolean }) => Promise<boolean>}
 */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}
