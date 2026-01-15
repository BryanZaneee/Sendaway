const MAX_VIDEO_DURATION_SECONDS = 180; // 3 minutes
const ALLOWED_VIDEO_TYPES = ['video/webm', 'video/mp4', 'video/quicktime'];

export interface VideoValidationResult {
  valid: boolean;
  duration: number;
  size: number;
  error?: string;
}

/**
 * Get video duration using HTML5 video element metadata
 */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Could not load video metadata'));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Validate video file type, duration, and optionally size against remaining storage
 */
export async function validateVideo(
  file: File,
  remainingStorageBytes?: number
): Promise<VideoValidationResult> {
  // Check file type
  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return {
      valid: false,
      duration: 0,
      size: file.size,
      error: 'Invalid file type. Please use WebM, MP4, or MOV.'
    };
  }

  // Check duration
  let duration: number;
  try {
    duration = await getVideoDuration(file);
  } catch {
    return {
      valid: false,
      duration: 0,
      size: file.size,
      error: 'Could not read video file. Please try a different file.'
    };
  }

  if (duration > MAX_VIDEO_DURATION_SECONDS) {
    const minutes = Math.floor(duration / 60);
    const seconds = Math.round(duration % 60);
    return {
      valid: false,
      duration,
      size: file.size,
      error: `Video is ${minutes}:${seconds.toString().padStart(2, '0')} long. Maximum is 3:00.`
    };
  }

  // Check storage quota if provided
  if (remainingStorageBytes !== undefined && file.size > remainingStorageBytes) {
    const remainingMB = Math.round(remainingStorageBytes / 1024 / 1024);
    const fileMB = Math.round(file.size / 1024 / 1024);
    return {
      valid: false,
      duration,
      size: file.size,
      error: `File is ${fileMB}MB but you only have ${remainingMB}MB storage remaining.`
    };
  }

  return {
    valid: true,
    duration,
    size: file.size
  };
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format duration in seconds to mm:ss
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
