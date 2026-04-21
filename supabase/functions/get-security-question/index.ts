import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// Endpoint público: dado um username, devolve a pergunta de segurança (se existir).
// Não revela se o usuário existe (resposta uniforme).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const usernameRaw = String(body?.username ?? '').trim().toLowerCase();
    if (!usernameRaw) {
      return new Response(JSON.stringify({ question: null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data } = await admin
      .from('profiles')
      .select('security_question, security_answer_hash')
      .eq('username', usernameRaw)
      .maybeSingle();

    const hasQuestion = !!(data?.security_question && data?.security_answer_hash);
    return new Response(
      JSON.stringify({ question: hasQuestion ? data!.security_question : null }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ question: null, error: (e as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
