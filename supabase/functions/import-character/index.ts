// Supabase Edge Function entry point (Deno). All logic is in ../_shared/import-handler.ts.
import { handleImport } from '../_shared/import-handler.ts';

/** The project's publishable key, which Supabase injects as a JSON dictionary. Null if absent. */
function publishableKey(): string | null {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    return typeof keys.default === 'string' ? keys.default : null;
  } catch {
    return null;
  }
}

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '');

Deno.serve((req) => handleImport(req, { allowedOrigins, apiKey: publishableKey() }));
