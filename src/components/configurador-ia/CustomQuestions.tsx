/**
 * Renderiza as perguntas customizadas geradas pela IA (chips/open/multi/conditional)
 * e coleta as respostas. Trata dependências `conditionOn` no formato "qX=valor".
 */
import { ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CustomAnswer, CustomQuestion } from '@/hooks/useBehaviorComposer';

interface Props {
  questions: CustomQuestion[];
  onSubmit: (answers: CustomAnswer[]) => void;
}

export const CustomQuestions = ({ questions, onSubmit }: Props) => {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  const visibleQuestions = useMemo(() => {
    return questions.filter(q => {
      if (!q.conditionOn) return true;
      const [refId, expected] = q.conditionOn.split('=');
      const refAnswer = answers[refId];
      if (Array.isArray(refAnswer)) return refAnswer.includes(expected);
      return refAnswer === expected;
    });
  }, [questions, answers]);

  const allAnswered = visibleQuestions.every(q => {
    const v = answers[q.id];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return String(v).trim().length > 0;
  });

  const setAnswer = (id: string, value: unknown) => setAnswers(prev => ({ ...prev, [id]: value }));

  return (
    <div className="space-y-4 bg-card border border-border rounded-xl p-4">
      {visibleQuestions.map(q => (
        <div key={q.id} className="space-y-2">
          <div className="text-sm font-medium text-foreground">{q.text}</div>
          {q.type === 'open' && (
            <textarea
              value={(answers[q.id] as string) ?? ''}
              onChange={e => setAnswer(q.id, e.target.value)}
              className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              rows={2}
              placeholder="Sua resposta…"
            />
          )}
          {(q.type === 'chips' || q.type === 'conditional') && (
            <div className="flex flex-wrap gap-1.5">
              {(q.options ?? []).map(opt => {
                const selected = answers[q.id] === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => setAnswer(q.id, opt)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors active:scale-95 ${
                      selected ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
          {q.type === 'multi_select' && (
            <div className="flex flex-wrap gap-1.5">
              {(q.options ?? []).map(opt => {
                const arr = (answers[q.id] as string[]) ?? [];
                const selected = arr.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => setAnswer(q.id, selected ? arr.filter(o => o !== opt) : [...arr, opt])}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors active:scale-95 ${
                      selected ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}

      <button
        disabled={!allAnswered}
        onClick={() => onSubmit(visibleQuestions.map(q => ({ questionId: q.id, answer: answers[q.id] })))}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition-transform"
      >
        Gerar plano <ArrowRight size={16} />
      </button>
    </div>
  );
};
