import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';
import { sanitizeQuestion, sanitizeAnswer } from '../_shared/sanitize.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claims.claims.sub as string;
    const body = await req.json().catch(() => ({}));
    // Sanitize: remove HTML, colapsa whitespace, normaliza
    const question = sanitizeQuestion(body?.question);
    const answer = sanitizeAnswer(body?.answer);

    if (question.length < 5 || question.length > 200) {
      return new Response(JSON.stringify({ error: 'Pergunta deve ter entre 5 e 200 caracteres (sem HTML).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (answer.length < 2 || answer.length > 200) {
      return new Response(JSON.stringify({ error: 'Resposta deve ter entre 2 e 200 caracteres (sem HTML).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hash = await bcrypt.hash(answer, 10);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error: updErr } = await admin
      .from('profiles')
      .update({
        security_question: question,
        security_answer_hash: hash,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
