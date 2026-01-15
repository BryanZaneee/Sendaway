import type { Message } from '../types/database';

/**
 * Returns true if scheduled_date <= today OR status='delivered'
 */
export function isMessageUnlocked(message: Message): boolean {
  const scheduledDate = new Date(message.scheduled_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return scheduledDate <= today || message.status === 'delivered';
}
