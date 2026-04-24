// Edge function: analyze-indicators
// Usa Lovable AI Gateway com tool-calling para retornar chart_spec estruturado.
// Recebe pergunta livre + snapshot agregado e devolve {summary, chart_spec}.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SnapshotPayload {
  totals: {
    deal_count: number;
    open_count: number;
    won_count: number;
    lost_count: number;
    total_value: number;
    won_value: number;
    forecast_value: number;
    avg_ticket: number;
  };
  by_funnel: Array<{
    funnel_id: string;
    funnel_name: string;
    deal_count: number;
    total_value: number;
    by_stage: Array<{ stage_name: string; deal_count: number; total_value: number }>;
  }>;
  by_status: Array<{ status: string; deal_count: number; total_value: number }>;
  by_loss_reason: Array<{ reason: string; deal_count: number }>;
  by_assignee: Array<{ assignee: string; deal_count: number; total_value: number }>;
  recent_activities: { total: number; done: number; pending: number; overdue: number };
}

interface RequestBody {
  question: string;
  snapshot: SnapshotPayload;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

const SYSTEM_PROMPT = `Você é um analista de dados de um CRM imobiliário.
Recebe um snapshot agregado da operação e uma pergunta do usuário. Sua tarefa:
1) Analisar os dados que recebeu (NUNCA invente números — use só o snapshot).
2) Escolher o melhor formato visual (kpi, bar, line, pie, table) para responder.
3) Chamar a tool render_indicator com:
   - summary: explicação curta em PT-BR (2-4 frases) sobre o que o gráfico mostra e qual o insight.
   - chart_spec: especificação estruturada do visual.

Regras:
- Use português do Brasil.
- Valores monetários em reais (formate o usuário formatará — você só envia números).
- Se não houver dados suficientes para responder, use chart type "kpi" com label "Sem dados" e value 0.
- Para "bar"/"line"/"pie" envie até 8 séries; agrupe o resto como "Outros".
- Para "table" envie no máximo 10 linhas e 5 colunas.
- Para "kpi" envie 1-4 cards.`;

const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'render_indicator',
    description: 'Renderiza um indicador visual com resumo textual.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Resumo textual em PT-BR (2-4 frases).' },
        chart_spec: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['kpi', 'bar', 'line', 'pie', 'table'],
              description: 'Tipo de visualização.',
            },
            title: { type: 'string', description: 'Título curto do gráfico.' },
            unit: {
              type: 'string',
              enum: ['currency', 'count', 'percent', 'days'],
              description: 'Unidade dos valores numéricos.',
            },
            // Para kpi: lista de cards
            kpis: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  value: { type: 'number' },
                  unit: { type: 'string', enum: ['currency', 'count', 'percent', 'days'] },
                },
                required: ['label', 'value'],
                additionalProperties: false,
              },
            },
            // Para bar/line/pie: pontos {label, value}
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  value: { type: 'number' },
                },
                required: ['label', 'value'],
                additionalProperties: false,
              },
            },
            // Para table
            columns: { type: 'array', items: { type: 'string' } },
            rows: {
              type: 'array',
              items: { type: 'array', items: { type: 'string' } },
            },
          },
          required: ['type', 'title'],
          additionalProperties: false,
        },
      },
      required: ['summary', 'chart_spec'],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY ausente no servidor.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = (await req.json()) as RequestBody;
    if (!body?.question || typeof body.question !== 'string') {
      return new Response(JSON.stringify({ error: 'Campo "question" é obrigatório.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!body?.snapshot || typeof body.snapshot !== 'object') {
      return new Response(JSON.stringify({ error: 'Campo "snapshot" é obrigatório.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userContent = [
      `Pergunta do usuário: ${body.question}`,
      '',
      'Snapshot agregado da operação (dados reais, use só estes):',
      '```json',
      JSON.stringify(body.snapshot, null, 2),
      '```',
    ].join('\n');

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];
    if (body.history && Array.isArray(body.history)) {
      for (const h of body.history.slice(-6)) {
        if (h?.role && h?.content) messages.push({ role: h.role, content: h.content });
      }
    }
    messages.push({ role: 'user', content: userContent });

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        tools: [TOOL_DEFINITION],
        tool_choice: { type: 'function', function: { name: 'render_indicator' } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(
        JSON.stringify({ error: 'Limite de requisições atingido. Tente novamente em alguns segundos.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (aiResp.status === 402) {
      return new Response(
        JSON.stringify({ error: 'Créditos da IA esgotados. Adicione créditos em Settings > Workspace > Usage.' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error('AI gateway error', aiResp.status, txt);
      return new Response(JSON.stringify({ error: 'Falha na IA: ' + aiResp.status }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await aiResp.json();
    const choice = data?.choices?.[0];
    const toolCall = choice?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ error: 'IA não devolveu chart_spec estruturado.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let parsed: { summary: string; chart_spec: unknown };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error('JSON parse error', e, toolCall.function.arguments);
      return new Response(JSON.stringify({ error: 'IA devolveu JSON inválido.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('analyze-indicators error', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Erro desconhecido.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
