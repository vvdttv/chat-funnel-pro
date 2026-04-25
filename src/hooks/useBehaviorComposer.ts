/**
 * Hook que invoca a edge `behavior-composer` em seus 4 modos.
 * Mantém estado de loading/erro por modo para a UI conversacional.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type Polarity = 'do' | 'dont' | 'noask' | 'ask';
export type Scope = 'universal' | 'funnel' | 'stage' | 'multi';

export interface FixedAnswers {
  scope: Scope;
  scopeIds?: string[];
  trigger: 'always' | 'lead_action' | 'message_moment';
  triggerDescription?: string;
  polarity: Polarity;
  kindHint?: 'single_action' | 'flow' | 'forbidden_action' | 'forbidden_question';
}

export interface CustomQuestion {
  id: string;
  type: 'chips' | 'open' | 'multi_select' | 'conditional';
  text: string;
  options?: string[];
  conditionOn?: string;
}

export interface CustomAnswer {
  questionId: string;
  answer: unknown;
}

export interface DuplicateAlert {
  type: 'lead_behavior' | 'ia_rule' | 'ia_skill';
  existingCode: string;
  existingLabel: string;
  suggestion: 'reuse' | 'create_new';
}

export interface ComposedPlan {
  humanSummary: string;
  artifacts: {
    leadBehaviors?: Array<Record<string, unknown>>;
    iaRules?: Array<Record<string, unknown>>;
    skills?: Array<Record<string, unknown>>;
    playbookOverrides?: Array<Record<string, unknown>>;
  };
  warnings: string[];
}

export interface CreatedIds {
  leadBehaviors: string[];
  iaRules: string[];
  iaSkills: string[];
  iaSkillNodes: string[];
  iaSkillGuardrails: string[];
  playbookOverrides: string[];
  snapshots: string[];
}

export function useBehaviorComposer() {
  const [loading, setLoading] = useState<null | 'questions' | 'plan' | 'persist' | 'revert'>(null);
  const [error, setError] = useState<string | null>(null);

  const generateQuestions = useCallback(async (args: {
    userMessage: string;
    fixedAnswers: FixedAnswers;
    previousAnswers?: CustomAnswer[];
  }): Promise<{ questions: CustomQuestion[]; clarifyingSummary: string; duplicateAlerts: DuplicateAlert[] } | null> => {
    setLoading('questions'); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('behavior-composer', {
        body: { mode: 'generate_questions', ...args },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return {
        questions: (data?.questions ?? []) as CustomQuestion[],
        clarifyingSummary: data?.clarifyingSummary ?? '',
        duplicateAlerts: (data?.duplicateAlerts ?? []) as DuplicateAlert[],
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar perguntas');
      return null;
    } finally {
      setLoading(null);
    }
  }, []);

  const composePlan = useCallback(async (args: {
    userMessage: string;
    fixedAnswers: FixedAnswers;
    customAnswers: CustomAnswer[];
  }): Promise<ComposedPlan | null> => {
    setLoading('plan'); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('behavior-composer', {
        body: { mode: 'compose_plan', ...args },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return data as ComposedPlan;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao montar o plano');
      return null;
    } finally {
      setLoading(null);
    }
  }, []);

  const persistPlan = useCallback(async (args: {
    userMessage: string;
    fixedAnswers: FixedAnswers;
    customQuestions: CustomQuestion[];
    customAnswers: CustomAnswer[];
    generatedPlan: ComposedPlan;
  }): Promise<{ sessionId: string; createdIds: CreatedIds } | null> => {
    setLoading('persist'); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('behavior-composer', {
        body: { mode: 'persist_plan', ...args },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return data as { sessionId: string; createdIds: CreatedIds };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar configuração');
      return null;
    } finally {
      setLoading(null);
    }
  }, []);

  const revertSession = useCallback(async (sessionId: string): Promise<boolean> => {
    setLoading('revert'); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('behavior-composer', {
        body: { mode: 'revert_session', sessionId },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao desfazer');
      return false;
    } finally {
      setLoading(null);
    }
  }, []);

  return { loading, error, generateQuestions, composePlan, persistPlan, revertSession };
}
