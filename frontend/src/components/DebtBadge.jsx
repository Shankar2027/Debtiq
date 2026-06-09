import React from 'react';

const CONFIG_MAP = {
  critical: { color: '#ff3860', bg: 'rgba(255,56,96,0.08)', border: 'rgba(255,56,96,0.3)' },
  major:    { color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.3)' },
  minor:    { color: '#ffb800', bg: 'rgba(255,184,0,0.08)', border: 'rgba(255,184,0,0.3)' },
  healthy:  { color: '#39ff14', bg: 'rgba(57,255,20,0.08)', border: 'rgba(57,255,20,0.3)' },
};

const SIZE_MAP = {
  xs: { fs: 9,  pad: '2px 6px',  dot: 5,  glow: '0 0 6px'  },
  sm: { fs: 10, pad: '3px 9px',  dot: 6,  glow: '0 0 8px'  },
  md: { fs: 11, pad: '4px 11px', dot: 7,  glow: '0 0 10px' },
  lg: { fs: 12, pad: '5px 13px', dot: 8,  glow: '0 0 12px' },
};

export default function DebtBadge({ level, size = 'sm' }) {
  // Normalize level strings cleanly
  const normalizedLevel = level?.toLowerCase() === 'minor issues' ? 'minor' : 
                          level?.toLowerCase() === 'critical debt' ? 'critical' : 
                          level?.toLowerCase() === 'major debt' ? 'major' :
                          level?.toLowerCase() === 'healthy codebase' ? 'healthy' :
                          level?.toLowerCase();

  const c = CONFIG_MAP[normalizedLevel] ?? CONFIG_MAP.minor;
  const { fs, pad, dot, glow } = SIZE_MAP[size] ?? SIZE_MAP.sm;

  return (
    <span 
      role="status"
      aria-label={`Debt Level: ${level}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: c.bg, color: c.color,
        border: `1px solid ${c.border}`,
        borderRadius: 4, padding: pad,
        fontSize: fs, fontWeight: 700,
        fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
        boxShadow: `0 0 8px ${c.color}25`,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        width: dot, height: dot, borderRadius: '50%',
        background: c.color, 
        boxShadow: `${glow} ${c.color}`,
        flexShrink: 0, display: 'inline-block',
      }}/>
      {level?.toUpperCase()}
    </span>
  );
}