# Services

Singleton service layer for FtrMsg frontend. All services maintain global state and provide consistent APIs across components.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       SERVICES LAYER                        │
├─────────────────────────────────────────────────────────────┤
│  auth.service       │ Auth state + profile management       │
│  message.service    │ Message CRUD + tier enforcement       │
│  payment.service    │ Stripe checkout integration           │
│  video.service      │ Video upload + storage management     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE CLIENT                          │
│  Database, Auth, Storage, Edge Functions                    │
└─────────────────────────────────────────────────────────────┘
```

## Service Responsibilities

- **auth.service.ts**: Central authentication hub
  - Subscribes to Supabase auth state changes
  - Fetches and caches profile data in memory
  - Provides observer pattern for components (onAuthStateChange)
  - Exposes helper methods: isPro(), hasFreeMessageUsed(), getRemainingStorage()

- **message.service.ts**: Message lifecycle with transaction safety
  - Enforces tier restrictions (free users: 1 message, no video)
  - Uses optimistic locking for free message flag: `UPDATE profiles SET free_message_used = true WHERE id = ? AND free_message_used = false RETURNING *`
  - Compensating transaction: If storage quota RPC fails after video upload, deletes the uploaded video and message record
  - Rollback on race condition: If optimistic lock fails (no rows updated), deletes the just-created message

- **payment.service.ts**: Payment initiation only
  - Creates Stripe checkout session via create-checkout Edge Function
  - Validates user is not already Pro before creating checkout
  - Redirect handled by component layer

- **video.service.ts**: Video storage lifecycle
  - Pre-flight validation: tier check, storage quota check, file size/duration limits
  - Upload to Supabase Storage bucket 'message-videos'
  - Path structure: `{user_id}/{uuid}.{ext}` (isolates users, prevents collisions)
  - Signed URL generation for delivered messages (7-day expiry)

## Data Flow

**Message Creation Flow:**
1. Component calls messageService.createMessage()
2. Validate tier restrictions (free vs pro)
3. Insert message record (status='pending')
4. If free tier: Optimistically lock free_message_used flag
5. If lock fails (race condition): Delete message, return error
6. If video attached: Call storage quota RPC
7. If RPC fails: Delete video from storage + delete message (compensating transaction)
8. Return success with created message

**Auth State Flow:**
1. Supabase client emits auth change event
2. auth.service updates internal state (currentUser, currentProfile)
3. Notifies all registered listeners with new state
4. Components re-render with updated auth data

**Video Upload Flow:**
1. Component calls videoService.uploadVideo(file)
2. Validate: tier=pro, storage quota available, file size < remaining storage
3. Upload to Supabase Storage
4. Return path, size, duration to caller
5. Caller passes to messageService (which updates quota on message creation)

## State Management

All services are singletons exported as instances:
```typescript
export const authService = new AuthService();
export const messageService = new MessageService();
export const paymentService = new PaymentService();
export const videoService = new VideoService();
```

State lives in service instances, not components. Components read from services and subscribe to changes.

## Invariants

- Free tier message creation uses optimistic locking. Race condition detection: If `UPDATE ... WHERE free_message_used = false` returns 0 rows, another request won the race. Rollback message insertion.
- Storage quota compensating transaction: If `update_storage_used` RPC fails after video upload, immediately delete uploaded video via `supabase.storage.from('message-videos').remove([filePath])`, then delete message record. Structured log on double-failure: `{event: 'COMPENSATING_DELETE_FAILED', message_id, video_storage_path, storage_error, delete_error}`
- Auth state is eventually consistent. Profile refresh after mutations (message creation, video upload) ensures UI reflects latest quota/tier.
- Video ownership validation: All video operations verify path starts with `{user.id}/` to prevent cross-user access

## Tradeoffs

- In-memory profile cache vs. refetch on every check: Cache wins for reduced DB load, profile refreshed after mutations
- Optimistic locking for free message vs. database constraint: Optimistic locking provides better error messaging and compensates for message creation
- Compensating transaction vs. database transaction: Supabase RLS + Storage API don't support multi-resource transactions, manual compensation required
- Singleton pattern vs. dependency injection: Singletons simpler for small app, acceptable coupling
- Structured logging on compensation failure: Enables post-mortem analysis of orphaned storage without user-facing error complexity
