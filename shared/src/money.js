// Money is always an integer number of paise; percentages are integer basis points
// (hundredths of a percent). Conversion to/from human text happens only here (ADR-003).

const RUPEES_PATTERN = /^\d+(\.\d{1,2})?$/;
const PERCENT_PATTERN = /^\d+(\.\d{1,2})?$/;
const INTEGER_GROUPING = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/**
 * Parses a rupee amount ("1,200.50", "45", 1200.5) into paise.
 * Returns null for anything that is not a non-negative amount with at most 2 decimals.
 * @param {string|number} input
 * @returns {number|null}
 */
export function rupeesToPaise(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    input = String(input);
  }
  if (typeof input !== 'string') return null;

  const text = input.trim().replaceAll(',', '');
  if (!RUPEES_PATTERN.test(text)) return null;

  const [whole, fraction = ''] = text.split('.');
  const paise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(paise);
}

/**
 * Formats paise for display: 12000000 → "₹1,20,000.00" (Indian digit grouping).
 * @param {number} paise
 * @param {{ symbol?: boolean }} [options]
 */
export function formatPaise(paise, { symbol = true } = {}) {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = INTEGER_GROUPING.format(Math.trunc(abs / 100));
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}${symbol ? '₹' : ''}${rupees}.${fraction}`;
}

/**
 * Plain rupee string without grouping, for inputs and CSV: 120050 → "1200.50".
 * @param {number} paise
 */
export function paiseToRupeesString(paise) {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Parses a percentage ("33.33") into basis points (3333). Range 0–100, max 2 decimals.
 * @param {string|number} input
 * @returns {number|null}
 */
export function percentToBp(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    input = String(input);
  }
  if (typeof input !== 'string') return null;

  const text = input.trim();
  if (!PERCENT_PATTERN.test(text)) return null;

  const [whole, fraction = ''] = text.split('.');
  const bp = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return bp <= 10000 ? bp : null;
}

/**
 * 3333 → "33.33"
 * @param {number} bp
 */
export function bpToPercentString(bp) {
  return `${Math.trunc(bp / 100)}.${String(bp % 100).padStart(2, '0')}`;
}
