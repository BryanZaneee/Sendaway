import { supabase } from '../config/supabase';
import { authService } from './auth.service';
import { validateVideo, formatBytes, formatDuration } from '../utils/video-duration';

export interface UploadResult {
  success: boolean;
  path?: string;
  size?: number;
  duration?: number;
  error?: string;
}

class VideoService {
  /**
   * Validate and upload a video file
   */
  async uploadVideo(file: File): Promise<UploadResult> {
    const user = authService.getUser();
    const profile = authService.getProfile();

    if (!user || !profile) {
      return { success: false, error: 'You must be logged in to upload videos' };
    }

    // Check if user is pro
    if (profile.tier !== 'pro') {
      return { success: false, error: 'Video uploads are only available for Pro users' };
    }

    // Calculate remaining storage
    const remainingStorage = profile.storage_limit_bytes - profile.storage_used_bytes;

    // Validate video
    const validation = await validateVideo(file, remainingStorage);

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Generate unique file path
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('message-videos')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { success: false, error: 'Failed to upload video. Please try again.' };
    }

    return {
      success: true,
      path: filePath,
      size: validation.size,
      duration: validation.duration
    };
  }

  /**
   * Delete a video from storage
   */
  async deleteVideo(path: string): Promise<{ success: boolean; error?: string }> {
    const user = authService.getUser();

    if (!user) {
      return { success: false, error: 'You must be logged in' };
    }

    // Ensure user owns this file (path should start with their user id)
    if (!path.startsWith(`${user.id}/`)) {
      return { success: false, error: 'Unauthorized' };
    }

    const { error } = await supabase.storage
      .from('message-videos')
      .remove([path]);

    if (error) {
      console.error('Delete error:', error);
      return { success: false, error: 'Failed to delete video' };
    }

    return { success: true };
  }

  /**
   * Get a signed URL for viewing a video (used for delivered messages)
   */
  async getSignedUrl(path: string, expiresIn: number = 3600): Promise<string | null> {
    const { data, error } = await supabase.storage
      .from('message-videos')
      .createSignedUrl(path, expiresIn);

    if (error) {
      console.error('Signed URL error:', error);
      return null;
    }

    return data.signedUrl;
  }

  /**
   * Format storage info for display
   */
  getStorageInfo(): { used: string; limit: string; percent: number; remaining: string } {
    const profile = authService.getProfile();

    if (!profile) {
      return { used: '0 B', limit: '0 B', percent: 0, remaining: '0 B' };
    }

    const used = profile.storage_used_bytes;
    const limit = profile.storage_limit_bytes;
    const remaining = limit - used;
    const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;

    return {
      used: formatBytes(used),
      limit: formatBytes(limit),
      percent,
      remaining: formatBytes(remaining)
    };
  }
}

export const videoService = new VideoService();

// Re-export utility functions for convenience
export { formatBytes, formatDuration };
