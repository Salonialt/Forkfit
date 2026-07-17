export default function MacroRing({ label, value, target, unit, color = "#4A6B53", testId }) {
    const pct = Math.min(100, target ? (value / target) * 100 : 0);
    const r = 42;
    const c = 2 * Math.PI * r;
    const offset = c - (pct / 100) * c;
    return (
      <div className="flex flex-col items-center gap-2" data-testid={testId}>
        <div className="relative">
          <svg width="110" height="110" viewBox="0 0 110 110" className="-rotate-90">
            <circle cx="55" cy="55" r={r} stroke="#EFEDE9" strokeWidth="9" fill="none" />
            <circle cx="55" cy="55" r={r} stroke={color} strokeWidth="9" fill="none"
              strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 0.7s ease-out" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-display font-bold text-xl" style={{ color: "var(--text)" }}>{Math.round(value)}</div>
            <div className="text-[10px]" style={{ color: "var(--text-2)" }}>/ {target}{unit}</div>
          </div>
        </div>
        <div className="eyebrow" style={{ color }}>{label}</div>
      </div>
    );
  }