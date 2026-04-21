import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const MAX_ATTEMPTS = 3;
const WINDOW_MINUTES = 15;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body?.username ?? '').trim().toLowerCase();
    const answer = String(body?.answer ?? '');
    const newPassword = String(body?.newPassword ?? '');

    if (!username || !answer || !newPassword) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios faltando.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (newPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'A nova senha deve ter ao menos 6 caracteres.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: profile } = await admin
      .from('profiles')
      .select('user_id, security_answer_hash')
      .eq('username', username)
      .maybeSingle();

    // Resposta genérica para não revelar existência de usuário
    const genericFail = (attemptsRemaining: number) =>
      new Response(
        JSON.stringify({
          error: 'Usuário ou resposta inválidos.',
          attemptsRemaining,
          maxAttempts: MAX_ATTEMPTS,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );

    if (!profile?.user_id || !profile.security_answer_hash) {
      return genericFail(MAX_ATTEMPTS);
    }

    // Rate limit por user_id
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const { count: failedCount } = await admin
      .from('password_reset_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.user_id)
      .eq('success', false)
      .gte('attempted_at', since);

    const previousFails = failedCount ?? 0;
    if (previousFails >= MAX_ATTEMPTS) {
      return new Response(
        JSON.stringify({
          error: `Muitas tentativas. Tente novamente em ${WINDOW_MINUTES} minutos.`,
          attemptsRemaining: 0,
          maxAttempts: MAX_ATTEMPTS,
          windowMinutes: WINDOW_MINUTES,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const normalized = answer.trim().toLowerCase();
    const ok = await bcrypt.compare(normalized, profile.security_answer_hash);

    if (!ok) {
      await admin.from('password_reset_attempts').insert({
        user_id: profile.user_id,
        success: false,
      });
      const remaining = Math.max(0, MAX_ATTEMPTS - (previousFails + 1));
      return genericFail(remaining);
    }

    // Reset da senha via service role
    const { error: updErr } = await admin.auth.admin.updateUserById(profile.user_id, {
      password: newPassword,
    });

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await admin.from('password_reset_attempts').insert({
      user_id: profile.user_id,
      success: true,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
