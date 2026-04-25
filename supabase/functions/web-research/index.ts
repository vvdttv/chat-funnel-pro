/**
 * Edge `web-research` — busca/síntese para skills com `useWebSearch=true`.
 *
 * Implementação atual (fallback): chama Lovable AI Gateway com gemini-2.5-pro
 * pedindo para responder como um pesquisador — sintetiza com fontes plausíveis
 * mencionadas. NÃO é busca web real. Estrutura preparada para trocar por
 * Firecrawl/Perplexity quando o conector for adicionado.
 *
 * Contrato:
 *   POST { query: string }
 *   → { ok: true, summary: string, sources: Array<{ title: string; domain: string }>, isFallback: true }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth básica — qualquer usuário autenticado da org pode pesquisar
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Sem autorização" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u.user) return json({ error: "Token inválido" }, 401);

    const { query } = await req.json() as { query: string };
    if (!query || typeof query !== "string" || query.trim().length < 3) {
      return json({ error: "Query inválida" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY não configurada" }, 500);

    const systemPrompt = `Você é um pesquisador. Recebe uma pergunta sobre um tema (geralmente bairro, imóvel, mercado imobiliário, condomínio). Sintetize uma resposta útil em pt-BR com 3-6 frases, mencionando fontes plausíveis no formato [Título — domínio.com].

IMPORTANTE: Você NÃO tem acesso à internet em tempo real nesta versão. Use seu conhecimento até a data de corte e seja honesto se um dado pode estar desatualizado.

Saída APENAS em JSON válido (sem fences):
{
  "summary": "string com 3-6 frases",
  "sources": [{ "title": "string", "domain": "string" }]
}`;

    const resp = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        temperature: 0.5,
      }),
    });

    if (resp.status === 429) return json({ error: "Muitas requisições. Tenta de novo em alguns minutos." }, 429);
    if (resp.status === 402) return json({ error: "Créditos da IA acabaram." }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      console.error("[web-research] gateway error", resp.status, t);
      return json({ error: "Erro ao consultar a IA" }, 502);
    }

    const data = await resp.json();
    const raw = String(data.choices?.[0]?.message?.content ?? "");
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: { summary?: string; sources?: Array<{ title: string; domain: string }> };
    try { parsed = JSON.parse(cleaned); }
    catch {
      parsed = { summary: cleaned, sources: [] };
    }

    return json({
      ok: true,
      summary: parsed.summary ?? "",
      sources: parsed.sources ?? [],
      isFallback: true,
      message: "Pesquisa via síntese da IA (sem acesso web em tempo real). Conecte Firecrawl ou Perplexity para busca real.",
    });
  } catch (e) {
    console.error("[web-research] uncaught", e);
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
