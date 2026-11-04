import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';
interface Item { id: number; kind: Kind; text: string }

const listeners = new Set<(t: Item) => void>();
let nextId = 1;

function classify(text: string): Kind {
  const t = text.toLowerCase();
  if (/(fail|error|could not|couldn.t|invalid|denied|wrong|not found|do not|cannot|can.t|unable|forbidden|required|too many|please (select|choose|enter|fill))/.test(t)) return 'error';
  if (/(success|saved|updated|created|reported|done|deleted|assigned|added|sent|complete)/.test(t)) return 'success';
  return 'info';
}

/** Show a notification anywhere in the app. */
export function toast(text: string, kind?: Kind) {
  const item: Item = { id: nextId++, kind: kind ?? classify(text), text };
  listeners.forEach((l) => l(item));
}

/** Every alert() in the app becomes a toast instead of a browser pop-up. */
export function installAlertShim() {
  window.alert = (message?: any) => toast(String(message ?? ''));
}

const STYLE: Record<Kind, { ring: string; icon: React.ReactNode }> = {
  success: { ring: 'border-emerald-200', icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" /> },
  error: { ring: 'border-rose-200', icon: <AlertCircle className="h-5 w-5 text-rose-600" /> },
  info: { ring: 'border-brand-200', icon: <Info className="h-5 w-5 text-brand-600" /> },
};

export const ToastHost: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const onToast = (t: Item) => {
      setItems((prev) => [...prev.slice(-3), t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), t.kind === 'error' ? 6500 : 4000);
    };
    listeners.add(onToast);
    return () => { listeners.delete(onToast); };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex animate-slide-in-right items-start gap-3 rounded-xl border bg-white p-3.5 shadow-lift ${STYLE[t.kind].ring}`}>
          <div className="mt-0.5 shrink-0">{STYLE[t.kind].icon}</div>
          <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-800">{t.text}</p>
          <button onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))} className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
