import { describe, expect, it } from 'vitest';
import { APP_NAME } from './index.js';

describe('shared package', () => {
  it('exports the app name', () => {
    expect(APP_NAME).toBe('SplitBook');
  });
});
