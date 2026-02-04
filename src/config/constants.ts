/**
 * Centralized constants for the FtrMsg application.
 * These values are shared between frontend and edge functions where applicable.
 */

// Storage limits
export const STORAGE_LIMIT_PRO_BYTES = 2147483648; // 2GB in bytes

// Pricing
export const PRO_UPGRADE_PRICE_CENTS = 900; // $9.00

// Message constraints
export const MESSAGE_TEXT_MAX_LENGTH = 4000;

// Video constraints
export const VIDEO_SIGNED_URL_EXPIRY_SECONDS = 604800; // 7 days

// Delivery batch processing
export const DELIVERY_BATCH_SIZE = 30;
export const DELIVERY_TIMEOUT_MS = 45000;
export const DELIVERY_RATE_LIMIT_MS = 1000;

// Log retention
export const LOG_RETENTION_DAYS = 90;
