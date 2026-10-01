// One function per endpoint in API_CONTRACT.md, grouped by module (ADR-014).
// Every function takes an optional `{ signal }` last, for cancellation.
import { apiFetch, apiUrl } from './client.js';

const get = (path, query, opts) => apiFetch(path, { query, ...opts });
const post = (path, body, opts) => apiFetch(path, { method: 'POST', body: body ?? {}, ...opts });
const put = (path, body, opts) => apiFetch(path, { method: 'PUT', body, ...opts });
const patch = (path, body, opts) => apiFetch(path, { method: 'PATCH', body, ...opts });
const del = (path, query, opts) => apiFetch(path, { method: 'DELETE', query, ...opts });

// Login-related calls handle 401 themselves (wrong password ≠ session expired).
const noRedirect = { handleUnauthorized: false };

export const authApi = {
  signup: (body, opts) => post('/auth/signup', body, { ...noRedirect, ...opts }), // A1 — logs in
  login: (body, opts) => post('/auth/login', body, { ...noRedirect, ...opts }), // A4
  googleStartUrl: () => apiUrl('/auth/google/start'), // A5 — navigate, don't fetch
  logout: (opts) => post('/auth/logout', {}, { ...noRedirect, ...opts }), // A7
  me: (opts) => get('/auth/me', undefined, { ...noRedirect, ...opts }), // A8
};

export const profileApi = {
  update: (body, opts) => patch('/me', body, opts), // P1
  changePassword: (body, opts) => post('/me/password', body, opts), // P2
  deleteAccount: (opts) => del('/me', undefined, opts), // P3
};

export const usersApi = {
  search: ({ q, groupId }, opts) => get('/users/search', { q, groupId }, opts), // U1
};

export const dashboardApi = {
  get: (opts) => get('/dashboard', undefined, opts), // D1
};

export const groupsApi = {
  list: (opts) => get('/groups', undefined, opts), // G1
  create: (body, opts) => post('/groups', body, opts), // G2
  get: (groupId, opts) => get(`/groups/${groupId}`, undefined, opts), // G3
  update: (groupId, body, opts) => patch(`/groups/${groupId}`, body, opts), // G4
  remove: (groupId, { confirm = false } = {}, opts) =>
    del(`/groups/${groupId}`, confirm ? { confirm: 'true' } : undefined, opts), // G5
  addMember: (groupId, userId, opts) => post(`/groups/${groupId}/members`, { userId }, opts), // M1
  removeMember: (groupId, membershipId, opts) =>
    del(`/groups/${groupId}/members/${membershipId}`, undefined, opts), // M2
  leave: (groupId, body = {}, opts) => post(`/groups/${groupId}/leave`, body, opts), // M3
};

export const balancesApi = {
  get: (groupId, opts) => get(`/groups/${groupId}/balances`, undefined, opts), // B1
  breakdown: (groupId, a, b, opts) => get(`/groups/${groupId}/balances/breakdown`, { a, b }, opts), // B2
};

export const expensesApi = {
  list: (groupId, query, opts) => get(`/groups/${groupId}/expenses`, query, opts), // E1
  create: (groupId, body, opts) => post(`/groups/${groupId}/expenses`, body, opts), // E2
  get: (groupId, expenseId, opts) =>
    get(`/groups/${groupId}/expenses/${expenseId}`, undefined, opts), // E3
  update: (groupId, expenseId, body, opts) =>
    put(`/groups/${groupId}/expenses/${expenseId}`, body, opts), // E4
  remove: (groupId, expenseId, opts) =>
    del(`/groups/${groupId}/expenses/${expenseId}`, undefined, opts), // E5
  history: (groupId, expenseId, opts) =>
    get(`/groups/${groupId}/expenses/${expenseId}/history`, undefined, opts), // E6
};

export const settlementsApi = {
  list: (groupId, query, opts) => get(`/groups/${groupId}/settlements`, query, opts), // S1
  create: (groupId, body, opts) => post(`/groups/${groupId}/settlements`, body, opts), // S2
  get: (groupId, settlementId, opts) =>
    get(`/groups/${groupId}/settlements/${settlementId}`, undefined, opts), // S3
  update: (groupId, settlementId, body, opts) =>
    put(`/groups/${groupId}/settlements/${settlementId}`, body, opts), // S4
  remove: (groupId, settlementId, opts) =>
    del(`/groups/${groupId}/settlements/${settlementId}`, undefined, opts), // S5
  history: (groupId, settlementId, opts) =>
    get(`/groups/${groupId}/settlements/${settlementId}/history`, undefined, opts), // S6
};

export const activityApi = {
  list: (groupId, query, opts) => get(`/groups/${groupId}/activity`, query, opts), // AC1
};

export const notificationsApi = {
  list: (query, opts) => get('/notifications', query, opts), // N1
  unreadCount: (opts) => get('/notifications/unread-count', undefined, opts), // N2
  markRead: (notificationId, opts) => post(`/notifications/${notificationId}/read`, {}, opts), // N3
  markAllRead: (opts) => post('/notifications/read-all', {}, opts), // N4
};

export const reportsApi = {
  get: (query, opts) => get('/reports', query, opts), // R1
  csvUrl: (query) => apiUrl('/reports/csv', query), // R2 — navigate to download
};
