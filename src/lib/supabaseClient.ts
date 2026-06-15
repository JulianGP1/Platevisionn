import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Inyecta Accept-Profile y Content-Profile para que PostgREST use el schema platevision
const customFetch = (url: string, options: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(options.headers);
  headers.set('Accept-Profile', 'platevision');
  headers.set('Content-Profile', 'platevision');
  return fetch(url, { ...options, headers });
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'platevision' },
  global: { fetch: customFetch as typeof fetch },
});
