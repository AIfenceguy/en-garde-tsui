// Thin wrapper around the Supabase JS client.
//
// Vendored rather than loaded from esm.sh. The service worker only caches
// same-origin requests, so a third-party CDN import meant the app could not
// boot at all without a working connection to esm.sh - which made the offline
// shell a promise it could not keep, at exactly the venues it was built for.
// Pinned at 2.45.4, the same version that was being fetched.

import { createClient } from '../vendor/supabase-js.js';
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
