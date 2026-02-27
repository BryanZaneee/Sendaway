import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('Missing required env var: VITE_SUPABASE_URL');
}

if (!supabaseAnonKey) {
  throw new Error('Missing required env var: VITE_SUPABASE_ANON_KEY');
}

try {
  new URL(supabaseUrl);
} catch {
  throw new Error('Invalid VITE_SUPABASE_URL: must be a valid URL');
}

if (!supabaseAnonKey.startsWith('eyJ')) {
  throw new Error('Invalid VITE_SUPABASE_ANON_KEY: expected JWT-like value');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
