import { useEffect, useState } from 'react';

type Toast = { id: number; text: string; kind: 'ok' | 'error' };
let push: (t: Toast) => void = () => undefined;
let seq = 0;

export function toast(text: string, kind: 'ok' | 'error' = 'ok') {
  push({ id: ++seq, text, kind });
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    push = (t) => {
      setItems((s) => [...s, t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), t.kind === 'error' ? 6000 : 2500);
    };
  }, []);
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Đã copy');
}
