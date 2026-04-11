import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';
import type { Entry } from '@travel-journal/shared';

export interface DayGroup {
  dayNumber: number | null;
  date: Date;
  locationSummary: string | undefined;
  entries: Entry[];
}

export function groupEntriesByDay(
  entries: Entry[],
  tripDepartureDate: string | undefined,
): DayGroup[] {
  const dayMap = new Map<string, Entry[]>();

  for (const entry of entries) {
    const date = startOfDay(parseISO(entry.createdAt));
    const key = date.toISOString();
    if (!dayMap.has(key)) {
      dayMap.set(key, []);
    }
    dayMap.get(key)!.push(entry);
  }

  // Sort keys newest-first
  const sortedKeys = Array.from(dayMap.keys()).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  );

  const departure = tripDepartureDate ? startOfDay(parseISO(tripDepartureDate)) : null;

  return sortedKeys.map((key) => {
    const date = new Date(key);
    const groupEntries = dayMap.get(key)!;

    // Sort entries newest-first within group
    groupEntries.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const dayNumber = departure ? differenceInCalendarDays(date, departure) + 1 : null;

    const locationSummary = groupEntries.find((e) => e.location?.name)?.location?.name;

    return {
      dayNumber,
      date,
      locationSummary,
      entries: groupEntries,
    };
  });
}
