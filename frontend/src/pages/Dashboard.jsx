import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import toast from 'react-hot-toast';
import { scanRepo, scoreColor, scoreToLabel, getScanHistory } from '../services/api';
import ScoreRing from '../components/ScoreRing';
import StatCard  from '../components/StatCard';
import FilePanel from '../components/FilePanel';
import BeforeAfterTab from '../components/BeforeAfterTab'; 

const FONT_MONO = "'JetBrains Mono', monospace";
const TIP_STYLE = {
  backgroundColor:'#0d1527', border:'1px solid #1e293b',
  borderRadius:8, fontFamily:FONT_MONO, fontSize:11,
};

const axisStyle = { fontSize:10, fill:'#94a3b8', fontFamily:FONT_MONO };
const gridStyle = { stroke:'rgba(255,255,255,0.02)' };

function jsonParseSafe(data) {
  try { return JSON.parse(data); } catch { return null; }
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  const c = scoreColor(v ?? 50);
  return (
    <div style={{ ...TIP_STYLE, padding:'9px 13px' }}>
      <div style={{ fontSize:10, color:'#94a3b8', marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:16, fontWeight:700, color:c }}>{v}<span style={{ fontSize:10, marginLeft:2, color:'#64748b' }}>/100</span></div>
    </div>
  );
}

function StatusBadge({ score }) {
  const label = score >= 80 ? 'HEALTHY CODEBASE' : score >= 60 ? 'MINOR DEBT' : score >= 30 ? 'MAJOR DEBT' : 'CRITICAL DEBT';
  const color = scoreColor(score);
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:7,
      background:`${color}13`, color,
      border:`1px solid ${color}35`, borderRadius:20,
      padding:'4px 13px', fontSize:10, fontWeight:700,
      fontFamily:FONT_MONO, letterSpacing:'0.12em',
      boxShadow:`0 0 12px ${color}25`,
      whiteSpace: 'nowrap'
    }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:color,
        boxShadow:`0 0 6px ${color}`, display:'inline-block' }}/>
      STATUS: {label}
    </span>
  );
}

const TABS = [
  { id:'overview',    label:'⚡ Overview' },
  { id:'files',       label:'📁 Files'    },
  { id:'before_after', label:'✨ Before / After' }, 
];

export default function Dashboard() {
  const [repo, setRepo] = useState(() => localStorage.getItem('debtiq_repo') || '');
  const [branch, setBranch] = useState(() => localStorage.getItem('debtiq_branch') || 'main');
  const [token, setToken] = useState(() => localStorage.getItem('debtiq_token') || '');
  
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('overview');
  
  const [scan, setScan] = useState(() => {
    const savedScan = localStorage.getItem('debtiq_last_scan');
    return savedScan ? jsonParseSafe(savedScan) : null;
  });

  const [history, setHistory] = useState([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  
  const [diffData, setDiffData] = useState({
    fileName: '', originalCode: '', fixedCode: '', explanation: '', oldScore: 0, newScore: 0
  });

  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state && event.state.view) {
        setTab(event.state.view);
      } else {
        setScan(null);
        setTab('overview');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    localStorage.setItem('debtiq_repo', repo);
    localStorage.setItem('debtiq_branch', branch);
    localStorage.setItem('debtiq_token', token);
  }, [repo, branch, token]);

  useEffect(() => {
    if (scan) {
      localStorage.setItem('debtiq_last_scan', JSON.stringify(scan));
    } else {
      localStorage.removeItem('debtiq_last_scan');
    }
  }, [scan]);

  const fetchHistoryLogs = useCallback(async () => {
    if (!repo || !repo.includes('/')) return;
    const [owner, name] = repo.split('/');
    try {
      const data = await getScanHistory(owner, name);
      if (data && data.history) {
        setHistory(data.history);
      }
    } catch (err) {
      console.warn("Failed fetching historical analytics metadata indices.", err);
    }
  }, [repo]);

  useEffect(() => {
    fetchHistoryLogs();
  }, [fetchHistoryLogs]);

  const handleScan = useCallback(async () => {
    if (!repo.includes('/')) { toast.error('Format: owner/repo'); return; }
    
    setLoading(true);
    setDiffData({ fileName: '', originalCode: '', fixedCode: '', explanation: '', oldScore: 0, newScore: 0 });
    setTab('overview');

    const id = toast.loading('⚡ Scanning repository…');
    try {
      const result = await scanRepo({ repo_full_name:repo, branch, github_token:token||undefined, max_files:50 });
      setScan(result);
      
      window.history.pushState({ view: "overview" }, "");

      toast.dismiss(id);
      toast.success(`Score: ${result.overall_score}/100 — ${result.files_scanned} files analyzed`);
      fetchHistoryLogs(); 
    } catch (err) {
      toast.dismiss(id);
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to scan repository';
      toast.error(`Error: ${errorMsg}`);
    } finally { setLoading(false); }
  }, [repo, branch, token, fetchHistoryLogs]);

  // 🎯 PIPELINE LINK: Intercepts patches from children and recalculates severity cards
  const handleFileScoreUpdate = useCallback((filePath, updatedScore) => {
    setScan(prevScan => {
      if (!prevScan) return null;

      const updatedFileScores = prevScan.file_scores.map(file => {
        if (file.file_path === filePath) {
          // ⚡ FIXED BOUNDARIES: Synchronized perfectly with the server's tracking logic
          let nextDebt = "healthy";
          if (updatedScore < 45) nextDebt = "critical";
          else if (updatedScore < 70) nextDebt = "major";  // Scores like 60 stay major
          else if (updatedScore < 85) nextDebt = "minor";  // Scores like 70 cross into minor

          return { ...file, score: updatedScore, debt_level: nextDebt };
        }
        return file;
      });

      // Recalculate summary metrics from the modified file matrix
      let critical = 0, major = 0, minor = 0, healthy = 0;
      updatedFileScores.forEach(f => {
        if (f.score >= 85) healthy++;
        else if (f.score >= 70) minor++;
        else if (f.score >= 45) major++;
        else critical++;
      });

      // Safely calculate the new overall score, preventing division by zero if empty
      const nextOverall = updatedFileScores.length > 0 
        ? Math.round(updatedFileScores.reduce((sum, f) => sum + (Number(f.score) || 0), 0) / updatedFileScores.length)
        : 0;

      return {
        ...prevScan,
        overall_score: nextOverall,
        critical_count: critical,
        major_count: major,
        minor_count: minor,
        healthy_count: healthy,
        file_scores: updatedFileScores
      };
    });
  }, []);

  const emptyData = {
    overall_score: 0, critical_count: 0, major_count: 0, minor_count: 0, healthy_count: 0,
    files_scanned: 0, scan_duration_seconds: 0.0,
    repo_full_name: repo || 'Enter owner/repository', branch: branch || '-', file_scores: []
  };

  const currentData = scan || emptyData; 
  const color = scoreColor(currentData.overall_score);

  // 🎯 OPTIMIZED DYNAMIC METRICS: Recalculates category distributions immediately following state edits
  const dynamicCounts = useMemo(() => {
    let critical = 0, major = 0, minor = 0, healthy = 0;
    (currentData.file_scores || []).forEach(f => {
      if (f.score >= 85) healthy++;
      else if (f.score >= 70) minor++;
      else if (f.score >= 45) major++;
      else critical++;
    });
    return { critical, major, minor, healthy };
  }, [currentData.file_scores]);

  const pie = [
    { name:'Critical', value: dynamicCounts.critical, color:'#ff3860' },
    { name:'Major',    value: dynamicCounts.major,    color:'#f97316' },
    { name:'Minor',    value: dynamicCounts.minor,    color:'#ffb800' },
    { name:'Healthy',  value: dynamicCounts.healthy,  color:'#39ff14' },
  ].filter(d => d.value > 0);

  const worstFiles = [...currentData.file_scores]
    .sort((a,b) => a.score - b.score).slice(0,7)
    .map(f => ({ name:f.file_path.split('/').pop(), score:f.score }));

  const langMap = currentData.file_scores.reduce((a,f) => { a[f.language]=(a[f.language]||0)+1; return a; }, {});
  const langData = Object.entries(langMap).map(([name,count]) => ({ name, count }));

  const trendData = history.length > 0 
    ? [...history].reverse().map(h => ({ date: new Date(h.scanned_at).toLocaleDateString(undefined, {month:'short', day:'numeric'}), score: h.overall_score }))
    : [ {date:'Initial',score:0}, {date:'Current',score:currentData.overall_score} ];

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-void)', fontFamily:'var(--font-ui)', position: 'relative', overflowX: 'hidden' }}>
      
      {/* HEADER NAVBAR */}
      <header style={{
        background:'rgba(6,11,20,.96)', backdropFilter:'blur(16px)',
        borderBottom:'1px solid var(--line-0)', position:'sticky', top:0, zIndex:50, padding:'0 16px',
      }}>
        <div style={{ maxWidth:1440, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', minHeight:70, padding: '10px 0', flexWrap: 'wrap', gap: 12 }}>
          
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:8, background:'linear-gradient(135deg, #00d4ff, #0080ff)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:19, boxShadow:'0 0 18px rgba(0,212,255,.4)' }}>⚡</div>
            <span style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.02em', background:'linear-gradient(135deg, #00d4ff, #0080ff)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>DebtIQ™</span>
          </div>

          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            {scan && (
              <>
                <button 
                  onClick={() => setShowHistoryPanel(!showHistoryPanel)}
                  style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--line-1)', borderRadius: 8, padding: '9px 14px', fontSize: 12, color: '#22d3ee', fontFamily: FONT_MONO, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center', transition: 'all 0.2s'
                  }}
                >
                  📜 HISTORY ({history.length})
                </button>
                <button 
                  onClick={() => {
                    localStorage.removeItem('debtiq_last_scan');
                    localStorage.removeItem('debtiq_repo');
                    localStorage.removeItem('debtiq_branch');
                    localStorage.removeItem('debtiq_token');
                    
                    setScan(null);
                    setRepo('');
                    setBranch('main');
                    setToken('');
                    setHistory([]);
                    setTab('overview');
                    toast.success('Workspace reset successfully!');
                  }}
                  style={{ background:'rgba(255,56,96,0.1)', border:'1px solid rgba(255,56,96,0.3)', borderRadius:8, padding:'9px 14px', fontSize:12, color:'#ff3860', fontFamily:FONT_MONO, cursor:'pointer' }}
                >
                  🔄 NEW SCAN
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* DRAWER PANEL */}
      {showHistoryPanel && scan && (
        <div style={{ position: 'fixed', top: 71, right: 0, bottom: 0, width: '100%', maxWidth: 380, background: 'rgba(6, 11, 22, 0.98)', borderLeft: '1px solid var(--line-0)', zIndex: 100, padding: 24, boxSizing: 'border-box', overflowY: 'auto', backdropFilter: 'blur(12px)', boxShadow: '-10px 0 30px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontFamily: FONT_MONO, color: '#fff', margin: 0, letterSpacing: '0.05em' }}>📊 SCAN HISTORY LOGS</h3>
            <button onClick={() => setShowHistoryPanel(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', fontFamily: FONT_MONO }}>✕</button>
          </div>
          {history.length === 0 ? (
            <div style={{ color: '#4b5563', fontFamily: FONT_MONO, fontSize: 12, textAlign: 'center', marginTop: 40 }}>No scans found.</div>
          ) : (
            history.map((hist) => {
              const hColor = scoreColor(hist.overall_score);
              const label = hist.overall_score >= 80 ? 'HEALTHY' : hist.overall_score >= 60 ? 'MINOR' : hist.overall_score >= 30 ? 'MAJOR' : 'CRITICAL';
              return (
                <div 
                  key={hist.id || hist.scanned_at} 
                  onClick={() => { setScan(hist); setDiffData({ fileName: '', originalCode: '', fixedCode: '', explanation: '', oldScore: 0, newScore: 0 }); setShowHistoryPanel(false); setTab('files'); window.history.pushState({ view: "files" }, ""); }}
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #1e293b', borderRadius: 8, padding: 16, marginBottom: 12, cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--cyan)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#1e293b'}
                >
                  <div style={{ fontSize: 11, color: 'var(--cyan)', fontFamily: FONT_MONO, marginBottom: 6, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📦 {hist.repo_full_name || repo}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 16, color: hColor, fontFamily: FONT_MONO, fontWeight: 900 }}>{hist.overall_score} pts</span>
                      <span style={{ fontSize: 10, background: `${hColor}15`, color: hColor, border: `1px solid ${hColor}35`, padding: '2px 6px', borderRadius: 4, fontWeight: 700, fontFamily: FONT_MONO }}>{label}</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#22d3ee', fontFamily: FONT_MONO, fontWeight: 700, background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.25)', padding: '2px 8px', borderRadius: 4 }}>
                      🌿 {hist.branch || 'main'}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', fontFamily: FONT_MONO, display: 'flex', justifyContent: 'space-between' }}>
                    <span>⏱ {new Date(hist.scanned_at).toLocaleDateString()}</span>
                    <span>{new Date(hist.scanned_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* COMPONENT BODY VIEWPORTS */}
      <main style={{ maxWidth:1440, margin:'0 auto', padding:'24px 16px', boxSizing: 'border-box' }}>
        
        {!scan ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '65vh', padding: '20px 0' }}>
            <div style={{ width: '100%', maxWidth: 520, background: 'rgba(13, 21, 39, 0.6)', border: '1px solid var(--line-1)', borderRadius: 14, padding: '32px 24px', boxSizing: 'border-box', backdropFilter: 'blur(20px)' }}>
              
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#fff' }}>Analyze Codebase Quality</h2>
                <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 8, lineHeight: 1.4 }}>Enter your repository criteria endpoints below to launch our structural analyzer.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 10, fontFamily: FONT_MONO, fontWeight: 700, color: '#cbd5e1' }}>📁 GITHUB REPOSITORY PATH *</label>
                  <input value={repo} onChange={e => setRepo(e.target.value)} onKeyDown={e => e.key === 'Enter' && repo.includes('/') && handleScan()} type="text" placeholder="username/repository-name" style={{ width: '100%', boxSizing: 'border-box', background: '#060b14', border: '1px solid var(--line-1)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: FONT_MONO }} />
                </div>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 100px' }}>
                    <label style={{ fontSize: 10, fontFamily: FONT_MONO, fontWeight: 700, color: '#cbd5e1' }}>🌿 GIT BRANCH</label>
                    <input value={branch} onChange={e => setBranch(e.target.value)} type="text" placeholder="main" style={{ width: '100%', boxSizing: 'border-box', background: '#060b14', border: '1px solid var(--line-1)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#fff', fontFamily: FONT_MONO }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '2 1 200px' }}>
                    <label style={{ fontSize: 10, fontFamily: FONT_MONO, fontWeight: 700, color: '#cbd5e1' }}>🔑 ACCESS TOKEN (OPTIONAL)</label>
                    <input value={token} onChange={e => setToken(e.target.value)} type="password" placeholder="Secure token path keys" style={{ width: '100%', boxSizing: 'border-box', background: '#060b14', border: token ? '1px solid #39ff1440' : '1px solid var(--line-1)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#fff', fontFamily: FONT_MONO }} />
                  </div>
                </div>

                <button onClick={handleScan} disabled={loading || !repo.includes('/')} style={{ width: '100%', background: loading || !repo.includes('/') ? 'var(--bg-raised)' : 'linear-gradient(135deg, #00d4ff, #0080ff)', color: loading || !repo.includes('/') ? 'var(--txt-2)' : '#000', border: 'none', borderRadius: 8, padding: '14px 0', fontSize: 13, fontWeight: 800, cursor: loading ? 'wait' : !repo.includes('/') ? 'not-allowed' : 'pointer', fontFamily: FONT_MONO, marginTop: 8, boxShadow: loading || !repo.includes('/') ? 'none' : '0 4px 16px rgba(0,212,255,0.2)' }}>
                  {loading ? 'AUDITING REPOSITORY INFRASTRUCTURE…' : '⚡ TRIGGER QUALITY SCAN'}
                </button>
              </div>

            </div>
          </div>
        ) : (
          <div style={{ animation: 'slideUp .35s var(--ease) both' }}>
            
            <div style={{ display:'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap: 'wrap' }}>
                <span style={{ fontSize:'22px', fontWeight:800, color:'var(--txt-0)', fontFamily:FONT_MONO, wordBreak: 'break-all' }}>{currentData.repo_full_name}</span>
                <StatusBadge score={currentData.overall_score}/>
              </div>
              <div style={{ display:'flex', gap: '8px 16px', fontSize:12, color:'var(--txt-2)', fontFamily:FONT_MONO, flexWrap: 'wrap' }}>
                <span>📂 {currentData.files_scanned} files</span>
                <span>🌿 branch: {currentData.branch}</span>
                <span>⏱ runtime: {currentData.scan_duration_seconds}s</span>
              </div>
            </div>

            {/* RESPONSIVE SCORE CARD GRID MAPPERS */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:16, marginBottom:28 }}>
              <div style={{ background:'linear-gradient(135deg, #0d1527 0%, #060b14 100%)', border:`1px solid ${color}40`, borderRadius:12, padding:20, display:'flex', alignItems:'center', gap:16, boxShadow:`0 4px 20px ${color}10` }}>
                <ScoreRing score={currentData.overall_score} size={85}/>
                <div>
                  <div style={{ fontSize:10, fontFamily:FONT_MONO, color:'var(--txt-2)' }}>OVERALL SCORE</div>
                  <div style={{ fontSize:22, fontWeight:900, color:'#fff', fontFamily:FONT_MONO }}>{currentData.overall_score}</div>
                </div>
              </div>

              {/* ⚡ REAL-TIME COMPUTED VALUE MATRICES */}
              <StatCard label="Critical" value={dynamicCounts.critical} sub={dynamicCounts.critical===0?'Clean':'Fix now'} color="#ff3860" icon="🔴" delay={40}/>
              <StatCard label="Major"   value={dynamicCounts.major} sub="review" color="#f97316" icon="🟠" delay={80}/>
              <StatCard label="Minor"   value={dynamicCounts.minor} sub="warning" color="#ffb800" icon="🟡" delay={120}/>
              <StatCard label="Healthy" value={dynamicCounts.healthy} sub="passed" color="#39ff14" icon="🟢" delay={160}/>
            </div>

            {/* TAB SCROLL PANELS */}
            <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'1px solid #1e293b', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => { setTab(t.id); window.history.pushState({ view: t.id }, ""); }} style={{ background:'none', border:'none', padding:'10px 16px', fontSize:13, fontWeight: tab===t.id ? 800 : 600, color: tab===t.id ? '#22d3ee' : '#64748b', fontFamily:FONT_MONO, borderBottom: tab===t.id ? '2px solid #22d3ee' : '2px solid transparent', whiteSpace: 'nowrap', cursor: 'pointer' }}>{t.label}</button>
              ))}
            </div>

            {tab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:20 }}>
                  <div style={{ background:'var(--bg-card)', border:'1px solid var(--border-dim)', borderRadius:12, padding:20, minWidth: 0 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#cbd5e1', fontFamily:FONT_MONO, marginBottom:16 }}>📈 SCORE TIMELINE TRENDS</div>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={trendData} margin={{ left: -25, right: 5 }}>
                        <defs>
                          <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00d4ff" stopOpacity={0.15}/><stop offset="95%" stopColor="#00d4ff" stopOpacity={0}/></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" {...gridStyle}/>
                        <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false}/>
                        <YAxis domain={[0,100]} tick={axisStyle} axisLine={false} tickLine={false}/>
                        <Tooltip content={<ChartTooltip/>}/>
                        <Area type="monotone" dataKey="score" stroke="#00d4ff" strokeWidth={2} fill="url(#tGrad)" dot={{ fill:'#00d4ff', r:4 }}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ background:'var(--bg-card)', border:'1px solid var(--border-dim)', borderRadius:12, padding:20, minWidth: 0 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#cbd5e1', fontFamily:FONT_MONO, marginBottom:12 }}>🎯 CODE METRIC RATIOS</div>
                    <div style={{ position:'relative', width:'100%', height:150, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart><Pie data={pie} cx="50%" cy="50%" innerRadius={48} outerRadius={64} paddingAngle={4} dataKey="value" stroke="none">{pie.map((d,i) => <Cell key={i} fill={d.color}/>)}</Pie></PieChart>
                      </ResponsiveContainer>
                      <div style={{ position:'absolute', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                        <span style={{ fontSize:20, fontWeight:900, color:'#fff', fontFamily:FONT_MONO }}>{dynamicCounts.critical + dynamicCounts.major + dynamicCounts.minor}</span>
                        <span style={{ fontSize:8, color:'#64748b', fontFamily:FONT_MONO }}>ISSUES</span>
                      </div>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', marginTop:12 }}>
                      {pie.map((d,i) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:7, height:7, borderRadius:'50%', background:d.color }}/><span style={{ fontSize:10, color:'var(--txt-2)', fontFamily:FONT_MONO }}>{d.name} ({d.value})</span></div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:20 }}>
                  <div style={{ background:'var(--bg-card)', border:'1px solid var(--border-dim)', borderRadius:12, padding:20, minWidth: 0 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#cbd5e1', fontFamily:FONT_MONO, marginBottom:16 }}>⚠️ WORST PERFORMING SUB-FILES</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {worstFiles.length > 0 ? worstFiles.map((f,i) => {
                        const c = scoreColor(f.score);
                        return (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:11, color:'var(--txt-1)', fontFamily:FONT_MONO, textOverflow:'ellipsis', overflow:'hidden', whiteSpace:'nowrap', width:90 }}>{f.name}</span>
                            <div style={{ flex:1, height:10, background:'var(--bg-void)', borderRadius:4, overflow:'hidden' }}><div style={{ width:`${f.score}%`, height:'100%', background:c }}/></div>
                            <span style={{ fontSize:10, color:c, fontFamily:FONT_MONO, fontWeight:700 }}>{f.score}</span>
                          </div>
                        );
                      }) : <div style={{ color: 'var(--txt-2)', fontFamily: FONT_MONO, fontSize: 11 }}>Empty matrix logs.</div>}
                    </div>
                  </div>

                  <div style={{ background:'var(--bg-card)', border:'1px solid var(--border-dim)', borderRadius:12, padding:20, minWidth: 0 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#cbd5e1', fontFamily:FONT_MONO, marginBottom:16 }}>🔧 CORE TECHNOLOGY DISTRIBUTION</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={langData}>
                        <CartesianGrid strokeDasharray="3 3" {...gridStyle} vertical={false}/>
                        <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false}/>
                        <YAxis tick={axisStyle} axisLine={false} tickLine={false}/>
                        <Bar dataKey="count" fill="#00d4ff" radius={[4,4,0,0]} barSize={25}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {tab === 'files' && (
              <div style={{ animation:'slideUp .35s var(--ease) both' }}>
                <FilePanel 
                  files={currentData.file_scores} 
                  setDiffData={setDiffData} 
                  setActiveTab={(t) => { setTab(t); window.history.pushState({ view: t }, ""); }} 
                  onFileScoreUpdate={handleFileScoreUpdate}
                />
              </div>
            )}
            {tab === 'before_after' && <div style={{ animation:'slideUp .35s var(--ease) both' }}><BeforeAfterTab diffData={diffData} repo={repo} branch={branch} token={token} /></div>}
          </div>
        )}
      </main>
    </div>
  );
}