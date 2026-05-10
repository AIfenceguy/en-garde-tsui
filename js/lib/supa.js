// Thin wrapper around the Supabase JS client.
// Loaded from esm.sh so we can run zero-build vanilla JS.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'en-garde-tsui-auth'
    },
    global: {
        headers: { 'x-client-info': 'en-garde-tsui-web/2.0' }
    }
});

export function isConfigured() {
    return SUPABASE_URL && !SUPABASE_URL.includes('YOUR-PROJECT-REF') && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'YOUR-ANON-KEY';
}
