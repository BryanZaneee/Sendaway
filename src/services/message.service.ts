import { supabase } from '../config/supabase';
import { authService } from './auth.service';
import type { Message } from '../types/database';

export interface CreateMessageData {
  messageText: string;
  scheduledDate: string;
  deliveryEmail: string;
  videoStoragePath?: string;
  videoSizeBytes?: number;
  videoDurationSeconds?: number;
}

export interface CreateMessageResult {
  success: boolean;
  message?: Message;
  error?: string;
}

class MessageService {
  /**
   * Create a new message
   */
  async createMessage(data: CreateMessageData): Promise<CreateMessageResult> {
    const user = authService.getUser();
    let profile = authService.getProfile();

    if (!user) {
      return { success: false, error: 'You must be logged in to send a message' };
    }

    // Profile may not be loaded yet (e.g. after OAuth redirect) — try refreshing
    if (!profile) {
      await authService.refreshProfile();
      profile = authService.getProfile();
    }

    if (!profile) {
      return { success: false, error: 'Unable to load your profile. Please try again.' };
    }

    // Check tier restrictions
    if (profile.tier === 'free') {
      // Free users can only send 1 message
      if (profile.free_message_used) {
        return {
          success: false,
          error: 'You have already used your free message. Upgrade to Pro for unlimited messages.'
        };
      }

      // Free users cannot attach videos
      if (data.videoStoragePath) {
        return {
          success: false,
          error: 'Video attachments are only available for Pro users.'
        };
      }
    }

    // Insert the message
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        user_id: user.id,
        message_text: data.messageText,
        scheduled_date: data.scheduledDate,
        delivery_email: data.deliveryEmail,
        video_storage_path: data.videoStoragePath || null,
        video_size_bytes: data.videoSizeBytes || 0,
        video_duration_seconds: data.videoDurationSeconds || 0,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating message:', error);
      return { success: false, error: 'Failed to create message. Please try again.' };
    }

    // If free tier, mark free message as used via RPC (bypasses profile field protection trigger)
    if (!profile.tier || profile.tier === 'free') {
      const { data: marked, error: rpcError } = await supabase.rpc('mark_free_message_used', {
        p_user_id: user.id,
      });

      if (rpcError) {
        console.error('Error marking free message used:', rpcError);
        await supabase.from('messages').delete().eq('id', message.id);
        return { success: false, error: 'Failed to send message. Please try again.' };
      }

      if (!marked) {
        await supabase.from('messages').delete().eq('id', message.id);
        return { success: false, error: 'Your free message has already been used. Upgrade to Pro for unlimited messages.' };
      }

      // Refresh profile to get updated state
      await authService.refreshProfile();
    }

    // If video was uploaded, update storage used
    if (data.videoStoragePath && data.videoSizeBytes) {
      try {
        const { error: storageError } = await supabase.rpc('update_storage_used', {
          p_user_id: user.id,
          p_delta_bytes: data.videoSizeBytes,
        });
        if (storageError) {
          throw storageError;
        }
      } catch (error) {
        // Compensating transaction: delete uploaded video
        const { error: deleteError } = await supabase.storage
          .from('message-videos')
          .remove([data.videoStoragePath]);

        if (deleteError) {
          console.error(JSON.stringify({
            event: 'COMPENSATING_DELETE_FAILED',
            message_id: message?.id,
            video_storage_path: data.videoStoragePath,
            storage_error: error instanceof Error ? error.message : 'Unknown',
            delete_error: deleteError.message,
          }));
        }

        // Also delete the message record since the transaction is incomplete
        if (message?.id) {
          await supabase.from('messages').delete().eq('id', message.id);
        }

        return { success: false, error: 'Failed to update storage quota. Please try again.' };
      }

      await authService.refreshProfile();
    }

    return { success: true, message };
  }

  /**
   * Cancel a pending message
   */
  async cancelMessage(messageId: string): Promise<{ success: boolean; error?: string }> {
    const user = authService.getUser();

    if (!user) {
      return { success: false, error: 'You must be logged in' };
    }

    // Get the message first to check ownership and get video info
    const { data: message, error: fetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single();

    if (fetchError || !message) {
      return { success: false, error: 'Message not found or cannot be cancelled' };
    }

    // Delete the message
    const { error: deleteError } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (deleteError) {
      return { success: false, error: 'Failed to cancel message' };
    }

    // If there was a video, delete it from storage and update usage
    if (message.video_storage_path) {
      try {
        const { error: storageDeleteError } = await supabase.storage
          .from('message-videos')
          .remove([message.video_storage_path]);

        if (storageDeleteError) {
          console.error('Failed to delete video from storage:', storageDeleteError);
        }

        const { error: rpcError } = await supabase.rpc('update_storage_used', {
          p_user_id: user.id,
          p_delta_bytes: -message.video_size_bytes
        });

        if (rpcError) {
          console.error('Failed to update storage quota:', rpcError);
        }
      } catch (error) {
        console.error('Error during video cleanup:', error);
      }

      await authService.refreshProfile();
    }

    // If free tier with free_message_used, reset the flag now that message is deleted
    const profile = authService.getProfile();
    if (profile && profile.tier === 'free' && profile.free_message_used) {
      const { error: resetError } = await supabase.rpc('reset_free_message_used', {
        p_user_id: user.id,
      });
      if (resetError) {
        console.error('Failed to reset free_message_used:', resetError);
      }
      await authService.refreshProfile();
    }

    return { success: true };
  }
}

export const messageService = new MessageService();
