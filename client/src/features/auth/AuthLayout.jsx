import { APP_NAME } from '@splitbook/shared';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/** Centred card used by every auth screen (WIREFRAMES §2). */
export function AuthLayout({ title, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <Card className="w-[400px]">
        <CardHeader>
          <div className="text-sm font-semibold">◆ {APP_NAME}</div>
          <h1 className="text-xl leading-none font-semibold">{title}</h1>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function FieldError({ message }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}
