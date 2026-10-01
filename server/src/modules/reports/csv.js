import { paiseToRupeesString } from '@splitbook/shared';

const HEADER = [
  'Date',
  'Group',
  'Type',
  'Description',
  'Payer',
  'Total Amount (INR)',
  'My Share (INR)',
  'Split Method',
];

/**
 * One CSV cell (RFC 4180, FR-RPT-07). Text starting with = + - @ (or tab / CR) is
 * prefixed with ' so spreadsheets don't run it as a formula.
 */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * R2 — the report as CSV: UTF-8 with BOM (so Excel shows ₹ and names), CRLF line
 * ends, rows oldest first, amounts in rupees with 2 decimals.
 */
export function reportToCsv(report) {
  const rows = [
    ...report.expenses.map((e) => ({
      sortKey: `${e.date}|0|${String(e.expenseId).padStart(12, '0')}`,
      cells: [
        e.date,
        e.groupName,
        'expense',
        e.description,
        e.payer.name,
        paiseToRupeesString(e.amountPaise),
        e.mySharePaise ? paiseToRupeesString(e.mySharePaise) : '',
        e.splitMethod,
      ],
    })),
    ...report.settlements.map((s) => ({
      sortKey: `${s.date}|1|${String(s.settlementId).padStart(12, '0')}`,
      cells: [
        s.date,
        s.groupName,
        'settlement',
        s.note ?? `Payment to ${s.to.name}`,
        s.from.name,
        paiseToRupeesString(s.amountPaise),
        '',
        '',
      ],
    })),
  ].sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));

  const lines = [HEADER, ...rows.map((r) => r.cells)].map((cells) => cells.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
