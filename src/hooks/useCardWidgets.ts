import { useState, useEffect, useCallback } from 'react';
import { CardWidget, getDefaultWidgets } from '@/components/CardWidgetConfig';

const STORAGE_KEY = 'card_widget_config';

export function useCardWidgets() {
  const [widgets, setWidgets] = useState<CardWidget[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CardWidget[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return getDefaultWidgets();
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const updateWidgets = useCallback((w: CardWidget[]) => {
    setWidgets(w);
  }, []);

  return { widgets, updateWidgets };
}
