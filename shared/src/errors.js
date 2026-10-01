// Error code catalog (API_CONTRACT §12). The server uses `status` for the HTTP response;
// the client uses `message` as the default user-facing text for each code.

export const ERRORS = Object.freeze({
  VALIDATION_ERROR: { status: 400, message: 'Please fix the highlighted fields.' },
  FUTURE_DATE: { status: 400, message: 'Date cannot be in the future.' },
  SPLIT_SUM_MISMATCH: { status: 400, message: 'Amounts must add up to the total.' },
  PERCENT_SUM_MISMATCH: { status: 400, message: 'Percentages must add up to 100%.' },
  SPLIT_METHOD_LOCKED: { status: 400, message: "Split method can't be changed." },
  GROUP_MIN_MEMBERS: { status: 400, message: 'Add at least one other member.' },
  USER_NOT_ELIGIBLE: { status: 400, message: "This person can't be added." },
  INVALID_NEW_ADMIN: { status: 400, message: 'Choose another active member as admin.' },
  SAME_PARTY: { status: 400, message: 'Pick two different people.' },
  WRONG_PASSWORD: { status: 400, message: 'Current password is incorrect.' },
  UNAUTHENTICATED: { status: 401, message: 'Please log in.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Email or password is incorrect.' },
  FORBIDDEN: { status: 403, message: "You don't have permission to do that." },
  NOT_SETTLEMENT_PARTY: { status: 403, message: 'Only the two people involved can do this.' },
  NOT_FOUND: { status: 404, message: "This isn't available." },
  EMAIL_ALREADY_REGISTERED: { status: 409, message: 'An account with this email already exists.' },
  NO_PASSWORD_METHOD: { status: 409, message: 'You sign in with Google. No password is set.' },
  ALREADY_MEMBER: { status: 409, message: 'Already a member of this group.' },
  BALANCE_NOT_ZERO: { status: 409, message: 'Balance must be ₹0.00 first.' },
  CANNOT_REMOVE_SELF: { status: 409, message: 'Use "Leave group" to leave as admin.' },
  ADMIN_MUST_CHOOSE: { status: 409, message: 'Choose a new admin or delete the group.' },
  PAYER_NOT_ACTIVE: { status: 409, message: 'The payer is no longer in this group.' },
  PARTICIPANT_NOT_ACTIVE: { status: 409, message: 'Someone selected is no longer in this group.' },
  INVOLVES_DEPARTED_MEMBER: {
    status: 409,
    message: "Can't be changed because someone involved has left the group.",
  },
  EXPENSE_DELETED: { status: 409, message: 'This expense was deleted.' },
  SETTLEMENT_DELETED: { status: 409, message: 'This payment was deleted.' },
  CONFIRMATION_REQUIRED: { status: 409, message: 'Please confirm to continue.' },
  RATE_LIMITED: { status: 429, message: 'Too many attempts. Try again shortly.' },
  INTERNAL: { status: 500, message: 'Something went wrong. Please try again.' },
});

/** Reasons carried in `details.reason` of CONFIRMATION_REQUIRED (API_CONTRACT §1.3). */
export const CONFIRMATION_REASONS = Object.freeze({
  SETTLEMENT_EXISTS: 'SETTLEMENT_EXISTS',
  OVERPAYMENT: 'OVERPAYMENT',
  GROUP_HAS_BALANCES: 'GROUP_HAS_BALANCES',
  GROUP_DELETE: 'GROUP_DELETE',
});

/**
 * Error thrown by server services and rebuilt by the client network layer.
 * Carries the catalog code plus optional `details` / `fieldErrors`.
 */
export class AppError extends Error {
  /**
   * @param {keyof typeof ERRORS} code
   * @param {{ message?: string, details?: object, fieldErrors?: Record<string,string> }} [extra]
   */
  constructor(code, { message, details, fieldErrors } = {}) {
    const entry = ERRORS[code] ?? ERRORS.INTERNAL;
    super(message ?? entry.message);
    this.name = 'AppError';
    this.code = ERRORS[code] ? code : 'INTERNAL';
    this.status = entry.status;
    this.details = details;
    this.fieldErrors = fieldErrors;
  }
}
