import { useEffect, useRef, useState, useCallback } from 'react';

interface Props {
  onExit: () => void;
}

const DRAG_THRESHOLD = 6; // px before a press becomes a drag
const STORAGE_KEY = 'asteron.exitBtnPos';

export default function DraggableExitButton({ onExit }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 12, y: 12 };
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x: 12, y: 12 };
  });

  const dragState = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  }>({ pointerId: null, startX: 0, startY: 0, origX: 0, origY: 0, moved: false });

  const clamp = useCallback((x: number, y: number) => {
    const el = btnRef.current;
    const w = el?.offsetWidth ?? 80;
    const h = el?.offsetHeight ?? 32;
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
  }, []);

  useEffect(() => {
    const onResize = () => setPos(p => clamp(p.x, p.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    btnRef.current?.setPointerCapture(e.pointerId);
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ds = dragState.current;
    if (ds.pointerId !== e.pointerId) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (!ds.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    ds.moved = true;
    const next = clamp(ds.origX + dx, ds.origY + dy);
    setPos(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ds = dragState.current;
    if (ds.pointerId !== e.pointerId) return;
    btnRef.current?.releasePointerCapture(e.pointerId);
    const wasDrag = ds.moved;
    dragState.current.pointerId = null;
    if (wasDrag) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch {}
    } else {
      setConfirm(true);
    }
  };

  const doExit = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onExit();
  };

  return (
    <>
      <button
        ref={btnRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="fixed z-[90] px-3 py-1.5 rounded-md bg-background/80 border border-border text-foreground font-mono text-sm hover:bg-background select-none"
        style={{
          left: pos.x,
          top: pos.y,
          backdropFilter: 'blur(4px)',
          touchAction: 'none',
          cursor: dragState.current.pointerId !== null ? 'grabbing' : 'grab',
        }}
        aria-label="Exit (tap) or drag to move"
      >
        ⬅ Exit
      </button>

      {confirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
          <div className="w-[min(360px,92vw)] rounded-xl border border-border bg-card p-5 font-mono shadow-2xl">
            <div className="text-sm font-bold text-foreground">Leave the match?</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Are you sure? You won't be able to play any longer.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={doExit}
                className="flex-1 rounded-md bg-destructive px-3 py-2 text-xs font-bold text-destructive-foreground hover:opacity-90"
              >
                Yes, leave
              </button>
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-md border border-border px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}