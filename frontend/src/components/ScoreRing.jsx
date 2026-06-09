import { useEffect, useRef } from 'react';
// 🎯 FIXED: Changed levelLabel to scoreToLabel to match your api.js layout exactly
import { scoreColor, scoreToLabel } from '../services/api';

export default function ScoreRing({ score = 0, size = 110, thickness = 7 }) {
  const arcRef  = useRef(null);
  const glowRef = useRef(null);
  const r     = (size / 2) - thickness - 4;
  const circ  = 2 * Math.PI * r;
  const color = scoreColor(score);
  // 🎯 FIXED: Updated the function call to match the import
  const label = scoreToLabel(score);
  const cx = size / 2, cy = size / 2;

  useEffect(() => {
    if (!arcRef.current) return;
    const fill = (score / 100) * circ;
    arcRef.current.style.transition  = 'none';
    arcRef.current.style.strokeDasharray = `0 ${circ}`;
    glowRef.current.style.strokeDasharray = `0 ${circ}`;
    const t = setTimeout(() => {
      arcRef.current.style.transition  = 'stroke-dasharray 1.3s cubic-bezier(0.16,1,0.3,1)';
      glowRef.current.style.transition = 'stroke-dasharray 1.3s cubic-bezier(0.16,1,0.3,1)';
      arcRef.current.style.strokeDasharray  = `${fill} ${circ - fill}`;
      glowRef.current.style.strokeDasharray = `${Math.min(fill * 1.4, circ)} ${circ}`;
    }, 80);
    return () => clearTimeout(t);
  }, [score, circ]);

  const fs = size * 0.215;
  const ls = size * 0.082;

  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      {/* Ambient glow behind ring */}
      <div style={{
        position:'absolute', inset:-8, borderRadius:'50%',
        background:`radial-gradient(circle, ${color}20 0%, transparent 68%)`,
        animation:'pulseRing 3s ease-in-out infinite',
      }}/>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display:'block' }}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke="rgba(255,255,255,0.04)" strokeWidth={thickness}/>
        {/* Glow arc */}
        <circle ref={glowRef} cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={thickness + 5} opacity="0.10"
          strokeDasharray={`0 ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}/>
        {/* Main arc */}
        <circle ref={arcRef} cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={thickness}
          strokeDasharray={`0 ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter:`drop-shadow(0 0 7px ${color})` }}/>
      </svg>
      {/* Center label */}
      <div style={{
        position:'absolute', inset:0,
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2,
      }}>
        <span style={{
          fontSize: fs, fontWeight:800, color,
          fontFamily:'var(--font-mono)', lineHeight:1,
          textShadow:`0 0 14px ${color}`,
          animation:'flicker 11s infinite',
        }}>{score}</span>
        <span style={{
          fontSize:ls, color:'var(--txt-2)', fontWeight:600,
          fontFamily:'var(--font-mono)', letterSpacing:'0.12em',
        }}>{label}</span>
      </div>
    </div>
  );
}