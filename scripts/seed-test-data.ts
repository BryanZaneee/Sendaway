/**
 * Seed script for creating test data in Sendaway
 *
 * Usage: npx tsx scripts/seed-test-data.ts
 *
 * This script will:
 * 1. Sign up or sign in a test user
 * 2. Create various test messages with different scenarios
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env.local
function loadEnv(): Record<string, string> {
  const envPath = join(__dirname, '..', '.env.local');
  try {
    const content = readFileSync(envPath, 'utf-8');
    const env: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
    return env;
  } catch (err) {
    console.error('Error loading .env.local:', err);
    process.exit(1);
  }
}

const env = loadEnv();

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Test user credentials - can be overridden via environment variables
const TEST_EMAIL = process.env.TEST_EMAIL || 'sendaway.test+user1@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!';

// Helper to add/subtract days from today
function dateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD format
}

// Generate a random UUID for delivery token
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Test message scenarios
const testMessages = [
  {
    description: 'Long text message (card truncation test)',
    message_text: `Dear Future Self,

I hope this message finds you well. I'm writing this on a beautiful day, thinking about all the goals we've set for ourselves. Remember that dream we had about traveling to Japan? By now, you should have made some progress on learning Japanese. If not, don't be too hard on yourself - life has a way of changing our plans.

The important thing is that you're still moving forward, still growing, still learning. Keep being curious and kind.

With love,
Your Past Self`,
    scheduled_date: dateOffset(30),
    status: 'pending' as const,
    video_storage_path: null,
    video_size_bytes: 0,
    video_duration_seconds: 0,
  },
  {
    description: 'Short message (near-future countdown)',
    message_text: 'Remember to call Mom for her birthday! She would love to hear from you.',
    scheduled_date: dateOffset(3),
    status: 'pending' as const,
    video_storage_path: null,
    video_size_bytes: 0,
    video_duration_seconds: 0,
  },
  {
    description: 'Video message (video indicator test)',
    message_text: 'I recorded a special video message for you. Watch it when you need some motivation!',
    scheduled_date: dateOffset(14),
    status: 'pending' as const,
    video_storage_path: 'videos/test-video-placeholder.mp4',
    video_size_bytes: 15728640, // ~15MB
    video_duration_seconds: 45,
  },
  {
    description: 'Delivered message (unlocked state)',
    message_text: 'This message has already been delivered! Hope you enjoyed reading it.',
    scheduled_date: dateOffset(-7),
    status: 'delivered' as const,
    video_storage_path: null,
    video_size_bytes: 0,
    video_duration_seconds: 0,
    delivered_at: dateOffset(-7) + 'T10:00:00.000Z',
  },
  {
    description: 'Unlocks today (zero countdown edge case)',
    message_text: 'This message should unlock today! Check if the countdown shows correctly.',
    scheduled_date: dateOffset(0),
    status: 'pending' as const,
    video_storage_path: null,
    video_size_bytes: 0,
    video_duration_seconds: 0,
  },
  {
    description: 'Failed delivery (error state)',
    message_text: 'This message failed to deliver due to an error. Testing error state display.',
    scheduled_date: dateOffset(-3),
    status: 'failed' as const,
    video_storage_path: null,
    video_size_bytes: 0,
    video_duration_seconds: 0,
  },
];

async function signInOrSignUp(): Promise<string> {
  console.log(`\nAttempting to sign in as ${TEST_EMAIL}...`);

  // Try to sign in first
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (signInData.user) {
    console.log(`Signed in successfully as ${signInData.user.email}`);
    return signInData.user.id;
  }

  if (signInError) {
    console.log(`Sign in error: ${signInError.message}`);

    // If email not confirmed, show instructions
    if (signInError.message.toLowerCase().includes('confirm')) {
      console.log('\n--- EMAIL CONFIRMATION REQUIRED ---');
      console.log('The test user exists but email is not confirmed.');
      console.log('');
      console.log('Option 1: Disable email confirmation (recommended for dev):');
      console.log('  1. Go to Supabase Dashboard > Authentication > Providers > Email');
      console.log('  2. Toggle OFF "Confirm email"');
      console.log('  3. Run this script again');
      console.log('');
      console.log('Option 2: Manually confirm the user:');
      console.log('  1. Go to Supabase Dashboard > Authentication > Users');
      console.log(`  2. Find ${TEST_EMAIL}`);
      console.log('  3. Click the three dots menu > "Confirm user"');
      console.log('  4. Run this script again');
      process.exit(1);
    }
  }

  // If sign in fails for other reasons, try to sign up
  console.log('Attempting to sign up new user...');
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (signUpError) {
    console.error('Sign up failed:', signUpError.message);

    // Check if rate limited
    if (signUpError.message.includes('security') || signUpError.message.includes('seconds')) {
      console.log('\n--- RATE LIMITED ---');
      console.log('Supabase has rate limits on auth requests.');
      console.log('Wait a minute and try again.');
    }
    process.exit(1);
  }

  if (!signUpData.user) {
    console.error('No user returned from sign up');
    process.exit(1);
  }

  console.log(`Signed up successfully as ${signUpData.user.email}`);

  // Check if email confirmation is needed
  if (signUpData.user.email_confirmed_at === null) {
    console.log('\n--- EMAIL CONFIRMATION REQUIRED ---');
    console.log('The user was created but email confirmation is pending.');
    console.log('');
    console.log('To proceed, either:');
    console.log('  1. Disable email confirmation in Supabase Dashboard (see above)');
    console.log('  2. Or manually confirm the user in Supabase Dashboard > Auth > Users');
    console.log('');
    console.log('Then run this script again.');
    process.exit(1);
  }

  return signUpData.user.id;
}

async function deleteExistingTestMessages(userId: string): Promise<void> {
  console.log('\nDeleting existing test messages...');

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting existing messages:', error.message);
    // Continue anyway - there might not be any existing messages
  } else {
    console.log('Existing messages deleted (if any)');
  }
}

async function createTestMessages(userId: string): Promise<void> {
  console.log('\nCreating test messages...\n');

  for (const msg of testMessages) {
    const { description, ...messageData } = msg;

    const insertData = {
      ...messageData,
      user_id: userId,
      delivery_email: TEST_EMAIL,
      delivery_token: generateUUID(),
    };

    const { data, error } = await supabase
      .from('messages')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error(`  [FAILED] ${description}`);
      console.error(`           Error: ${error.message}`);
    } else {
      console.log(`  [OK] ${description}`);
      console.log(`       ID: ${data.id}, Status: ${data.status}, Date: ${data.scheduled_date}`);
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Sendaway Test Data Seeder');
  console.log('='.repeat(60));
  console.log(`\nSupabase URL: ${supabaseUrl}`);

  try {
    // Sign in or create test user
    const userId = await signInOrSignUp();

    // Delete existing test messages (for idempotency)
    await deleteExistingTestMessages(userId);

    // Create new test messages
    await createTestMessages(userId);

    console.log('\n' + '='.repeat(60));
    console.log('Seeding complete!');
    console.log('='.repeat(60));
    console.log(`\nTest account credentials:`);
    console.log(`  Email:    ${TEST_EMAIL}`);
    console.log(`  Password: ${TEST_PASSWORD}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Run: npm run dev`);
    console.log(`  2. Open: http://localhost:5173`);
    console.log(`  3. Sign in with the test account`);
    console.log(`  4. Verify the UI displays the test messages correctly`);

  } catch (err) {
    console.error('\nUnexpected error:', err);
    process.exit(1);
  }
}

main();
