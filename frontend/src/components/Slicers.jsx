/**
 * DebtIQ™ — Slicers (filter controls)
 * Level filter buttons + Custom Language dropdown + Score range slider
 * Fully controlled — parent passes state and setters
 * Upgraded with Responsive Flex & Bounds Guards for Mobile Viewports
 */
import { useState, useRef, useEffect } from 'react';
import { scoreColor } from '../services/api';

const LEVELS = ['ALL', 'CRITICAL', 'MAJOR', 'MINOR', 'HEALTHY'];

/* ── Level filter pills ────────────────────────────────── */
export function LevelSlicer({ value, onChange }) {
  const colors = {
    ALL: '#00d4ff', CRITICAL: '#ff3860', MAJOR: '#f97316', MINOR: '#ffb800', HEALTHY: '#39ff14'
  };
  return (
    /* 🎯 FIX: Switched layout spacing metrics to use adaptive row gap tokens */
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', width: '100%' }}>
      {LEVELS.map(lv => {
        const c = colors[lv];
        const sel = value === lv;
        return (
          <button key={lv} onClick={() => onChange(lv)} style={{
            background: sel ? `${c}20` : 'var(--bg-raised)',
            border: `1px solid ${sel ? c : 'var(--line-1)'}`,
            borderRadius: 6, padding: '6px 12px',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            fontFamily: 'var(--font-mono)',
            color: sel ? c : 'var(--txt-2)',
            cursor: 'pointer',
            boxShadow: sel ? `0 0 10px ${c}30` : 'none',
            transition: 'all .15s ease-out',
            flexGrow: 1,               /* 🎯 FIX: Allow pills to fill rows evenly on small screens */
            textAlign: 'center',
            minWidth: '75px',          /* 🎯 FIX: Preserve minimum touch targets on mobile viewports */
          }}
          onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = c; e.currentTarget.style.color = c; } }}
          onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor = 'var(--line-1)'; e.currentTarget.style.color = 'var(--txt-2)'; } }}>
            {lv !== 'ALL' && (
              <span style={{
                width: 5, height: 5, borderRadius: '50%', background: c,
                boxShadow: `0 0 5px ${c}`, display: 'inline-block', marginRight: 5
              }} />
            )}
            {lv}
          </button>
        );
      })}
    </div>
  );
}

/* ── Clean Language Label Mapper ───────────────────────── */
const formatLanguageName = (lang) => {
  if (!lang) return '';
  const mapping = {
    all: 'ALL Languages',
    python: 'PYTHON',
    javascript: 'JAVASCRIPT',
    typescript: 'TYPESCRIPT',
    java: 'JAVA',
    csharp: 'C#',
    cpp: 'C++',
    go: 'GO',
    ruby: 'RUBY',
  };
  return mapping[lang.toLowerCase()] || lang.toUpperCase();
};

/* ── Custom Language Dropdown ───────────────────────── */
export function LanguageSlicer({ languages = [], value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    /* 🎯 FIX: Added flex properties to prevent clipping inside tight top containers */
    <div ref={dropdownRef} style={{ position: 'relative', zIndex: 51, flexShrink: 0 }}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        style={{
          background: 'var(--bg-raised)',
          border: '1px solid var(--line-1)',
          borderRadius: 6,
          padding: '7px 14px',
          color: 'var(--cyan)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          transition: 'all 0.2s',
          whiteSpace: 'nowrap',
        }}
      >
        🧬 {formatLanguageName(value)} {isOpen ? '▲' : '▼'}
      </button>

      {/* Dropdown Menu Overlay Bounds Protection */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 170,
          background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8,
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.7)', padding: 6,
          display: 'flex', flexDirection: 'column', gap: 2,
          maxHeight: '220px', overflowY: 'auto',  /* 🎯 FIX: Enable internal scroll tracking if language map bounds exceed viewport height */
        }}>
          {/* "ALL" Option */}
          <button
            onClick={() => { onChange('ALL'); setIsOpen(false); }}
            style={{
              padding: '8px 12px', textAlign: 'left',
              background: value === 'ALL' ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
              color: value === 'ALL' ? '#00d4ff' : '#94a3b8',
              border: 'none', borderRadius: 4, fontFamily: 'var(--font-mono)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { if (value !== 'ALL') e.currentTarget.style.background = 'rgba(30,41,59,0.5)'; }}
            onMouseLeave={e => { if (value !== 'ALL') e.currentTarget.style.background = 'transparent'; }}
          >
            ALL Languages
          </button>

          {/* Dynamic Languages */}
          {languages.map((lang) => (
            <button
              key={lang}
              onClick={() => { onChange(lang); setIsOpen(false); }}
              style={{
                padding: '8px 12px', textAlign: 'left',
                background: value === lang ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                color: value === lang ? '#00d4ff' : '#94a3b8',
                border: 'none', borderRadius: 4, fontFamily: 'var(--font-mono)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (value !== lang) e.currentTarget.style.background = 'rgba(30,41,59,0.5)'; }}
              onMouseLeave={e => { if (value !== lang) e.currentTarget.style.background = 'transparent'; }}
            >
              {formatLanguageName(lang)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Score range slider ────────────────────────────────── */
export function ScoreRangeSlicer({ min, max, value, onChange }) {
  const [lo, hi] = value;
  const pct = (v) => ((v - min) / (max - min)) * 100;

  return (
    /* 🎯 FIX: Configured component to dynamically stretch or stack based on width constraints */
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--txt-2)', whiteSpace: 'nowrap' }}>
        Score
      </span>
      
      {/* Range track layer wrapper wrapper */}
      <div style={{ position: 'relative', flex: '1 1 120px', height: 16, display: 'flex', alignItems: 'center' }}>
        {/* Track Backing */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 3, background: 'var(--line-1)', borderRadius: 2, pointerEvents: 'none'
        }} />
        {/* Fill Highlighting Range */}
        <div style={{
          position: 'absolute',
          left: `${pct(lo)}%`, right: `${100 - pct(hi)}%`,
          height: 3, background: 'var(--cyan)', borderRadius: 2,
          boxShadow: '0 0 6px var(--cyan)', pointerEvents: 'none'
        }} />
        
        {/* Native Range inputs stacked matching hardware bounds exactly */}
        <input type="range" min={min} max={max} value={lo}
          onChange={e => onChange([Math.min(+e.target.value, hi - 1), hi])}
          style={{ position: 'absolute', width: '100%', opacity: 0, cursor: 'pointer', zIndex: 2, height: '100%', margin: 0 }} />
        <input type="range" min={min} max={max} value={hi}
          onChange={e => onChange([lo, Math.max(+e.target.value, lo + 1)])}
          style={{ position: 'absolute', width: '100%', opacity: 0, cursor: 'pointer', zIndex: 3, height: '100%', margin: 0 }} />
      </div>
      
      <span style={{
        fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--cyan)',
        whiteSpace: 'nowrap', minWidth: 50, textAlign: 'right'
      }}>
        {lo}–{hi}
      </span>
    </div>
  );
}