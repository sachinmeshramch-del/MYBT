import { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

export function CooldownTimer({ initialSeconds }: { initialSeconds: number }) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (initialSeconds <= 0) return;
    const id = setInterval(() => {
      setSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [initialSeconds]);

  if (seconds <= 0) return null;

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div className="flex items-center gap-2 text-warning text-sm font-mono bg-warning/10 px-3 py-1.5 rounded-md border border-warning/20">
      <Timer className="w-4 h-4 animate-pulse" />
      <span>Cooldown: {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}</span>
    </div>
  );
}
