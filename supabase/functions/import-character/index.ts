// Supabase Edge Function entry point (Deno). All logic is in ../_shared/import-handler.ts.
import { handleImport } from '../_shared/import-handler.ts';

/**
 * The project's publishable key, which Supabase injects as a JSON dictionary. If that gives nothing,
 * falls back to IMPORT_API_KEY. Null if neither is set.
 */
function publishableKey(): string | null {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    if (typeof keys.default === 'string' && keys.default !== '') return keys.default;
  } catch {
    // Fall through to the fallback variable.
  }
  const fallback = Deno.env.get('IMPORT_API_KEY') ?? '';
  return fallback !== '' ? fallback : null;
}

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '');

Deno.serve((req) => handleImport(req, { allowedOrigins, apiKey: publishableKey(), requireKey: true }));
