// Small shared building blocks used across screens (WIREFRAMES §0.2).
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeftIcon, CalendarIcon } from 'lucide-react';
import { todayIST } from '@splitbook/shared';
import { errorMessage } from '@/api/messages.js';
import { balanceTone, formatDate, formatPaise } from '@/lib/format.js';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';

export function PageHeader({ title, description, actions, back }) {
  return (
    <div className="mb-6 space-y-2">
      {back && (
        <Link
          to={back.to}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Red page alert with Retry (WIREFRAMES §0.2). */
export function ErrorState({ error, onRetry }) {
  return (
    <Alert variant="destructive" className="flex items-center justify-between">
      <AlertDescription>{errorMessage(error)}</AlertDescription>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Alert>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function LoadingRows({ rows = 4 }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function Money({ paise, className }) {
  return <span className={cn('tabular-nums', className)}>{formatPaise(paise)}</span>;
}

/** "you owe ₹X" (red) · "owes you ₹X" (green) · "settled up" (grey). */
export function BalanceText({ netPaise, className }) {
  const tone = balanceTone(netPaise);
  if (netPaise === 0) return <span className={cn(tone, className)}>settled up</span>;
  return (
    <span className={cn(tone, className)}>
      {netPaise < 0 ? 'you owe ' : 'owes you '}
      <Money paise={Math.abs(netPaise)} />
    </span>
  );
}

/** "Showing 1–20 of 57  ‹ 1 2 3 ›" */
export function Pager({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          ‹
        </Button>
        {Array.from({ length: pages }, (_, i) => i + 1)
          .filter((p) => Math.abs(p - page) <= 2 || p === 1 || p === pages)
          .map((p) => (
            <Button
              key={p}
              size="sm"
              variant={p === page ? 'secondary' : 'ghost'}
              onClick={() => onChange(p)}
            >
              {p}
            </Button>
          ))}
        <Button
          size="sm"
          variant="ghost"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          ›
        </Button>
      </div>
    </div>
  );
}

const toDate = (value) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toValue = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Calendar date picker on "YYYY-MM-DD" strings; future days disabled by default (FR-EXP-04). */
export function DateField({
  id,
  value,
  onChange,
  allowFuture = false,
  placeholder = 'Pick a date',
  invalid,
}) {
  const [open, setOpen] = useState(false);
  const max = toDate(todayIST());
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid || undefined}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
        >
          {value ? formatDate(value) : placeholder}
          <CalendarIcon className="size-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ? toDate(value) : undefined}
          defaultMonth={value ? toDate(value) : max}
          disabled={allowFuture ? undefined : { after: max }}
          onSelect={(date) => {
            if (date) onChange(toValue(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Destructive confirmation that requires typing a phrase (UI-2: account and group delete). */
export function TypeToConfirmDialog({ open, onOpenChange, ...body }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Content unmounts when closed, so the typed text resets on its own. */}
        <TypeToConfirmBody onCancel={() => onOpenChange(false)} {...body} />
      </DialogContent>
    </Dialog>
  );
}

function TypeToConfirmBody({
  title,
  description,
  phrase,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}) {
  const [typed, setTyped] = useState('');
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription asChild>
          <div className="space-y-2">{description}</div>
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="type-to-confirm">
          Type <span className="font-semibold">{phrase}</span> to confirm
        </Label>
        <Input
          id="type-to-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" disabled={typed !== phrase || busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Calls `refetch` when the tab becomes visible again (ADR-008). */
export function useRefetchOnFocus(refetch) {
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && refetch();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetch]);
}

/** Debounces a value (search boxes, 300 ms). */
export function useDebounced(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
