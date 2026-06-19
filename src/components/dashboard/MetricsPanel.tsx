import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/data/mockData';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, Users, CheckCircle, Clock, AlertTriangle,
  BarChart3, ArrowRight
} from 'lucide-react';

interface StageMetrics {
  stage_id: string;
  stage_name: string;
  stage_position: number;
  deal_count: number;
  total_value: number;
  avg_days_in_stage: number;
  conversion_to_next: number;
  avg_value: number;
}

interface MetricsPanelProps {
  className?: string;
}

export function MetricsPanel({ className }: MetricsPanelProps) {
  const [metrics, setMetrics] = useState<StageMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get org from user metadata or use default
      const orgId = user.user_metadata?.organization_id || '11111111-1111-1111-1111-111111111111';

      const { data, error } = await supabase.rpc('get_dashboard_metrics', { p_org: orgId });
      
      if (error) throw error;
      setMetrics(data || []);
    } catch (err) {
      console.error('Error fetching metrics:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar métricas');
    } finally {
      setLoading(false);
    }
  };

  // Calculate summary stats
  const totalDeals = metrics.reduce((sum, m) => sum + Number(m.deal_count), 0);
  const totalValue = metrics.reduce((sum, m) => sum + Number(m.total_value), 0);
  const avgDaysOverall = metrics.length > 0 
    ? metrics.reduce((sum, m) => sum + Number(m.avg_days_in_stage), 0) / metrics.length 
    : 0;

  // Count deals in specific stages
  const emAnalise = metrics
    .filter(m => m.stage_name.toLowerCase().includes('análise') || m.stage_name.toLowerCase().includes('análise'))
    .reduce((sum, m) => sum + Number(m.deal_count), 0);
  
  const aprovados = metrics
    .filter(m => m.stage_name.toLowerCase().includes('aprovado') || m.stage_name.toLowerCase().includes('devolutiva'))
    .reduce((sum, m) => sum + Number(m.deal_count), 0);

  if (loading) {
    return (
      <div className={cn('p-6 space-y-4', className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="grid grid-cols-4 gap-3">
            <div className="h-16 bg-muted rounded-lg" />
            <div className="h-16 bg-muted rounded-lg" />
            <div className="h-16 bg-muted rounded-lg" />
            <div className="h-16 bg-muted rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-6', className)}>
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const maxDeals = Math.max(...metrics.map(m => Number(m.deal_count)), 1);

  return (
    <div className={cn('p-6 space-y-6', className)}>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={<Users className="text-blue-500" />}
          label="Total de Deals"
          value={totalDeals}
          subtext={`${formatCurrency(totalValue)} em pipeline`}
        />
        <MetricCard
          icon={<Clock className="text-yellow-500" />}
          label="Em Análise"
          value={emAnalise}
          subtext="No correspondente"
        />
        <MetricCard
          icon={<CheckCircle className="text-green-500" />}
          label="Aprovados"
          value={aprovados}
          subtext="Aguardando corretor"
        />
        <MetricCard
          icon={<TrendingUp className="text-purple-500" />}
          label="Dias Médios"
          value={avgDaysOverall.toFixed(1)}
          subtext="por etapa"
          isText
        />
      </div>

      {/* Funnel Chart */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-muted-foreground" />
          <h3 className="font-semibold text-sm">Funil de Conversão</h3>
        </div>
        
        <div className="space-y-2">
          {metrics.map((stage) => {
            const count = Number(stage.deal_count);
            const pct = (count / maxDeals) * 100;
            const isAtRisk = Number(stage.avg_days_in_stage) > 3;
            
            return (
              <div key={stage.stage_id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate max-w-[140px]">{stage.stage_name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      {count} deal{count !== 1 ? 's' : ''}
                    </span>
                    {stage.conversion_to_next > 0 && (
                      <span className="text-green-600 flex items-center gap-0.5">
                        {stage.conversion_to_next}%
                        <ArrowRight size={10} />
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      isAtRisk ? 'bg-red-400' : count > 0 ? 'bg-primary' : 'bg-muted-foreground/30'
                    )}
                    style={{ width: `${Math.max(pct, count > 0 ? 5 : 0)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{formatCurrency(Number(stage.total_value))}</span>
                  <span className={isAtRisk ? 'text-red-500 font-medium' : ''}>
                    {Number(stage.avg_days_in_stage).toFixed(1)} dias médios
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  subtext: string;
  isText?: boolean;
}

function MetricCard({ icon, label, value, subtext, isText }: MetricCardProps) {
  return (
    <div className="bg-card border rounded-lg p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
          {icon}
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={cn(
        'text-xl font-bold',
        typeof value === 'number' && value === 0 ? 'text-muted-foreground' : ''
      )}>
        {isText ? value : value.toLocaleString('pt-BR')}
      </p>
      <p className="text-[10px] text-muted-foreground">{subtext}</p>
    </div>
  );
}

export default MetricsPanel;
