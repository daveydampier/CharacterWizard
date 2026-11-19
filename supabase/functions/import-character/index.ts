// Supabase Edge Function entry point (Deno). All logic is in ../_shared/import-handler.ts.
import { databaseAuthorize, handleImport } from '../_shared/import-handler.ts';

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '');

// Supabase gives every function its own project's address. Without it, every request is refused.
const authorize = databaseAuthorize(Deno.env.get('SUPABASE_URL'));

Deno.serve((req) => handleImport(req, { allowedOrigins, authorize }));
