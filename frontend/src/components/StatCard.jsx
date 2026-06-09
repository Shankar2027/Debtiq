export default function StatCard({ label, value, sub, color = '#00d4ff', icon, delay = 0 }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${color}25`,
      borderRadius: 12,
      padding: '22px 24px',
      position: 'relative',
      overflow: 'hidden',
      animation: `slideUp 0.4s var(--ease-out) ${delay}ms both`,
      transition: 'transform 0.2s var(--ease-out), border-color 0.2s, box-shadow 0.2s',
      cursor: 'default',
    }}
    onMouseEnter={e => { 
      e.currentTarget.style.transform='translateY(-3px)'; 
      e.currentTarget.style.borderColor=`${color}50`;
      e.currentTarget.style.boxShadow=`0 8px 24px ${color}10`; 
    }}
    onMouseLeave={e => { 
      e.currentTarget.style.transform=''; 
      e.currentTarget.style.borderColor=`${color}25`;
      e.currentTarget.style.boxShadow=''; 
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${color}aa, transparent)` }} />
      <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80,
        borderRadius: '50%', background: `radial-gradient(circle, ${color}12 0%, transparent 70%)` }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11.5, mountaineer: 'true', fontWeight: 700, color: '#94a3b8',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', lineHeight: 1,
            fontFamily: 'var(--font-mono)', animation: 'flicker 12s infinite' }}>{value}</div>
          {sub && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8,
            fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{sub}</div>}
        </div>
        {icon && <span style={{ fontSize: 24, opacity: 0.6, marginTop: 2 }}>{icon}</span>}
      </div>
    </div>
  );
}