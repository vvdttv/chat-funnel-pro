/**
 * Sprint 26 — Painel "Saúde do sistema IA".
 *
 * Agrega indicadores composicionais hoje dispersos:
 *  - Cobertura de regras ativas por kind (do/dont/ask/noask)
 *  - LBs com applicable_statuses customizados vs default
 *  - Top overrides mais "tocados" (via snapshots)
 *  - Etapas SEM override e com failureRate alto (gap de configuração)
 *
 * Tudo em memória, sobre dados já carregados pelos hooks.
 */

import { useMemo } from 'react';
import { Activity, ShieldCheck, Layers, AlertTriangle, Sparkles } from 'lucide-react';
import { useIABehavior } from '@/hooks/useIABehavior';
import { useIADecisionLogs } from '@/hooks/useIADecisionLogs';
import { usePlaybookOverrides } from '@/hooks/usePlaybookOverrides';
import { usePlaybookOverrideSnapshots } from '@/hooks/usePlaybookOverrideSnapshots';
import { useFunnels } from '@/hooks/useFunnels';
import { useSkills } from '@/hooks/useSkills';

const FAILURE = new Set(['failure', 'lost', 'abandoned', 'fallback']);

export const IASystemHealthPanel = () => {
  const { rules, behaviors } = useIABehavior();
  const { logs } = useIADecisionLogs({ sinceDays: 30, limit: 1000 });
  const { items: overrides } = usePlaybookOverrides();
  const { items: snapshots } = usePlaybookOverrideSnapshots({ limit: 200 });
  const { funnels } = useFunnels();
  const { skills } = useSkills();

  const ruleStats = useMemo(() => {
    const byKind = new Map<string, number>();
    for (const r of rules) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    return Array.from(byKind.entries()).sort((a, b) => b[1] - a[1]);
  }, [rules]);

  const behaviorCoverage = useMemo(() => {
    const total = behaviors.length;
    const customStatuses = behaviors.filter(b => {
      const s = (b as unknown as { applicableStatuses?: string[] }).applicableStatuses;
      return Array.isArray(s) && (s.length !== 1 || s[0] !== 'open');
    }).length;
    return { total, customStatuses, pct: total > 0 ? Math.round((customStatuses / total) * 100) : 0 };
  }, [behaviors]);

  const topOverrides = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of snapshots) {
      const k = `${s.scopeType}::${s.scopeId}::${s.layer}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [snapshots]);

  const configGaps = useMemo(() => {
    const stageStats = new Map<string, { total: number; fail: number; funnel: string; stage: string }>();
    for (const l of logs) {
      if (!l.funnel_id || !l.stage_id) continue;
      const k = `${l.funnel_id}::${l.stage_id}`;
      const c = stageStats.get(k) ?? { total: 0, fail: 0, funnel: l.funnel_id, stage: l.stage_id };
      c.total += 1;
      if (l.outcome && FAILURE.has(l.outcome)) c.fail += 1;
      stageStats.set(k, c);
    }
    const gaps: Array<{ key: string; funnelName: string; stageName: string; failureRate: number; sample: number }> = [];
    for (const [k, c] of stageStats.entries()) {
      const fr = c.total > 0 ? c.fail / c.total : 0;
      if (c.total < 5 || fr < 0.5) continue;
      const hasOverride = overrides.some(o => o.scopeType === 'stage' && o.scopeId === k && o.isActive);
      if (hasOverride) continue;
      const f = funnels.find(x => x.id === c.funnel);
      const s = f?.stages.find(x => x.id === c.stage);
      gaps.push({
        key: k,
        funnelName: f?.name ?? c.funnel,
        stageName: s?.name ?? c.stage,
        failureRate: fr,
        sample: c.total,
      });
    }
    return gaps.sort((a, b) => b.failureRate - a.failureRate).slice(0, 5);
  }, [logs, overrides, funnels]);

  // Sprint 32 — Top 5 skills mais ativadas (lê activated_skill_code dos logs)
  const topSkills = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of logs) {
      const code = l.activated_skill_code;
      if (!code) continue;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    const skillByCode = new Map(skills.map(s => [s.skill.code, s.skill]));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, n]) => ({ code, count: n, name: skillByCode.get(code)?.name ?? code }));
  }, [logs, skills]);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Activity size={14} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Saúde do sistema IA</h3>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        Visão consolidada das últimas 30 dias: cobertura de regras, LBs adaptáveis,
        overrides mais ativos e gaps de configuração que merecem atenção.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Card title="Regras ativas" icon={ShieldCheck}>
          <ul className="space-y-1">
            {ruleStats.length === 0 && <li className="text-[10px] text-muted-foreground italic">Nenhuma regra.</li>}
            {ruleStats.map(([kind, n]) => (
              <li key={kind} className="flex justify-between text-[11px]">
                <span className="font-mono text-muted-foreground uppercase">{kind}</span>
                <span className="text-foreground font-semibold">{n}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="LBs adaptáveis" icon={Layers}>
          <p className="text-2xl font-bold text-primary leading-none">{behaviorCoverage.pct}%</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {behaviorCoverage.customStatuses} de {behaviorCoverage.total} LBs com status customizados
          </p>
        </Card>
      </div>

      <Card title="Top 5 overrides mais editados (30d)" icon={Layers}>
        {topOverrides.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">Nenhuma edição recente.</p>
        ) : (
          <ul className="space-y-1">
            {topOverrides.map(([k, n]) => (
              <li key={k} className="flex justify-between text-[11px]">
                <span className="font-mono text-muted-foreground truncate" title={k}>{k}</span>
                <span className="text-foreground font-semibold shrink-0 ml-2">{n}×</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Top 5 skills mais ativadas (30d)" icon={Sparkles}>
        {topSkills.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">
            Nenhuma skill ativada ainda — registros aparecem quando o runtime grava activated_skill_code.
          </p>
        ) : (
          <ul className="space-y-1">
            {topSkills.map(s => (
              <li key={s.code} className="flex justify-between text-[11px] gap-2">
                <span className="text-foreground truncate" title={s.code}>
                  {s.name}
                  <span className="font-mono text-muted-foreground ml-1.5 text-[9px]">{s.code}</span>
                </span>
                <span className="text-primary font-semibold shrink-0">{s.count}×</span>
              </li>
            ))}
          </ul>
        )}
      </Card>


        {configGaps.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">
            Sem etapas críticas sem override. ✓
          </p>
        ) : (
          <ul className="space-y-1.5">
            {configGaps.map(g => (
              <li key={g.key} className="bg-warning/5 border border-warning/20 rounded p-1.5">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[11px] text-foreground truncate" title={`${g.funnelName} › ${g.stageName}`}>
                    {g.funnelName} › <strong>{g.stageName}</strong>
                  </span>
                  <span className="text-[10px] text-warning font-mono shrink-0">
                    {Math.round(g.failureRate * 100)}% · n={g.sample}
                  </span>
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  Sem override ativo — considere criar um na seção de sugestões.
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
};

const Card = ({
  title, icon: Icon, tone = 'default', children,
}: {
  title: string;
  icon: typeof Activity;
  tone?: 'default' | 'warning';
  children: React.ReactNode;
}) => (
  <div className={`bg-card border rounded-lg p-2.5 ${tone === 'warning' ? 'border-warning/40' : 'border-border'}`}>
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon size={11} className={tone === 'warning' ? 'text-warning' : 'text-primary'} />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {title}
      </span>
    </div>
    {children}
  </div>
);
