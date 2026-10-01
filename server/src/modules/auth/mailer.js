import { logger } from '../../logger.js';
import { nowIso } from '../../lib/time.js';

const OUTBOX_LIMIT = 50;

/**
 * Local-only mailer (ADR-006): verification links are written to the log and kept
 * in an in-memory outbox served by GET /api/dev/outbox. A real SMTP mailer would
 * implement the same `send` method.
 */
export function createConsoleMailer() {
  const outbox = [];
  return {
    outbox,
    /** @param {{ to: string, purpose: string, link: string }} message */
    send({ to, purpose, link }) {
      logger.info({ to, purpose, link }, 'verification email (console mailer)');
      outbox.unshift({ to, purpose, link, createdAt: nowIso() });
      outbox.length = Math.min(outbox.length, OUTBOX_LIMIT);
    },
  };
}
