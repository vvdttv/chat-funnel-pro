import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const MAX_ATTEMPTS = 3;
const WINDOW_MINUTES = 15;

// Endpoint público: dado um username, devolve a pergunta de segurança (se existir)
// e quantas tentativas restam antes do rate limit bloquear.
// Não revela se o usuário existe (resposta uniforme).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const usernameRaw = String(body?.username ?? '').trim().toLowerCase();
    if (!usernameRaw) {
      return new Response(
        JSON.stringify({ question: null, attemptsRemaining: MAX_ATTEMPTS, maxAttempts: MAX_ATTEMPTS, windowMinutes: WINDOW_MINUTES }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data } = await admin
      .from('profiles')
      .select('user_id, security_question, security_answer_hash')
      .eq('username', usernameRaw)
      .maybeSingle();

    const hasQuestion = !!(data?.security_question && data?.security_answer_hash);

    let attemptsRemaining = MAX_ATTEMPTS;
    if (data?.user_id) {
      const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
      const { count } = await admin
        .from('password_reset_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', data.user_id)
        .eq('success', false)
        .gte('attempted_at', since);
      attemptsRemaining = Math.max(0, MAX_ATTEMPTS - (count ?? 0));
    }

    return new Response(
      JSON.stringify({
        question: hasQuestion ? data!.security_question : null,
        attemptsRemaining,
        maxAttempts: MAX_ATTEMPTS,
        windowMinutes: WINDOW_MINUTES,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ question: null, error: (e as Error).message, attemptsRemaining: MAX_ATTEMPTS, maxAttempts: MAX_ATTEMPTS, windowMinutes: WINDOW_MINUTES }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
