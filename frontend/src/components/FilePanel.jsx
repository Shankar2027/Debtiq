import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import toast from 'react-hot-toast';
import ScoreRing from './ScoreRing';
import DebtBadge from './DebtBadge';
import { LevelSlicer, ScoreRangeSlicer } from './Slicers';
import { scoreColor, generateFix } from '../services/api';

const FONT_MONO = "'JetBrains Mono', monospace";

// 🎯 EXTRACT CLEAN EXPLANATION - Smart Regex Version
function extractCleanExplanation(data) {
  if (!data) return "No diagnostic summary provided.";

  let textTarget = typeof data === 'string' ? data : (data.explanation || data.description || data.message || data.title || "");

  if (typeof textTarget === 'string') {
    textTarget = textTarget.trim();
    
    // If it looks like a raw JSON or Python dictionary string: "{ 'explanation': '...' }"
    if (textTarget.startsWith('{')) {
      // Hunt specifically for the explanation field using Regex
      const expMatch = textTarget.match(/['"]explanation['"]\s*:\s*['"](.*?)['"](?:,|\})/);
      if (expMatch && expMatch[1]) return expMatch[1];
      
      // Fallback to title if explanation is missing
      const titleMatch = textTarget.match(/['"]title['"]\s*:\s*['"](.*?)['"](?:,|\})/);
      if (titleMatch && titleMatch[1]) return titleMatch[1];
    }
    
    return textTarget;
  }

  return "Review required for this segment.";
}

// 🎯 MEMOIZED + USEREF: Custom Language Slicer with optimized event handling
const CustomLanguageSlicer = memo(function CustomLanguageSlicer({ languages = [], value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLanguageSelect = useCallback((lang) => {
    onChange(lang);
    setIsOpen(false);
  }, [onChange]);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block', width: '100%', minWidth: 180, zIndex: 50 }}>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          width: '100%',
          padding: '10px 16px',
          fontSize: 14,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color: 'var(--cyan)',
          background: '#030712',
          border: '1px solid #1e293b',
          borderRadius: 6,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          transition: 'all 0.2s ease',
        }}
      >
        <span>🧬 {value === 'ALL' ? 'ALL LANGUAGES' : value.toUpperCase()}</span>
        <span style={{ fontSize: 10, opacity: 0.7 }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          width: '100%',
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 8,
          boxShadow: '0 10px 25px rgba(0,0,0,0.7)',
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          maxHeight: 250,
          overflowY: 'auto',
          zIndex: 60
        }}>
          <LanguageOption label="🧬 ALL LANGUAGES" isSelected={value === 'ALL'} onClick={() => handleLanguageSelect('ALL')} />
          {languages.map(lang => (
            <LanguageOption key={lang} label={`⚡ ${lang.toUpperCase()}`} isSelected={value === lang} onClick={() => handleLanguageSelect(lang)} />
          ))}
        </div>
      )}
    </div>
  );
});

// 🎯 EXTRACTED + MEMOIZED: Language option button
const LanguageOption = memo(function LanguageOption({ label, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 14px',
        textAlign: 'left',
        background: isSelected ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
        color: isSelected ? 'var(--cyan)' : '#94a3b8',
        border: 'none',
        borderRadius: 4,
        fontSize: 14,
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace",
        cursor: 'pointer',
        transition: 'all 0.15s'
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(30,41,59,0.5)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
});

// 🎯 MEMOIZED: File row with stable style objects
const FileRow = memo(function FileRow({ file, active, onClick }) {
  const color = scoreColor(file.score);
  const fname = file.file_path.split('/').pop();
  const fdir = file.file_path.includes('/') ? file.file_path.split('/').slice(0, -1).join('/') + '/' : '';

  const derivedDebtLevel = useMemo(() => {
    if (file.score >= 85) return "healthy";
    if (file.score >= 70) return "minor";
    if (file.score >= 45) return "major";
    return "critical";
  }, [file.score]);

  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 16px', borderRadius: 8, cursor: 'pointer',
      background: active ? 'rgba(30, 41, 59, 0.65)' : 'rgba(11, 19, 41, 0.3)',
      marginBottom: 6,
      border: `1px solid ${active ? '#334155' : 'rgba(255,255,255,0.02)'}`,
      borderLeft: `4px solid ${active ? color : 'transparent'}`,
      boxShadow: active ? `0 4px 12px rgba(0,0,0,0.4)` : 'none',
      transition: 'all 0.2s ease',
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'rgba(11, 19, 41, 0.3)'; }}>

      <div style={{
        width: 42, height: 42, borderRadius: 6, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 800, color, fontFamily: 'var(--font-mono)',
        background: color + '15',
        border: `1px solid ${color}45`,
        textShadow: `0 0 8px ${color}40`,
        textAlign: 'center', lineHeight: '40px'
      }}>{file.score}</div>

      <div style={{ flex: 1, minWidth: 0 }} title={file.file_path}>
        <div style={{
          fontSize: 13, color: active ? '#ffffff' : '#f1f5f9',
          fontFamily: 'var(--font-mono)', fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: '-0.01em'
        }}>{fname}</div>
        <div style={{
          fontSize: 11, color: '#94a3b8', marginTop: 4,
          fontFamily: 'var(--font-mono)', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: '0.01em'
        }}>{fdir} · <span style={{ color: '#ffffff', fontWeight: 600 }}>{file.lines_of_code} loc</span></div>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexDirection: 'column' }}>
        <DebtBadge level={derivedDebtLevel} size="xs" />
        <div style={{ width: 55, height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${file.score}%`, height: '100%', background: color, transition: 'width 0.6s' }} />
        </div>
      </div>
    </div>
  );
});

// 🎯 MEMOIZED: Mini Ring component
const MiniRing = memo(function MiniRing({ score, size = 80 }) {
  const color = scoreColor(score);
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const cx = size / 2, cy = size / 2;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: -4, borderRadius: '50%',
        background: `radial-gradient(circle, ${color}20 0%, transparent 68%)`,
        animation: 'pulseRing 3s ease infinite'
      }} />
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="6" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 18, fontWeight: 900, color, fontFamily: 'var(--font-mono)', textShadow: `0 0 12px ${color}`, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 8, color: '#64748b', fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginTop: 2 }}>SCORE</span>
      </div>
    </div>
  );
});

// 🎯 MEMOIZED + OPTIMIZED: Code Display with virtualization consideration
const CodeDisplay = memo(function CodeDisplay({ code, startLine = 1, highlightLines = [] }) {
  if (!code) return null;

  const lines = typeof code === 'string' ? code.split('\n') : [];
  const highlightSet = useMemo(() => new Set(highlightLines), [highlightLines]);

  return (
    <div style={{
      background: '#010308',
      border: '1px solid #1e293b',
      borderRadius: 6,
      padding: 0,
      overflow: 'hidden',
      marginBottom: 20,
      maxHeight: '600px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        background: '#0f172a',
        padding: '8px 12px',
        borderBottom: '1px solid #1e293b',
        fontSize: 9,
        fontWeight: 700,
        color: '#4b5563',
        letterSpacing: '0.05em',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0
      }}>
        <span>❌ FLAGGED SOURCE CODE</span>
        <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 8 }}>
          Lines {startLine} - {startLine + lines.length - 1}
        </span>
      </div>

      <div style={{
        fontFamily: FONT_MONO,
        fontSize: 12,
        color: '#e2e8f0',
        overflowY: 'auto',
        overflowX: 'auto',
        flex: 1,
        padding: '8px 0',
        scrollBehavior: 'smooth'
      }}>
        {lines.map((line, idx) => {
          const lineNumber = startLine + idx;
          const isHighlighted = highlightSet.has(lineNumber);

          return (
            <CodeLine
              key={idx}
              lineNumber={lineNumber}
              line={line}
              isHighlighted={isHighlighted}
            />
          );
        })}
      </div>
    </div>
  );
});

// 🎯 EXTRACTED + MEMOIZED: Individual code line
const CodeLine = memo(function CodeLine({ lineNumber, line, isHighlighted }) {
  return (
    <div style={{
      display: 'flex',
      padding: '4px 0',
      background: isHighlighted ? 'rgba(255, 56, 96, 0.1)' : 'transparent',
      borderLeft: isHighlighted ? '3px solid #ff3860' : '3px solid transparent',
      transition: 'all 0.2s ease',
      minHeight: '20px'
    }}>
      <div style={{
        width: 50,
        paddingRight: 12,
        paddingLeft: 12,
        textAlign: 'right',
        color: isHighlighted ? '#ff3860' : '#4b5563',
        userSelect: 'none',
        flexShrink: 0,
        fontWeight: isHighlighted ? 700 : 400,
        fontSize: 11
      }}>
        {lineNumber}
      </div>
      <div style={{
        flex: 1,
        paddingRight: 12,
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        color: isHighlighted ? '#ff3860' : '#cbd5e1',
        fontWeight: isHighlighted ? 600 : 400,
        fontSize: 11
      }}>
        {line || ' '}
      </div>
    </div>
  );
});

// 🎯 MEMOIZED + USEREF: Problem card with optimized state management
const CollapsibleProblemCard = memo(function CollapsibleProblemCard({ problem, index, selected, handleFix, fixing }) {
  const [isOpen, setIsOpen] = useState(false);

  const data = useMemo(() => {
    if (!problem) return {
      title: "Architectural Fault",
      explanation: "Unknown compilation leak.",
      line_number: "N/A",
      category: "Code Smell",
      severity: "MAJOR"
    };

    if (typeof problem === 'string') {
      try {
        const parsed = JSON.parse(problem.replace(/'/g, '"').replace(/\\n/g, '\n'));
        return parsed;
      } catch (e) {
        return {
          title: problem,
          explanation: problem,
          line_number: "N/A",
          category: "Code Smell",
          severity: "MAJOR"
        };
      }
    }

    return problem;
  }, [problem]);

  const lineNum = data.line_number || data.line || "N/A";
  const faultyCodeText = data.faulty_code || data.line_content || data.code_snippet || (selected?.raw_content || selected?.content || selected?.code || selected?.original_code);
  const cleanExplanation = extractCleanExplanation(data);
  
  // ⚡ SMART DYNAMIC TITLE GENERATOR
  let titleText = data.title;
  if (!titleText || titleText === "Issue" || titleText === "Architectural Issue" || titleText === "Code Smell Highlight") {
    if (cleanExplanation && cleanExplanation.length > 10) {
      const words = cleanExplanation.split(' ');
      titleText = words.slice(0, 6).join(' ') + (words.length > 6 ? '...' : '');
      titleText = titleText.charAt(0).toUpperCase() + titleText.slice(1);
    } else {
      titleText = `${(data.severity || 'MAJOR')} ISSUE DETECTED`;
    }
  }

  const severityText = (data.severity || 'MAJOR').toUpperCase();
  const color = severityText === 'CRITICAL' ? '#ff3860' : severityText === 'MAJOR' ? '#f97316' : '#ffb800';

  const highlightLines = useMemo(() => {
    if (!lineNum || lineNum === "N/A") return [];
    const parts = String(lineNum).split('-').map(p => parseInt(p.trim()));
    const lines = [];
    if (parts.length === 2) {
      for (let i = parts[0]; i <= parts[1]; i++) {
        lines.push(i);
      }
    } else {
      lines.push(parts[0]);
    }
    return lines;
  }, [lineNum]);

  const startLineNum = useMemo(() => {
    if (!lineNum || lineNum === "N/A") return 1;
    const parts = String(lineNum).split('-');
    const start = parseInt(parts[0]) || 1;
    return Math.max(1, start - 3);
  }, [lineNum]);

  const handleFixClick = useCallback((e) => {
    e.stopPropagation();
    handleFix();
  }, [handleFix]);

  return (
    <div style={{
      background: 'rgba(11, 19, 41, 0.2)',
      border: `1px solid ${isOpen ? 'rgba(34, 211, 238, 0.4)' : '#1e293b'}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 14,
      transition: 'all 0.2s ease',
    }}>
      <div
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          position: 'relative',
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }}
      >
        {/* ⚡ NEW: Integrated dynamic title and live summary preview inside the flex column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10px', background: '#0e1626', border: '1px solid #1e293b', color: '#94a3b8', padding: '3px 8px', borderRadius: '4px', fontFamily: FONT_MONO, fontWeight: 700, letterSpacing: '0.05em' }}>ANALYSIS</span>
            <span style={{ fontSize: '10px', background: 'rgba(11,19,41,0.5)', border: '1px solid #1e293b', color: color, padding: '3px 8px', borderRadius: '4px', fontFamily: FONT_MONO, fontWeight: 700, letterSpacing: '0.05em' }}>{(data.category || 'CODE SMELL').toUpperCase()}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingRight: '70px' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9', fontFamily: 'var(--font-ui)', letterSpacing: '-0.01em' }}>
              {titleText}
            </div>
            
            {/* Live Summary Preview (Visible even when collapsed) */}
            <div style={{ fontSize: '13px', color: '#94a3b8', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>
              {cleanExplanation}
            </div>
          </div>
        </div>

        <div style={{ position: 'absolute', top: 20, right: 24 }}>
          <span style={{ fontSize: '10px', background: color + '15', color: color, border: `1px solid ${color}35`, padding: '3px 8px', borderRadius: '4px', fontWeight: 700, fontFamily: FONT_MONO }}>
            {severityText}
          </span>
        </div>
      </div>

      {isOpen && (
        <div style={{ padding: '0 24px 24px 24px', borderTop: '1px solid #1e293b', background: '#040812' }}>
          <div style={{
            display: 'flex',
            gap: 16,
            fontSize: '11px',
            color: '#64748b',
            fontFamily: FONT_MONO,
            padding: '16px 0',
            borderBottom: '1px solid rgba(255,255,255,0.02)',
            marginBottom: 16,
            flexWrap: 'wrap'
          }}>
            <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>📍 TARGET LINES: <span style={{ color: '#cbd5e1' }}>{lineNum}</span></span>
            <span style={{ fontWeight: 600 }}>CATEGORY: <span style={{ color: '#cbd5e1' }}>{data.category?.toUpperCase() || 'CODE SMELL'}</span></span>
          </div>

          <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6, marginBottom: 16, fontFamily: 'var(--font-ui)' }}>
            <strong style={{ color: '#ffffff', display: 'block', marginBottom: 8, fontSize: '12px' }}>📋 Diagnostic Summary:</strong>
            <div style={{ color: '#94a3b8', lineHeight: 1.7, wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
              {cleanExplanation}
            </div>
          </div>

          <CodeDisplay code={faultyCodeText} startLine={startLineNum} highlightLines={highlightLines} />

          <button
            onClick={handleFixClick}
            disabled={fixing}
            style={{
              background: 'rgba(34, 211, 238, 0.04)',
              border: '1px solid rgba(34, 211, 238, 0.25)',
              borderRadius: 6,
              padding: '11px 16px',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: FONT_MONO,
              color: '#22d3ee',
              cursor: fixing ? 'wait' : 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}
            onMouseEnter={e => {
              if (!fixing) {
                e.currentTarget.style.background = 'rgba(34,211,238,0.1)';
                e.currentTarget.style.borderColor = '#22d3ee';
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(34, 211, 238, 0.04)';
              e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.25)';
            }}
          >
            <span>🚀</span>
            <span>{fixing ? 'COMPILING PATCH...' : 'PATCH THIS FAULT'}</span>
          </button>
        </div>
      )}
    </div>
  );
});

// 🎯 MAIN COMPONENT WITH PERFORMANCE OPTIMIZATIONS
export default function FilePanel({ files = [], setDiffData, setActiveTab, onFileScoreUpdate }) {
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [langFilter, setLangFilter] = useState('ALL');
  const [scoreRange, setScoreRange] = useState([0, 100]);
  const [selected, setSelected] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [fixingAll, setFixingAll] = useState(false);
  const [fixResult, setFixResult] = useState(null);
  const [mobileView, setMobileView] = useState(window.innerWidth < 992);

  const resizeTimeoutRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(() => {
        setMobileView(window.innerWidth < 992);
      }, 150);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(resizeTimeoutRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (files.length > 0 && !selected) {
      setSelected(files[0]);
    }
  }, [files, selected]);

  const languages = useMemo(() => {
    return [...new Set(files.map(f => f.language).filter(Boolean))].sort();
  }, [files]);

  const filtered = useMemo(() => {
    return files
      .filter(f => {
        const localDebt = f.score >= 85 ? "healthy" : f.score >= 70 ? "minor" : f.score >= 45 ? "major" : "critical";
        
        if (levelFilter !== 'ALL' && localDebt !== levelFilter.toLowerCase()) return false;
        if (langFilter !== 'ALL' && f.language !== langFilter) return false;
        return f.score >= scoreRange[0] && f.score <= scoreRange[1];
      })
      .sort((a, b) => {
        if (a.score !== b.score) {
          return a.score - b.score;
        }
        
        const getWeight = (score) => {
          if (score >= 85) return 1;
          if (score >= 70) return 2;
          if (score >= 45) return 3;
          return 4;
        };
        
        return getWeight(b.score) - getWeight(a.score);
      });
  }, [files, levelFilter, langFilter, scoreRange]);

  const inspectorBlockRef = useRef(null);

  const handleSelect = useCallback((f) => {
    setSelected(f);
    setFixResult(null);
    if (mobileView && inspectorBlockRef.current) {
      setTimeout(() => {
        window.scrollTo({
          top: inspectorBlockRef.current.offsetTop - 80,
          behavior: 'smooth'
        });
      }, 80);
    }
  }, [mobileView]);

  const handleFix = useCallback(async () => {
    if (!selected) return;
    setFixing(true);
    const id = toast.loading('🤖 Launching Automated Refactor Engine...');
    const sourceTextStream = selected.raw_content || selected.content || selected.code || selected.original_code || "# Code empty.";

    try {
      const result = await generateFix({
        file_path: selected.file_path,
        original_code: sourceTextStream,
        problems: selected.problems || selected.issues || [], 
        language: selected.language,
        current_score: selected.score, 
      });

      const isCodeIdentical = (result.fixed_code || "").trim() === sourceTextStream.trim();
      let rawNewScore = result.improvement_score || selected.score; 
      
      if (isCodeIdentical || rawNewScore < selected.score) {
          rawNewScore = selected.score;
      }
      
      const delta = rawNewScore - selected.score; 
      setFixResult(result);

      if (onFileScoreUpdate) {
        onFileScoreUpdate(selected.file_path, rawNewScore);
      }
      setSelected(prev => ({ ...prev, score: rawNewScore }));

      if (setDiffData && setActiveTab) {
        setDiffData({
          fileName: selected.file_path,
          originalCode: sourceTextStream,
          fixedCode: result.fixed_code || '// Refactoring complete.',
          explanation: result.explanation || 'All alerts resolved.',
          oldScore: selected.score,
          newScore: rawNewScore
        });
        setTimeout(() => { setActiveTab('before_after'); }, 300);
      }
      
      toast.dismiss(id);
      
      if (delta > 0) {
        toast.success(`✅ +${delta} Point Improvement — New Score: ${rawNewScore}/100`);
      } else {
        toast.success(`✅ Refactored & Optimized — Base Architecture Stabilized.`);
      }
    } catch (err) {
      toast.dismiss(id);
      toast.error('Refactor failed to compile.');
    } finally {
      setFixing(false);
    }
  }, [selected, setDiffData, setActiveTab, onFileScoreUpdate]);

  const handleFixAllIssues = useCallback(async () => {
    if (!selected) return;
    setFixingAll(true);
    const id = toast.loading('🤖 Launching Comprehensive Refactor Engine...');
    const sourceTextStream = selected.raw_content || selected.content || selected.code || selected.original_code || "# Code empty.";

    try {
      const result = await generateFix({
        file_path: selected.file_path,
        original_code: sourceTextStream,
        problems: selected.problems || selected.issues || [], 
        language: selected.language,
        current_score: selected.score, 
      });

      const isCodeIdentical = (result.fixed_code || "").trim() === sourceTextStream.trim();
      let rawNewScore = result.improvement_score || selected.score;
      
      if (isCodeIdentical || rawNewScore < selected.score) {
          rawNewScore = selected.score;
      }
      
      const delta = rawNewScore - selected.score;
      setFixResult(result);

      if (onFileScoreUpdate) {
        onFileScoreUpdate(selected.file_path, rawNewScore);
      }
      setSelected(prev => ({ ...prev, score: rawNewScore }));

      if (setDiffData && setActiveTab) {
        setDiffData({
          fileName: selected.file_path,
          originalCode: sourceTextStream,
          fixedCode: result.fixed_code || '// Refactoring complete.',
          explanation: result.explanation || 'All alerts resolved.',
          oldScore: selected.score,
          newScore: rawNewScore
        });
        setTimeout(() => { setActiveTab('before_after'); }, 300);
      }
      
      toast.dismiss(id);
      
      if (delta > 0) {
        toast.success(`✅ All Issues Fixed: +${delta} Points Gain!`);
      } else {
        toast.success(`✅ Core Structure Hardened & Optimized.`);
      }
    } catch (err) {
      toast.dismiss(id);
      toast.error('Comprehensive refactor failed to compile.');
    } finally {
      setFixingAll(false);
    }
  }, [selected, setDiffData, setActiveTab, onFileScoreUpdate]);

  // 🛡️ FRONTEND QUALITY GATE LOGIC
  const rawIssues = selected ? (selected.problems || selected.issues || selected.faults || []) : [];
  const isHealthy = selected ? selected.score >= 85 : false;
  const displayIssues = isHealthy ? [] : rawIssues;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: mobileView ? '1fr' : '380px 1fr', gap: 24, height: '100%', alignItems: 'start' }}>
      {/* SIDEBAR FILE MATRIX COLUMN */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line-0)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: mobileView ? '500px' : '760px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #1e293b', background: 'rgba(3,7,18,0.4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', fontFamily: 'var(--font-mono)' }}>{filtered.length} / {files.length} MODULES</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>WORST FIRST ↑</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
            <div style={{ width: '100%', overflowX: 'auto', paddingBottom: 4 }}><LevelSlicer value={levelFilter} onChange={setLevelFilter} /></div>
            <div style={{ display: 'flex', flexDirection: mobileView ? 'column' : 'row', gap: 12 }}>
              <CustomLanguageSlicer languages={languages} value={langFilter} onChange={setLangFilter} />
              <div style={{ flex: 1, minWidth: 140 }}><ScoreRangeSlicer min={0} max={100} value={scoreRange} onChange={setScoreRange} /></div>
            </div>
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: 10, flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {files.length === 0 ? (
                <>
                  <div style={{ marginBottom: 8 }}>📡 No files loaded</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Waiting for data from API...</div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 8 }}>🔍 No matches found</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Try adjusting filters</div>
                </>
              )}
            </div>
          ) : (
            filtered.map((f) => (
              <FileRow key={f.file_path} file={f} active={selected?.file_path === f.file_path} onClick={() => handleSelect(f)} />
            ))
          )}
        </div>
      </div>

      {/* INSPECTOR PANEL COLUMN */}
      <div ref={inspectorBlockRef} id="telemetry-inspector-block" style={{ background: 'var(--bg-card)', border: '1px solid var(--line-0)', borderRadius: 12, padding: mobileView ? '20px' : '32px', overflowY: 'auto', maxHeight: mobileView ? 'auto' : '760px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        {!selected ? (
          <div style={{ padding: 40, color: '#475569', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>📡 SELECT A MODULE FILE TO RUN METRIC ANALYSIS</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: mobileView ? 'column-reverse' : 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, borderBottom: '1px solid #1e293b', paddingBottom: 20, gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)', marginBottom: 8, wordBreak: 'break-all' }}>{selected.file_path}</div>
                <div style={{ display: 'flex', gap: '10px 16px', fontSize: 11, color: '#94a3b8', fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
                  <span>SIZE: <span style={{ color: '#fff' }}>{selected.lines_of_code} LOC</span></span>
                  <span>ENGINE: <span style={{ color: 'var(--cyan)' }}>{selected.language?.toUpperCase()}</span></span>
                  <DebtBadge level={selected.score >= 85 ? "healthy" : selected.score >= 70 ? "minor" : selected.score >= 45 ? "major" : "critical"} size="xs" />
                </div>
              </div>

              {displayIssues.length > 0 && (
                <button
                  onClick={handleFixAllIssues}
                  disabled={fixingAll}
                  style={{
                    background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.15) 0%, rgba(34, 211, 238, 0.05) 100%)',
                    border: '1px solid rgba(34, 211, 238, 0.3)',
                    borderRadius: 8,
                    padding: '12px 20px',
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: FONT_MONO,
                    color: '#22d3ee',
                    cursor: fixingAll ? 'wait' : 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 4px 12px rgba(34, 211, 238, 0.15)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                  onMouseEnter={e => {
                    if (!fixingAll) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(34, 211, 238, 0.25) 0%, rgba(34, 211, 238, 0.15) 100%)';
                      e.currentTarget.style.borderColor = '#22d3ee';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(34, 211, 238, 0.25)';
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(34, 211, 238, 0.15) 0%, rgba(34, 211, 238, 0.05) 100%)';
                    e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.3)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(34, 211, 238, 0.15)';
                  }}
                >
                  <span style={{ fontSize: 13 }}>⚡</span>
                  <span>{fixingAll ? 'FIXING ALL...' : `FIX ALL (${displayIssues.length})`}</span>
                </button>
              )}

              <MiniRing score={selected.score} />
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>
              ARCHITECTURAL FAULTS IDENTIFIED ({displayIssues.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {isHealthy ? (
                <div style={{
                  padding: '32px 24px',
                  textAlign: 'center',
                  background: 'rgba(74, 222, 128, 0.05)',
                  borderRadius: '12px',
                  border: '1px dashed rgba(74, 222, 128, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                  marginTop: '10px'
                }}>
                  <div style={{ fontSize: '28px' }}>✨</div>
                  <div>
                    <h3 style={{ margin: '0 0 6px 0', color: '#4ade80', fontSize: '15px', fontWeight: 600, letterSpacing: '-0.01em', fontFamily: 'var(--font-ui)' }}>Module is fully optimized</h3>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px', lineHeight: 1.5, fontFamily: 'var(--font-ui)' }}>No architectural debt detected. This file exceeds quality gate thresholds.</p>
                  </div>
                </div>
              ) : (
                displayIssues.map((p, i) => (
                  <CollapsibleProblemCard key={i} problem={p} index={i} selected={selected} handleFix={handleFix} fixing={fixing} />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}