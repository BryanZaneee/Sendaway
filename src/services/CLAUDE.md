# Services Index

| Service | What | When |
|---------|------|------|
| auth.service.ts | Manages authentication state, profile data, and subscription to auth changes | Initialize on app load, subscribe to auth state in components |
| message.service.ts | Creates messages with tier validation, optimistic locking for free tier, compensating transactions for storage quota failures | User submits message form |
| payment.service.ts | Creates Stripe checkout sessions for Pro upgrade | User clicks "Go Pro" button |
| video.service.ts | Uploads videos to Supabase Storage, validates size/duration, generates signed URLs | Pro user attaches video to message |
