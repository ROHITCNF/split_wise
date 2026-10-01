// Display helpers (WIREFRAMES §0.2). Formatting lives in @splitbook/shared so the
// server (CSV, messages) and client agree.
export {
  formatDate,
  formatDateTime,
  formatPaise,
  formatPeriodLabel,
  truncate,
} from '@splitbook/shared';

/** Tailwind text colour for a balance: red = you owe, green = owed to you, grey = settled. */
export function balanceTone(netPaise) {
  if (netPaise < 0) return 'text-owe';
  if (netPaise > 0) return 'text-owed';
  return 'text-muted-foreground';
}

/** "Karan (left)" for members who are no longer active (FR-GRP-11). */
export function memberLabel(member) {
  if (!member) return '';
  return member.status && member.status !== 'active'
    ? `${member.name} (${member.status})`
    : member.name;
}

/** Initials for avatars: "Karan Mehta" → "KM". */
export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}
