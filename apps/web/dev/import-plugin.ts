import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { handleImport } from '../../../supabase/functions/_shared/import-handler.ts';

export const DEV_IMPORT_PATH = '/functions/v1/import-character';

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** A Node request as a web-standard Request, which is what the shared handler takes. */
export async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(', '));
  }
  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  return new Request(`http://localhost${DEV_IMPORT_PATH}`, {
    method,
    headers,
    body: hasBody ? new Uint8Array(await readBody(req)) : undefined,
  });
}

/**
 * Mounts the Edge Function's handler on the Vite dev server at the same path Supabase serves it,
 * so the app can import characters locally with no Supabase project. Dev server only.
 */
export function devImport(): Plugin {
  return {
    name: 'cw-dev-import',
    configureServer(server) {
      server.middlewares.use(DEV_IMPORT_PATH, (req, res) => {
        void (async () => {
          const response = await handleImport(await toWebRequest(req), { allowedOrigins: ['*'] });
          res.statusCode = response.status;
          response.headers.forEach((value, name) => res.setHeader(name, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        })().catch(() => {
          res.statusCode = 500;
          res.end();
        });
      });
    },
  };
}
