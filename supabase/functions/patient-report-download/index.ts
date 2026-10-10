import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let body: { token?: unknown; kind?: unknown; download?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const token = typeof body.token === 'string' ? body.token.toLowerCase() : '';
  const kind = body.kind;
  const download = body.download === true;
  if (!/^[0-9a-f]{64}$/.test(token) || (kind !== 'dashboard' && kind !== 'study')) {
    return json({ error: 'Invalid share link.' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'Report service is unavailable.' }, 503);

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc('get_patient_report_pdf', { p_token: token, p_kind: kind });
  if (error) {
    console.error('Patient report lookup failed:', error.message);
    return json({ error: 'Report service is unavailable.' }, 503);
  }

  const row = data?.[0] as { storage_path: string; record_code: string | null } | undefined;
  if (!row) return json({ available: false, url: null });
  if (!download) return json({ available: true, url: null });

  const filename = (String(row.record_code || 'POSA-report').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'POSA-report') + '.pdf';
  const { data: signed, error: signError } = await admin.storage
    .from('report-pdfs')
    .createSignedUrl(row.storage_path, 120, { download: filename });
  if (signError || !signed?.signedUrl) {
    console.error('Patient report signing failed:', signError?.message || 'missing URL');
    return json({ error: 'Report service is unavailable.' }, 503);
  }
  return json({ available: true, url: signed.signedUrl });
});
