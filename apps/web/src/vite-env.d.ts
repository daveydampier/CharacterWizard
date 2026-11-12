/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** https://<project-ref>.supabase.co. Unset in local development, where the dev server answers. */
  readonly VITE_SUPABASE_URL?: string;
  /** The project's publishable key. It is public by design. */
  readonly VITE_SUPABASE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
