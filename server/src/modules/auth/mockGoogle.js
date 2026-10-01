/**
 * Mock Google identity provider (ADR-006). Implements the same two steps as a real
 * OIDC provider so the auth service doesn't know the difference:
 *   authorizeUrl → where to send the browser
 *   complete     → exchange the returned code for a verified identity
 * Always signs in one hardcoded dummy user.
 */
export const MOCK_GOOGLE_USER = Object.freeze({
  subject: 'mock-google-subject-0001',
  email: 'mock.user@gmail.com',
  name: 'Mock Google User',
});

const MOCK_CODE = 'mock-authorization-code';

export function createMockGoogleProvider() {
  return {
    /** Real provider: Google consent page. Mock: straight back to our callback. */
    authorizeUrl({ state, redirectUri }) {
      const params = new URLSearchParams({ code: MOCK_CODE, state });
      return `${redirectUri}?${params}`;
    },

    /** @returns {Promise<{ subject: string, email: string, name: string }>} */
    async complete({ code }) {
      if (code !== MOCK_CODE) throw new Error('Invalid authorization code');
      return { ...MOCK_GOOGLE_USER };
    },
  };
}
