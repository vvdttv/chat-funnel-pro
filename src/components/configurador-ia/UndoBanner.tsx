/**
 * Banner de "Desfazer" com countdown de 60 segundos exibido após salvar uma
 * configuração. Permite reverter completamente a sessão antes do prazo expirar.
 */
import { Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  sessionId: string;
  onRevert: () => Promise<void>;
  onDismiss: () => void;
  durationSec?: number;
}

export const UndoBanner = ({ sessionId: _sessionId, onRevert, onDismiss, durationSec = 60 }: Props) => {
  const [remaining, setRemaining] = useState(durationSec);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    if (remaining <= 0) { onDismiss(); return; }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onDismiss]);

  return (
    <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 flex items-center justify-between gap-3">
      <div className="text-sm text-foreground">
        <span className="font-medium">Configuração salva.</span>
        <span className="text-muted-foreground ml-1">Desfazer em {remaining}s</span>
      </div>
      <button
        onClick={async () => {
          if (reverting) return;
          setReverting(true);
          await onRevert();
          setReverting(false);
        }}
        disabled={reverting}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-foreground text-xs font-semibold active:scale-95 transition-transform disabled:opacity-40"
      >
        <Undo2 size={12} /> {reverting ? 'Desfazendo…' : 'Desfazer'}
      </button>
    </div>
  );
};
