-- FtrMsg Storage Configuration
-- Create bucket for video messages

-- ============================================
-- CREATE STORAGE BUCKET
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-videos',
  'message-videos',
  false,  -- Private bucket - requires signed URLs
  2147483648,  -- 2GB max file size
  ARRAY['video/webm', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================
-- STORAGE POLICIES
-- ============================================

-- Users can upload videos to their own folder
CREATE POLICY "Users can upload to own folder"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'message-videos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can read their own videos
CREATE POLICY "Users can read own videos"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'message-videos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own videos
CREATE POLICY "Users can delete own videos"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'message-videos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Service role can read any video (for delivery)
-- Note: Service role automatically bypasses RLS
