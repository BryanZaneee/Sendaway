export interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Returns time remaining until targetDate as {days, hours, minutes, seconds}.
 * Returns all zeros if targetDate <= now.
 */
export function calculateCountdown(targetDate: Date): CountdownResult {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSeconds = Math.floor(diff / 1000);

  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

/**
 * Formats date as "Mon DD, YYYY"
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
