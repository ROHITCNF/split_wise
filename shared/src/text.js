/**
 * Shortens text to `max` characters (counting the trailing "…"), by code point so
 * emoji and ₹ are never split. Lists use 40 (FR-EXP-14).
 */
export function truncate(text, max = 40) {
  if (!text) return '';
  const chars = [...text];
  return chars.length <= max
    ? text
    : `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
}
