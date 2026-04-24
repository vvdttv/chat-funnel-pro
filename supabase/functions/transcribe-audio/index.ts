// Edge function: transcribe-audio
// Recebe áudio em base64 (webm/ogg/mp3/wav) e devolve transcrição em PT-BR via Lovable AI Gateway (Gemini multimodal).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface Body {
  audio_base64: string;
  mime_type?: string; // ex: "audio/webm", "audio/ogg", "audio/mpeg", "audio/wav"
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { audio_base64, mime_type } = (await req.json()) as Body;
    if (!audio_base64 || typeof audio_base64 !== 'string') {
      return new Response(JSON.stringify({ error: 'audio_base64 obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mt = mime_type || 'audio/webm';

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content:
              'Você é um transcritor de áudio. Transcreva fielmente em português do Brasil. Devolva APENAS o texto transcrito, sem comentários, sem aspas, sem prefixos.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Transcreva este áudio:' },
              {
                type: 'input_audio',
                input_audio: { data: audio_base64, format: mt.split('/')[1] || 'webm' },
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('AI gateway transcribe error:', resp.status, errText);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: 'Limite de requisições atingido. Tente novamente em instantes.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos da IA esgotados. Adicione créditos em Configurações.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Falha na transcrição' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await resp.json();
    const text = (data?.choices?.[0]?.message?.content ?? '').toString().trim();

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('transcribe-audio error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Erro desconhecido' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
