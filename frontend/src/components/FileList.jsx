import { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import ScoreRing    from './ScoreRing';
import DebtBadge    from './DebtBadge';
import ProblemCard  from './ProblemCard';
import { LevelSlicer, LanguageSlicer, ScoreRangeSlicer } from './Slicers';
import { scoreColor, generateFix } from '../services/api';

/* ── single row in the file list ── */
function FileRow({ file, active, onClick }) {
  const color = scoreColor(file.score);
  const fname = file.file_path.split('/').pop();
  const fdir  = file.file_path.includes('/')
    ? file.file_path.split('/').slice(0,-1).join('/') + '/'
    : '';

  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
      borderLeft: `3px solid ${active ? color : 'transparent'}`,
      background: active ? 'rgba(30,41,59,0.5)' : 'transparent',
      marginBottom: 4,
      border: active ? '1px solid #1e293b' : '1px solid transparent',
      transition: 'all 0.15s var(--ease-out)',
    }}
    onMouseEnter={e => { if(!active) e.currentTarget.style.background='rgba(30,41,59,0.25)'; }}
    onMouseLeave={e => { if(!active) e.currentTarget.style.background='transparent'; }}>

      <div style={{
        width: 40, height: 40, borderRadius: 6, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 800, color, fontFamily: 'var(--font-mono)',
        background: `${color}10`, border: `1px solid ${color}35`,
      }}>{file.score}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, color: active ? '#fff' : '#e2e8f0',
          fontFamily: 'var(--font-mono)', fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={file.file_path}>{fname}</div>
        <div style={{
          fontSize: 10.5, color: '#64748b', marginTop: 3,
          fontFamily: 'var(--font-mono)', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{fdir} · <span style={{ color: '#94a3b8' }}>{file.lines_of_code} loc</span></div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        <DebtBadge level={file.debt_level} size="xs"/>
        <div style={{ width: 55, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${file.score}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.6s' }} />
        </div>
      </div>
    </div>
  );
}

/* ── MAIN COMPONENT ── */
export default function FilePanel({ files = [], setDiffData, setActiveTab }) {
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [langFilter,  setLangFilter]  = useState('ALL');
  const [scoreRange,  setScoreRange]  = useState([0, 100]);
  const [selected,    setSelected]    = useState(null);
  const [fixing,      setFixing]      = useState(false);
  const [fixResult,   setFixResult]   = useState(null);

  // 🎯 FIX: Reset selection when scan updates
  useEffect(() => {
    setSelected(null);
    setFixResult(null);
  }, [files]);

  const languages = useMemo(() => [...new Set(files.map(f => f.language).filter(Boolean))].sort(), [files]);

  const filtered = useMemo(() => {
    return [...files]
      .sort((a, b) => a.score - b.score)
      .filter(f => {
        if (levelFilter !== 'ALL' && f.debt_level?.toLowerCase() !== levelFilter.toLowerCase()) return false;
        if (langFilter  !== 'ALL' && f.language !== langFilter) return false;
        if (f.score < scoreRange[0] || f.score > scoreRange[1]) return false;
        return true;
      });
  }, [files, levelFilter, langFilter, scoreRange]);

  const handleSelect = (f) => { setSelected(f); setFixResult(null); };

  const handleFix = async () => {
    if (!selected) return;
    setFixing(true);
    const id = toast.loading('🤖 Generating AI fix…');
    try {
      const result = await generateFix({
        file_path: selected.file_path,
        original_code: selected.code || selected.original_code || '// No code content found',
        problems: selected.problems?.map(p => p.description) ?? [],
        language: selected.language,
      });
      
      setFixResult(result);
      if (setDiffData && setActiveTab) {
        setDiffData({
          fileName: selected.file_path,
          originalCode: selected.code || '// No code content found',
          fixedCode: result.fixed_code,
          explanation: result.explanation,
          oldScore: selected.score,
          newScore: result.improvement_score
        });
        setTimeout(() => setActiveTab('before_after'), 500);
      }
      toast.dismiss(id);
      toast.success(`✅ Fix ready — New Score: ${result.improvement_score}/100`);
    } catch (err) {
      toast.dismiss(id);
      const msg = err.response?.data?.detail || "AI Refactor Service unreachable.";
      toast.error(`❌ ${msg}`);
    } finally { setFixing(false); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24, height: '100%' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 720 }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', fontFamily: 'var(--font-mono)', letterSpacing: '0.14em' }}>
              {filtered.length} / {files.length} MODULES
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LevelSlicer value={levelFilter} onChange={setLevelFilter}/>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <LanguageSlicer languages={languages} value={langFilter} onChange={setLangFilter}/>
              <div style={{ flex: 1 }}><ScoreRangeSlicer min={0} max={100} value={scoreRange} onChange={setScoreRange}/></div>
            </div>
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: 8, flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontFamily: 'var(--font-mono)', fontSize: 12 }}>No files match filters</div>
          ) : filtered.map((f) => (
            <FileRow key={f.file_path} file={f} active={selected?.file_path === f.file_path} onClick={() => handleSelect(f)}/>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 12, padding: 28, overflowY: 'auto', maxHeight: 720 }}>
        {!selected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontFamily: 'var(--font-mono)', fontSize: 13 }}>← Select a file to view details</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, borderBottom: '1px solid #1e293b', paddingBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>{selected.file_path}</div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#94a3b8', fontFamily: 'var(--font-mono)', alignItems: 'center', fontWeight: 600 }}>
                  <span>{selected.lines_of_code || 0} LOC</span>
                  <span style={{ color: '#22d3ee', textTransform: 'uppercase' }}>{selected.language}</span>
                  <DebtBadge level={selected.debt_level} size="xs"/>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              {selected.problems?.map((p, i) => <ProblemCard key={i} problem={p} index={i}/>)}
            </div>

            {selected.problems?.length > 0 && (
              <button onClick={handleFix} disabled={fixing} style={{
                width: '100%', padding: '12px', background: fixing ? '#1e293b' : 'rgba(0,212,255,0.07)',
                border: `1px solid ${fixing ? '#1e293b' : 'rgba(0,212,255,0.25)'}`,
                borderRadius: 8, cursor: fixing ? 'wait' : 'pointer', fontSize: 12, fontWeight: 800,
                color: fixing ? '#64748b' : '#00d4ff', fontFamily: 'var(--font-mono)', transition: 'all .2s'
              }}>
                {fixing ? 'GENERATING AI FIX...' : '⚡ GENERATE AI FIX'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}