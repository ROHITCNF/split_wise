// Split engine (DOMAIN_MODEL §4.1). Pure: used for the live preview in the client
// and as the source of truth on the server, so both always agree (ADR-010).

export const SPLIT_METHODS = ['equal', 'exact', 'percentage'];
const FULL_PERCENT_BP = 10000;

/**
 * @typedef {{ membershipId: number, valuePaise?: number, valueBp?: number }} ParticipantInput
 * @typedef {{ membershipId: number, sharePaise: number, inputPaise: number|null,
 *             inputBp: number|null, position: number }} Share
 * @typedef {{ ok: true, shares: Share[] }
 *         | { ok: false, code: string, details?: object, fieldErrors?: object }} SplitResult
 */

function invalid(field, message) {
  return { ok: false, code: 'VALIDATION_ERROR', fieldErrors: { [field]: message } };
}

function valueOf(participant, splitMethod) {
  if (splitMethod === 'exact') return participant.valuePaise ?? 0;
  if (splitMethod === 'percentage') return participant.valueBp ?? 0;
  return null;
}

/** Remainder goes to the payer if they participate, otherwise to the first participant. */
function absorberIndex(participants, payerMembershipId) {
  const payerIndex = participants.findIndex((p) => p.membershipId === payerMembershipId);
  return payerIndex === -1 ? 0 : payerIndex;
}

/**
 * Computes each participant's share of an expense.
 * Participants with a zero exact amount or 0% are treated as not participating (FR-SPL-04).
 * @param {{ amountPaise: number, splitMethod: string, payerMembershipId: number,
 *           participants: ParticipantInput[] }} input
 * @returns {SplitResult}
 */
export function computeShares({ amountPaise, splitMethod, payerMembershipId, participants }) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    return invalid('amountPaise', 'Amount must be greater than 0');
  }
  if (!SPLIT_METHODS.includes(splitMethod)) {
    return invalid('splitMethod', 'Unknown split method');
  }

  const ids = participants.map((p) => p.membershipId);
  if (new Set(ids).size !== ids.length) {
    return invalid('participants', 'Each person can appear only once');
  }

  const active = participants.filter((p) => splitMethod === 'equal' || valueOf(p, splitMethod) > 0);
  if (active.length === 0) {
    return invalid('participants', 'Choose at least one person to split with');
  }

  let raw;
  if (splitMethod === 'equal') {
    const perHead = Math.floor(amountPaise / active.length);
    raw = active.map(() => perHead);
  } else if (splitMethod === 'exact') {
    const sum = active.reduce((total, p) => total + p.valuePaise, 0);
    if (sum !== amountPaise) {
      return {
        ok: false,
        code: 'SPLIT_SUM_MISMATCH',
        details: { differencePaise: amountPaise - sum },
      };
    }
    raw = active.map((p) => p.valuePaise);
  } else {
    const sum = active.reduce((total, p) => total + p.valueBp, 0);
    if (sum !== FULL_PERCENT_BP) {
      return {
        ok: false,
        code: 'PERCENT_SUM_MISMATCH',
        details: { differenceBp: FULL_PERCENT_BP - sum },
      };
    }
    // BigInt so amount × basis points never loses precision.
    raw = active.map((p) =>
      Number((BigInt(amountPaise) * BigInt(p.valueBp)) / BigInt(FULL_PERCENT_BP)),
    );
  }

  const remainder = amountPaise - raw.reduce((total, value) => total + value, 0);
  raw[absorberIndex(active, payerMembershipId)] += remainder;

  if (raw.some((value) => value <= 0)) {
    return invalid('amountPaise', `Amount is too small to split among ${active.length} people`);
  }

  return {
    ok: true,
    shares: active.map((p, position) => ({
      membershipId: p.membershipId,
      sharePaise: raw[position],
      inputPaise: splitMethod === 'exact' ? p.valuePaise : null,
      inputBp: splitMethod === 'percentage' ? p.valueBp : null,
      position,
    })),
  };
}

/**
 * Live feedback while the form is being filled in (FR-SPL-06). Never fails;
 * missing values count as 0.
 */
export function splitSummary({ amountPaise, splitMethod, payerMembershipId, participants }) {
  if (splitMethod === 'exact') {
    const assigned = participants.reduce((total, p) => total + (p.valuePaise ?? 0), 0);
    return { remainingPaise: amountPaise - assigned };
  }
  if (splitMethod === 'percentage') {
    const assigned = participants.reduce((total, p) => total + (p.valueBp ?? 0), 0);
    return { remainingBp: FULL_PERCENT_BP - assigned };
  }
  const count = participants.length;
  if (count === 0) return { perHeadPaise: 0, remainderPaise: 0, absorberMembershipId: null };
  const perHeadPaise = Math.floor(amountPaise / count);
  return {
    perHeadPaise,
    remainderPaise: amountPaise - perHeadPaise * count,
    absorberMembershipId: participants[absorberIndex(participants, payerMembershipId)].membershipId,
  };
}
