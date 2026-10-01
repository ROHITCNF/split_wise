/** App path for a notification's link, or null when the group was deleted (FR-NTF-03/05). */
export function notificationPath(link) {
  if (!link) return null;
  if (link.type === 'expense') return `/groups/${link.groupId}/expenses/${link.id}`;
  if (link.type === 'settlement') return `/groups/${link.groupId}/settlements`;
  return `/groups/${link.groupId}/expenses`;
}

/** Lets the bell refresh right away after something is marked read elsewhere. */
export const NOTIFICATIONS_CHANGED = 'splitbook:notifications-changed';

export function announceNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

/** "just now", "5 min ago", "2 h ago", "3 days ago". */
export function timeAgo(isoInstant, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(isoInstant)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
