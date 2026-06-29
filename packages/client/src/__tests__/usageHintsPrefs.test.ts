import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  USAGE_HINTS_STORAGE_KEY,
  dismissUsageHint,
  getUsageHintsPrefs,
  isUsageHintVisible,
  resetDismissedUsageHints,
  scopedHintId,
  setUsageHintsEnabled,
} from '../lib/usageHintsPrefs.js';

describe('usageHintsPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to enabled with no dismissals', () => {
    expect(getUsageHintsPrefs()).toEqual({ enabled: true, dismissed: {} });
    expect(isUsageHintVisible('createTrip')).toBe(true);
  });

  it('scopes hint ids per user', () => {
    expect(scopedHintId('user-1', 'createTrip')).toBe('user-1:createTrip');
    expect(scopedHintId(undefined, 'createTrip')).toBe('createTrip');
  });

  it('persists dismissals', () => {
    dismissUsageHint('createTrip');
    expect(isUsageHintVisible('createTrip')).toBe(false);
    expect(getUsageHintsPrefs().dismissed['createTrip']).toBe(true);
    expect(localStorage.getItem(USAGE_HINTS_STORAGE_KEY)).toContain('createTrip');
  });

  it('hides all hints when disabled', () => {
    dismissUsageHint('createTrip');
    setUsageHintsEnabled(false);
    expect(isUsageHintVisible('firstEntry')).toBe(false);
    expect(getUsageHintsPrefs().dismissed['createTrip']).toBe(true);
  });

  it('shows hints again after re-enabling', () => {
    dismissUsageHint('createTrip');
    setUsageHintsEnabled(false);
    setUsageHintsEnabled(true);
    expect(isUsageHintVisible('createTrip')).toBe(false);
    expect(isUsageHintVisible('firstEntry')).toBe(true);
  });

  it('clears dismissals on reset', () => {
    dismissUsageHint('createTrip');
    dismissUsageHint('firstEntry');
    resetDismissedUsageHints();
    expect(getUsageHintsPrefs().dismissed).toEqual({});
    expect(isUsageHintVisible('createTrip')).toBe(true);
  });

  it('recovers from invalid stored JSON', () => {
    localStorage.setItem(USAGE_HINTS_STORAGE_KEY, '{not json');
    expect(getUsageHintsPrefs()).toEqual({ enabled: true, dismissed: {} });
  });
});
