# Components

Vanilla TypeScript components for the FtrMsg single-page application.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Vite + TS)                    │
├─────────────────────────────────────────────────────────────┤
│  index.html                                                 │
│    ├── Hero (message form) - always visible                │
│    ├── Landing sections - hidden after login               │
│    └── Your Messages dashboard - shown after login          │
│         └── Message cards (locked/unlocked)                │
│              └── Locked detail view (countdown)            │
└─────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

- **toast.ts**: Standalone notification system (no parent)
- **form-handler.ts**: Attached to hero message form
- **auth-modal.ts**: Triggered by "Sign In" button or protected actions
- **plan-modal.ts**: Triggered by "Go Pro" button or free tier limit reached
- **messages-dashboard.ts**: Replaces landing page content after sign-in
  - Renders message cards with locked/unlocked states
  - Pagination controls for large message lists
- **message-detail.ts**: Modal opened by clicking message card
  - Locked state: Shows countdown timer (updates every 1 second)
  - Unlocked state: Shows full message text + video player with download option

## Data Flow

**Message Submission Flow:**
1. User fills form → form-handler.ts validates input
2. If not signed in → auth-modal.ts opens
3. If free tier limit reached → plan-modal.ts opens
4. Upload video to Supabase Storage (if attached)
5. Insert message record (status='pending')
6. If free tier: Optimistically lock free_message_used flag (race condition detection)
7. Update storage_used via RPC (if video attached)
8. **Compensating transaction:** If RPC fails, delete uploaded video + message record

**Dashboard Flow:**
1. User signs in → messages-dashboard.ts fetches user's messages
2. Display cards with locked/unlocked visual states
3. Locked cards show "🔒 Locked until [date]"
4. Unlocked cards show message preview (first 100 chars)

**Message Detail Flow:**
1. User clicks card → message-detail.ts modal opens
2. **Locked:** Show countdown timer (client-side, updates every 1s via setInterval)
3. **Unlocked:** Generate signed URL (cached 7 days) → Show video player with download link
4. On modal close: clearInterval() to prevent memory leaks

**Payment Flow:**
1. User clicks "Go Pro" → plan-modal.ts opens
2. Click checkout → POST to create-checkout Edge Function
3. Redirect to Stripe Checkout → User completes payment
4. Stripe webhook → Edge Function updates profiles.tier to 'pro'
5. User returns to app → Dashboard reflects Pro status

## State Management

- **Services (singletons)**: Maintain global state consistency
  - supabase.ts: Supabase client
  - auth.ts: Authentication state
- **Component state**: Local to each component instance
  - Modal visibility: show()/hide() methods
  - Countdown timers: setInterval stored in instance property
  - Video URL cache: signedUrl and urlExpiresAt stored in modal instance

## Styling

All components use neo-brutalist design system:
- High contrast borders (3px black)
- Pastel background colors
- Bold typography
- Box shadows for depth

## Invariants

- Messages can only be deleted while status='pending' (enforced by RLS)
- Countdown timer cleanup: clearInterval() in modal hide() method prevents memory leaks
- Video URL caching: Store signedUrl and urlExpiresAt in modal instance → regenerate if urlExpiresAt < now → reduces Supabase API calls during single viewing session
- Video missing fallback: Show "Video unavailable" error if video fetch fails, don't break message display
- Free message optimistic locking: messageService uses `UPDATE profiles SET free_message_used = true WHERE id = ? AND free_message_used = false RETURNING *` to detect race conditions. If 0 rows updated, rollback message creation.
- Storage quota compensating transaction: If update_storage_used RPC fails after video upload, messageService deletes uploaded video via storage API and deletes message record. Structured log on double-failure.

## Tradeoffs

- Client-side countdown: Real-time updates vs. potential clock drift (acceptable trade for reduced server load)
- Integrated dashboard: More complex index.html vs. separate page routing (single-page experience preferred)
- Modal-based detail views: Consistent with existing auth/plan modals vs. separate pages
- setInterval cleanup on modal close: Standard memory leak prevention pattern
- Delete confirmation: native confirm() (simplest) vs. custom modal (added complexity)
- Video URL caching in modal: Cache persists across hide/show calls within same modal instance lifecycle, cleared only on app close/reload
- 1-second countdown interval: Balances smoothness (100ms too frequent for performance) with UX (5s too slow)
