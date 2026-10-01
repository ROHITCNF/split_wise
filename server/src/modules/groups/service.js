import { eq } from 'drizzle-orm';
import { AppError, CONFIRMATION_REASONS } from '@splitbook/shared';
import { groups, memberships } from '../../db/schema.js';
import { nowIso } from '../../lib/time.js';
import { withTransaction } from '../../lib/transaction.js';
import { memberNet, pairBalances } from '../balances/service.js';
import { recordActivity } from '../history/writers.js';
import { notify } from '../notifications/notify.js';
import {
  activeMembership,
  activeMembershipOfUser,
  eligibleUsers,
  groupsOfUser,
  membershipsOfGroup,
} from './repository.js';

const firstName = (name) => name.split(' ')[0];

/** MemberRef (API_CONTRACT §1.4). */
export function toMemberRef(m) {
  return { membershipId: m.membershipId, userId: m.userId, name: m.name, status: m.status };
}

/** Net per membership from the pairwise balances: > 0 owed to them, < 0 they owe. */
function netsByMembership(ctx, groupId) {
  const nets = new Map();
  for (const p of pairBalances(ctx, groupId)) {
    nets.set(p.toMembershipId, (nets.get(p.toMembershipId) ?? 0) + p.amountPaise);
    nets.set(p.fromMembershipId, (nets.get(p.fromMembershipId) ?? 0) - p.amountPaise);
  }
  return nets;
}

/** Non-zero pairs as MemberRefs, for confirmation dialogs. */
function balancePairs(ctx, groupId) {
  const byId = new Map(
    membershipsOfGroup(ctx, groupId).map((m) => [m.membershipId, toMemberRef(m)]),
  );
  return pairBalances(ctx, groupId).map((p) => ({
    from: byId.get(p.fromMembershipId),
    to: byId.get(p.toMembershipId),
    amountPaise: p.amountPaise,
  }));
}

function assertZeroBalance(ctx, groupId, membershipId, message) {
  const netPaise = memberNet(ctx, groupId, membershipId);
  if (netPaise !== 0) throw new AppError('BALANCE_NOT_ZERO', { message, details: { netPaise } });
}

/** Rejects users who are unverified, deleted, missing or the caller (USER_NOT_ELIGIBLE). */
function assertEligible(ctx, userIds, callerId) {
  const ok = new Set(eligibleUsers(ctx, userIds).map((u) => u.id));
  const bad = userIds.filter((id) => id === callerId || !ok.has(id));
  if (bad.length) throw new AppError('USER_NOT_ELIGIBLE', { details: { userIds: bad } });
}

function insertMembership(ctx, { groupId, userId, role, now }) {
  return Number(
    ctx.db.insert(memberships).values({ groupId, userId, role, joinedAt: now }).run()
      .lastInsertRowid,
  );
}

function endMembership(ctx, membershipId, { status, endedByMembershipId = null, now }) {
  ctx.db
    .update(memberships)
    .set({ status, endedAt: now, endedByMembershipId })
    .where(eq(memberships.id, membershipId))
    .run();
}

// ── Reads ────────────────────────────────────────────────────────────────

/** G1 */
export function listGroups(ctx, userId) {
  return groupsOfUser(ctx, userId).map((g) => ({
    groupId: g.groupId,
    name: g.name,
    description: g.description,
    myRole: g.myRole,
    memberCount: g.memberCount,
    myNetPaise: memberNet(ctx, g.groupId, g.membershipId),
    updatedAt: g.updatedAt,
  }));
}

/** G3 */
export function getGroupDetail(ctx, groupId, myMembershipId) {
  const group = ctx.db.select().from(groups).where(eq(groups.id, groupId)).get();
  const all = membershipsOfGroup(ctx, groupId);
  const nets = netsByMembership(ctx, groupId);
  const me = all.find((m) => m.membershipId === myMembershipId);

  return {
    groupId: group.id,
    name: group.name,
    description: group.description,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    me: { membershipId: me.membershipId, role: me.role, netPaise: nets.get(me.membershipId) ?? 0 },
    members: all
      .filter((m) => m.status === 'active')
      .map((m) => ({
        ...toMemberRef(m),
        email: m.email,
        role: m.role,
        joinedAt: m.joinedAt,
        endedAt: null,
        netPaise: nets.get(m.membershipId) ?? 0,
      })),
    pastMembers: all
      .filter((m) => m.status !== 'active')
      .map((m) => ({ ...toMemberRef(m), joinedAt: m.joinedAt, endedAt: m.endedAt })),
  };
}

// ── Commands (one transaction each, ADR-007) ─────────────────────────────

/** G2 — creator becomes admin; ≥ 1 other member (FR-GRP-01/02). Returns the new IDs. */
export function createGroup(ctx, user, { name, description, memberUserIds }) {
  if (memberUserIds.length === 0) throw new AppError('GROUP_MIN_MEMBERS');
  assertEligible(ctx, memberUserIds, user.id);

  return withTransaction(ctx, () => {
    const now = nowIso();
    const groupId = Number(
      ctx.db
        .insert(groups)
        .values({ name, description, createdByUserId: user.id, createdAt: now, updatedAt: now })
        .run().lastInsertRowid,
    );
    const adminId = insertMembership(ctx, { groupId, userId: user.id, role: 'admin', now });
    recordActivity(ctx, {
      groupId,
      actorMembershipId: adminId,
      type: 'group_created',
      subjectType: 'group',
      subjectId: groupId,
      summary: `${firstName(user.name)} created the group`,
    });

    for (const added of eligibleUsers(ctx, memberUserIds)) {
      const membershipId = insertMembership(ctx, {
        groupId,
        userId: added.id,
        role: 'member',
        now,
      });
      recordActivity(ctx, {
        groupId,
        actorMembershipId: adminId,
        type: 'member_added',
        subjectType: 'membership',
        subjectId: membershipId,
        summary: `${firstName(user.name)} added ${firstName(added.name)}`,
      });
    }
    notify(ctx, {
      recipientUserIds: memberUserIds,
      actorUserId: user.id,
      group: { id: groupId, name },
      type: 'added_to_group',
      entityType: 'group',
      entityId: groupId,
      message: `${firstName(user.name)} added you to ${name}`,
    });
    return { groupId, adminMembershipId: adminId };
  });
}

/** G4 — any member (FR-GRP-08). */
export function updateGroup(ctx, user, group, membership, changes) {
  withTransaction(ctx, () => {
    ctx.db
      .update(groups)
      .set({ ...changes, updatedAt: nowIso() })
      .where(eq(groups.id, group.id))
      .run();
    const parts = [];
    if (changes.name !== undefined && changes.name !== group.name)
      parts.push(`renamed the group to '${changes.name}'`);
    if (changes.description !== undefined && changes.description !== group.description) {
      parts.push('updated the description');
    }
    if (parts.length) {
      recordActivity(ctx, {
        groupId: group.id,
        actorMembershipId: membership.id,
        type: 'group_updated',
        subjectType: 'group',
        subjectId: group.id,
        summary: `${firstName(user.name)} ${parts.join(' and ')}`,
      });
    }
  });
}

/**
 * Hard-deletes the group and everything in it (FR-GRP-13/18). Members are notified
 * first; the cascade then sets those notifications' group_id to NULL (FR-NTF-05).
 */
function destroyGroup(ctx, user, group) {
  const recipients = membershipsOfGroup(ctx, group.id)
    .filter((m) => m.status === 'active')
    .map((m) => m.userId);
  notify(ctx, {
    recipientUserIds: recipients,
    actorUserId: user.id,
    group: { id: group.id, name: group.name },
    type: 'group_deleted',
    entityType: 'group',
    entityId: group.id,
    message: `${firstName(user.name)} deleted the group ${group.name}`,
  });
  ctx.db.delete(groups).where(eq(groups.id, group.id)).run();
}

/** G5 — admin only; confirmation needed while balances are open (E17). */
export function deleteGroup(ctx, user, group, { confirm }) {
  withTransaction(ctx, () => {
    const pairs = balancePairs(ctx, group.id);
    if (pairs.length && !confirm) {
      throw new AppError('CONFIRMATION_REQUIRED', {
        message: 'This group still has open balances.',
        details: { reason: CONFIRMATION_REASONS.GROUP_HAS_BALANCES, pairs },
      });
    }
    destroyGroup(ctx, user, group);
  });
}

/** M1 — admin adds a verified user; re-adding a past member creates a new membership (E18). */
export function addMember(ctx, user, group, adminMembership, userId) {
  assertEligible(ctx, [userId], user.id);
  return withTransaction(ctx, () => {
    if (activeMembershipOfUser(ctx, group.id, userId)) throw new AppError('ALREADY_MEMBER');
    const now = nowIso();
    const membershipId = insertMembership(ctx, { groupId: group.id, userId, role: 'member', now });
    const [added] = eligibleUsers(ctx, [userId]);
    recordActivity(ctx, {
      groupId: group.id,
      actorMembershipId: adminMembership.id,
      type: 'member_added',
      subjectType: 'membership',
      subjectId: membershipId,
      summary: `${firstName(user.name)} added ${firstName(added.name)}`,
    });
    notify(ctx, {
      recipientUserIds: [userId],
      actorUserId: user.id,
      group: { id: group.id, name: group.name },
      type: 'added_to_group',
      entityType: 'group',
      entityId: group.id,
      message: `${firstName(user.name)} added you to ${group.name}`,
    });
    return toMemberRef(
      membershipsOfGroup(ctx, group.id).find((m) => m.membershipId === membershipId),
    );
  });
}

/** M2 — admin removes another member with a zero balance (FR-GRP-10/20, E15, E28). */
export function removeMember(ctx, user, group, adminMembership, membershipId) {
  withTransaction(ctx, () => {
    const target = activeMembership(ctx, group.id, membershipId);
    if (!target) throw new AppError('NOT_FOUND');
    if (target.id === adminMembership.id) throw new AppError('CANNOT_REMOVE_SELF');
    assertZeroBalance(
      ctx,
      group.id,
      target.id,
      "This member's balance must be ₹0.00 before removal.",
    );

    endMembership(ctx, target.id, {
      status: 'removed',
      endedByMembershipId: adminMembership.id,
      now: nowIso(),
    });
    const [removed] = membershipsOfGroup(ctx, group.id).filter((m) => m.membershipId === target.id);
    recordActivity(ctx, {
      groupId: group.id,
      actorMembershipId: adminMembership.id,
      type: 'member_removed',
      subjectType: 'membership',
      subjectId: target.id,
      summary: `${firstName(user.name)} removed ${firstName(removed.name)}`,
    });
    notify(ctx, {
      recipientUserIds: [target.userId],
      actorUserId: user.id,
      group: { id: group.id, name: group.name },
      type: 'removed_from_group',
      entityType: 'group',
      entityId: group.id,
      message: `${firstName(user.name)} removed you from ${group.name}`,
    });
  });
}

/**
 * M3 — members leave with a zero balance (FR-GRP-09). Admins must choose:
 * transfer admin then leave, or leave and delete the group (FR-GRP-16..19).
 */
export function leaveGroup(ctx, user, group, membership, body) {
  withTransaction(ctx, () => {
    const now = nowIso();

    if (membership.role !== 'admin') {
      assertZeroBalance(ctx, group.id, membership.id, 'Settle up before leaving this group.');
      endMembership(ctx, membership.id, { status: 'left', now });
      recordActivity(ctx, {
        groupId: group.id,
        actorMembershipId: membership.id,
        type: 'member_left',
        subjectType: 'membership',
        subjectId: membership.id,
        summary: `${firstName(user.name)} left the group`,
      });
      return;
    }

    if (body.mode === 'transfer') {
      const next = activeMembership(ctx, group.id, body.newAdminMembershipId);
      if (!next || next.id === membership.id) throw new AppError('INVALID_NEW_ADMIN');
      assertZeroBalance(ctx, group.id, membership.id, 'Settle up before leaving this group.');

      // Old admin leaves first so the "one active admin" index is never violated.
      endMembership(ctx, membership.id, { status: 'left', now });
      ctx.db.update(memberships).set({ role: 'admin' }).where(eq(memberships.id, next.id)).run();

      const newAdmin = membershipsOfGroup(ctx, group.id).find((m) => m.membershipId === next.id);
      recordActivity(ctx, {
        groupId: group.id,
        actorMembershipId: membership.id,
        type: 'admin_transferred',
        subjectType: 'membership',
        subjectId: next.id,
        summary: `${firstName(user.name)} made ${firstName(newAdmin.name)} the admin`,
      });
      recordActivity(ctx, {
        groupId: group.id,
        actorMembershipId: membership.id,
        type: 'member_left',
        subjectType: 'membership',
        subjectId: membership.id,
        summary: `${firstName(user.name)} left the group`,
      });
      notify(ctx, {
        recipientUserIds: membershipsOfGroup(ctx, group.id)
          .filter((m) => m.status === 'active')
          .map((m) => m.userId),
        actorUserId: user.id,
        group: { id: group.id, name: group.name },
        type: 'admin_transferred',
        entityType: 'group',
        entityId: group.id,
        message: `${firstName(user.name)} left ${group.name} and made ${firstName(newAdmin.name)} the admin`,
      });
      return;
    }

    if (body.mode === 'delete') {
      if (!body.confirm) {
        const pairs = balancePairs(ctx, group.id);
        throw new AppError('CONFIRMATION_REQUIRED', {
          message: 'Leaving deletes this group and all its data for everyone.',
          details: pairs.length
            ? { reason: CONFIRMATION_REASONS.GROUP_HAS_BALANCES, pairs }
            : { reason: CONFIRMATION_REASONS.GROUP_DELETE },
        });
      }
      destroyGroup(ctx, user, group);
      return;
    }

    throw new AppError('ADMIN_MUST_CHOOSE');
  });
}
