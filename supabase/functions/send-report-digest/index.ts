/**
 * Edge function: send-report-digest (Fase 4B)
 * Envia um resumo (digest) diário/semanal por e-mail para os membros de cada org.
 *
 * Modos:
 *  (a) CRON  — header x-cron-token == CRON_DISPATCH_TOKEN. Itera todas as orgs com
 *      membros que tenham e-mail e dispara o digest para cada um.
 *  (b) DIRECT — body { organization_id, days?, to_email? } (uso programático/teste).
 *      Requer JWT válido (verify_jwt) OU x-cron-token.
 *
 * Fonte dos números: RPC get_org_digest_summary(org, days) (service_role).
 * Envio: delega à edge function send-email-notification (template 'generic').
 *
 * Sem CRON_DISPATCH_TOKEN configurado e sem JWT → 401.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface DigestSummary {
  organization_id: string;
  period_days: number;
  period_from: string;
  period_to: string;
  new_leads: number;
  won: number;
  lost: number;
  won_value: number;
  open_total: number;
  stalled: number;
}

interface DigestRequest {
  organization_id?: string;
  days?: number;
  to_email?: string;
}

function fmtBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildDigestMessage(s: DigestSummary, periodLabel: string): { subject: string; html: string } {
  const subject = `Resumo ${periodLabel} OmniMob — ${s.new_leads} novos, ${s.won} ganhos`;
  const html = `<h2>Resumo ${periodLabel}</h2>
<p>Período: ${new Date(s.period_from).toLocaleDateString("pt-BR")} a ${new Date(s.period_to).toLocaleDateString("pt-BR")}</p>
<table style="border-collapse:collapse" cellpadding="6">
  <tr><td><strong>Novos leads</strong></td><td>${s.new_leads}</td></tr>
  <tr><td><strong>Ganhos</strong></td><td>${s.won} (${fmtBRL(s.won_value)})</td></tr>
  <tr><td><strong>Perdidos</strong></td><td>${s.lost}</td></tr>
  <tr><td><strong>Em aberto</strong></td><td>${s.open_total}</td></tr>
  <tr><td><strong>Parados (&gt;3 dias)</strong></td><td>${s.stalled}</td></tr>
</table>
<p>Acesse o painel para o relatório completo.</p>`;
  return { subject, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const cronToken = req.headers.get("x-cron-token");
  const expectedCron = Deno.env.get("CRON_DISPATCH_TOKEN");
  const isCron = !!expectedCron && cronToken === expectedCron;
  const hasJwt = !!req.headers.get("authorization");

  // Autorização: cron token válido OU JWT (gateway já valida verify_jwt).
  if (!isCron && !hasJwt) return json(401, { error: "unauthorized" });

  let body: DigestRequest = {};
  try { body = await req.json(); } catch { /* body opcional no modo cron */ }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const days = body.days && body.days > 0 ? body.days : 1;
  const periodLabel = days >= 7 ? "semanal" : "diário";

  // Resolve destinatários: { org_id -> [emails] }
  const recipients = new Map<string, Set<string>>();

  if (body.organization_id) {
    const set = new Set<string>();
    if (body.to_email) {
      set.add(body.to_email);
    } else {
      const { data } = await admin
        .from("profiles")
        .select("email")
        .eq("organization_id", body.organization_id)
        .not("email", "is", null);
      for (const row of data || []) if (row.email) set.add(row.email as string);
    }
    recipients.set(body.organization_id, set);
  } else {
    // Modo cron: todas as orgs com membros que tenham e-mail
    const { data } = await admin
      .from("profiles")
      .select("organization_id, email")
      .not("email", "is", null)
      .not("organization_id", "is", null);
    for (const row of data || []) {
      const org = row.organization_id as string;
      if (!recipients.has(org)) recipients.set(org, new Set());
      if (row.email) recipients.get(org)!.add(row.email as string);
    }
  }

  const results: Array<{ organization_id: string; emails: number; summary: DigestSummary | null; sent: number }> = [];

  for (const [orgId, emails] of recipients) {
    const { data: summaryData, error: sumErr } = await admin.rpc("get_org_digest_summary", {
      p_org: orgId, p_days: days,
    });
    if (sumErr) {
      console.error(`[digest] summary err org=${orgId}:`, sumErr.message);
      results.push({ organization_id: orgId, emails: emails.size, summary: null, sent: 0 });
      continue;
    }
    const summary = summaryData as DigestSummary;
    const { subject, html } = buildDigestMessage(summary, periodLabel);

    let sent = 0;
    for (const email of emails) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            organization_id: orgId,
            template: "generic",
            to_email: email,
            subject,
            data: { subject, message: html },
          }),
        });
        if (res.ok) sent++;
      } catch (e) {
        console.error(`[digest] send err to=${email}:`, e instanceof Error ? e.message : e);
      }
    }
    results.push({ organization_id: orgId, emails: emails.size, summary, sent });
  }

  return json(200, { ok: true, orgs: results.length, results });
});
