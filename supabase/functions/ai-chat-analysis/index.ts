import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userQuestion, dealContext, attachments } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build conversation context for the AI
    const conversationSummary = messages
      .map((m: { sender: string; content: string; timestamp: string }) =>
        `[${m.timestamp}] ${m.sender === 'agent' ? 'Corretor' : m.sender === 'lead' ? 'Lead' : 'IA'}: ${m.content}`
      )
      .join('\n');

    // Build attachment descriptions
    let attachmentContext = '';
    if (attachments && attachments.length > 0) {
      attachmentContext = '\n\nAnexos na conversa:\n' + attachments.map((a: { type: string; name: string; description?: string }) =>
        `- ${a.type}: ${a.name}${a.description ? ` (${a.description})` : ''}`
      ).join('\n');
    }

    const systemPrompt = `Você é um assistente de IA especializado em vendas imobiliárias. Você ajuda corretores a analisar conversas com leads e tomar decisões estratégicas.

Contexto do negócio:
- Lead: ${dealContext.leadName}
- Imóvel: ${dealContext.property}
- Valor: ${dealContext.value}
- Etapa: ${dealContext.stage}
- Funil: ${dealContext.funnel}

Histórico da conversa:
${conversationSummary}
${attachmentContext}

Suas capacidades:
- Analisar o tom e intenção do lead
- Identificar sinais de compra ou objeções
- Sugerir próximos passos estratégicos
- Resumir pontos-chave da conversa
- Analisar documentos, imagens e áudios mencionados
- Verificar informações de links compartilhados
- Transcrever e analisar conteúdo de áudios

Responda de forma concisa e prática. Suas respostas são visíveis APENAS para o corretor (não para o lead).`;

    // Build messages array for the AI - support multimodal content
    const aiMessages: Array<{ role: string; content: any }> = [
      { role: "system", content: systemPrompt },
    ];

    // If there are image attachments, use multimodal format
    if (attachments?.some((a: { type: string }) => a.type === 'image')) {
      const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: "text", text: userQuestion }
      ];
      for (const att of attachments) {
        if (att.type === 'image' && att.dataUrl) {
          content.push({
            type: "image_url",
            image_url: { url: att.dataUrl }
          });
        }
      }
      aiMessages.push({ role: "user", content });
    } else {
      aiMessages.push({ role: "user", content: userQuestion });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao processar com IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || "Não foi possível gerar uma análise.";

    return new Response(JSON.stringify({ response: aiResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("AI analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
