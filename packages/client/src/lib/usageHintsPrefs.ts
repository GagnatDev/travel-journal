export const USAGE_HINTS_STORAGE_KEY = 'usageHints';
export const USAGE_HINTS_CHANGED_EVENT = 'usageHintsChanged';

export interface UsageHintsPrefs {
  enabled: boolean;
  dismissed: Record<string, true>;
}

const DEFAULT_PREFS: UsageHintsPrefs = {
  enabled: true,
  dismissed: {},
};

export function scopedHintId(userId: string | undefined, hintId: string): string {
  return userId ? `${userId}:${hintId}` : hintId;
}

function notifyUsageHintsChanged(): void {
  window.dispatchEvent(new Event(USAGE_HINTS_CHANGED_EVENT));
}

function parsePrefs(raw: string | null): UsageHintsPrefs {
  if (!raw) return { ...DEFAULT_PREFS, dismissed: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<UsageHintsPrefs>;
    return {
      enabled: parsed.enabled !== false,
      dismissed:
        parsed.dismissed != null && typeof parsed.dismissed === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.dismissed).filter(([, value]) => value === true),
            )
          : {},
    };
  } catch {
    return { ...DEFAULT_PREFS, dismissed: {} };
  }
}

function writePrefs(prefs: UsageHintsPrefs): void {
  localStorage.setItem(USAGE_HINTS_STORAGE_KEY, JSON.stringify(prefs));
  notifyUsageHintsChanged();
}

export function getUsageHintsPrefs(): UsageHintsPrefs {
  return parsePrefs(localStorage.getItem(USAGE_HINTS_STORAGE_KEY));
}

export function setUsageHintsEnabled(enabled: boolean): void {
  const prefs = getUsageHintsPrefs();
  writePrefs({ ...prefs, enabled });
}

export function dismissUsageHint(hintId: string): void {
  const prefs = getUsageHintsPrefs();
  if (prefs.dismissed[hintId]) return;
  writePrefs({
    ...prefs,
    dismissed: { ...prefs.dismissed, [hintId]: true },
  });
}

export function resetDismissedUsageHints(): void {
  const prefs = getUsageHintsPrefs();
  writePrefs({ ...prefs, dismissed: {} });
}

export function isUsageHintVisible(hintId: string): boolean {
  const prefs = getUsageHintsPrefs();
  return prefs.enabled && !prefs.dismissed[hintId];
}
