export interface FormValidationResult {
  valid: boolean;
  errors: {
    message?: string;
    date?: string;
    email?: string;
  };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LENGTH = 4000;

/**
 * Validate the message form fields
 */
export function validateForm(
  messageText: string,
  scheduledDate: string,
  email: string
): FormValidationResult {
  const errors: FormValidationResult['errors'] = {};

  // Validate message
  const trimmedMessage = messageText.trim();
  if (!trimmedMessage) {
    errors.message = 'Please write a message';
  } else if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
    errors.message = `Message exceeds ${MAX_MESSAGE_LENGTH} characters`;
  }

  // Validate date
  if (!scheduledDate) {
    errors.date = 'Please select a delivery date';
  } else {
    const selectedDate = new Date(scheduledDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate <= today) {
      errors.date = 'Delivery date must be in the future';
    }
  }

  // Validate email
  if (!email) {
    errors.email = 'Please enter your email';
  } else if (!EMAIL_REGEX.test(email)) {
    errors.email = 'Please enter a valid email address';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Calculate a date N months from now in YYYY-MM-DD format
 */
export function getDateMonthsFromNow(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + months);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format a date string for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}
