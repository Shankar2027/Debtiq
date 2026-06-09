import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { commitFixToGitHub } from '../services/api';

export default function BeforeAfterTab({ diffData, repo, branch, token }) {
  const [isCommitting, setIsCommitting] = useState(false);
  const [width, setWidth] = useState(window.innerWidth);

  // 🎯 Dynamic resize state attachment to enforce layout safety across stacked mobile frames
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // If no refactor has been run yet, show a clean empty state
  if (!diffData || !diffData.fixedCode) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
        📡 NO ACTIVE REFACTOR DATA. GO TO FILES TAB AND INITIALIZE AI CO-PILOT.
      </div>
    );
  }

  const oldScore = Number(diffData.oldScore) || 35;
  const newScore = Number(diffData.newScore) || 89;
  const improvement = newScore - oldScore;
  const isMobile = width < 768;

  // 🎯 DYNAMIC HEADER DELTA TEXT PARSING (Resolves the "+-" text alignment glitch)
  let improvementText = '';
  let improvementColor = 'var(--green)';

  if (improvement > 0) {
    improvementText = `+${improvement} point improvement`;
  } else if (improvement === 0) {
    improvementText = 'Architecture Optimized & Stabilized';
    improvementColor = 'var(--cyan)';
  } else {
    improvementText = `${improvement} variation delta warning`;
    improvementColor = '#ff3860';
  }

  // 🚀 GitHub Commit Handler with Robust Error Interceptions (Issue #5)
  const handleCommit = async () => {
    if (!token || token.trim() === '') {
      toast.error('⚠️ Please enter your GitHub Token in the top navbar first!');
      return;
    }

    if (!repo || repo.trim() === '') {
      toast.error('⚠️ Repository target could not be identified.');
      return;
    }

    setIsCommitting(true);
    const toastId = toast.loading('🚀 Pushing refactored code block directly to GitHub...');
    
    try {
      await commitFixToGitHub({
        repo_name: repo,
        file_path: diffData.fileName,
        new_code: diffData.fixedCode,
        token: token,
        branch: branch || "main"
      });
      toast.success('✨ Successfully committed to remote GitHub repository tracking node branch!', { id: toastId });
    } catch (error) {
      console.error("Commit execution fault intercepted:", error);
      const systemMessage = error.response?.data?.detail || error.message || 'GitHub Authentication Rejected';
      toast.error(`❌ Commit failed: ${systemMessage}`, { id: toastId });
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, padding: '20px 0', animation: 'slideUp 0.4s ease', width: '100%' }}>
      
      {/* HEADER TITLE */}
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 8, wordBreak: 'break-all' }}>
          Refactoring <span style={{ color: 'var(--cyan)' }}>{diffData.fileName?.split('/').pop() || 'Module'}</span>
        </h2>
        <div style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
          Live API Data · AI-assisted refactoring · <span style={{ color: improvementColor, fontWeight: 700 }}>{improvementText}</span>
        </div>
      </div>

      {/* SPLIT VIEW CONTAINER — Upgraded with Dynamic Breakpoints */}
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row', 
        alignItems: 'stretch', 
        gap: 24, 
        position: 'relative',
        width: '100%'
      }}>
        
        {/* LEFT: TECHNICAL DEBT (BEFORE) */}
        <div style={{ flex: 1, minWidth: 0, background: '#090d16', border: '1px solid rgba(255,56,96,0.3)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,56,96,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ff3860', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em' }}>
            <span>❌ BEFORE — TECHNICAL DEBT</span>
            <span>{oldScore}/100</span>
          </div>
          <div style={{ padding: 20, overflowX: 'auto', flex: 1, maxHeight: '450px' }}>
            <pre style={{ margin: 0, color: '#fda4af', fontSize: 13, fontFamily: 'var(--font-mono)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              <code>{diffData.originalCode}</code>
            </pre>
          </div>
        </div>

        {/* CENTER GLOWING ARROW */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, transform: isMobile ? 'rotate(90deg)' : 'none', margin: isMobile ? '4px 0' : '0' }}>
          <div style={{ 
            width: 44, height: 44, borderRadius: '50%', background: 'var(--cyan)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            color: '#000', fontWeight: 900, boxShadow: '0 0 24px rgba(0,229,255,0.4)', fontSize: 20 
          }}>
            →
          </div>
        </div>

        {/* RIGHT: AI REFACTORED (AFTER) */}
        <div style={{ flex: 1, minWidth: 0, background: '#090d16', border: '1px solid rgba(57,255,20,0.3)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(57,255,20,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em' }}>
            <span>✓ AFTER — AI REFACTORED</span>
            <span>{newScore}/100</span>
          </div>
          <div style={{ padding: 20, overflowX: 'auto', flex: 1, maxHeight: '450px' }}>
            <pre style={{ margin: 0, color: '#a7f3d0', fontSize: 13, fontFamily: 'var(--font-mono)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              <code>{diffData.fixedCode}</code>
            </pre>
          </div>
        </div>

      </div>

      {/* BOTTOM EXPLANATION PANEL */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 16 }}>✨</span>
          <span style={{ fontSize: 12, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.05em' }}>AI ARCHITECTURAL SUMMARY</span>
        </div>
        <p style={{ color: '#e2e8f0', fontSize: 14, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
          {diffData.explanation}
        </p>
      </div>
      
      {/* GITHUB COMMIT BUTTON */}
      <div style={{ textAlign: 'right', marginTop: 16, position: 'relative', zIndex: 99 }}>
        <button 
          onClick={handleCommit}
          disabled={isCommitting}
          style={{ 
            width: isMobile ? '100%' : 'auto',
            background: isCommitting ? '#475569' : 'var(--green)', 
            color: '#000', 
            padding: '14px 28px', 
            borderRadius: '8px', 
            fontWeight: 800,
            fontSize: 14,
            fontFamily: 'var(--font-mono)',
            border: 'none',
            cursor: isCommitting ? 'wait' : 'pointer',
            boxShadow: isCommitting ? 'none' : '0 0 24px rgba(57,255,20,0.5)',
            transition: 'all 0.2s ease',
            pointerEvents: 'auto'
          }}
        >
          {isCommitting ? 'COMMITTING TO GITHUB...' : '🚀 COMMIT FIX DIRECTLY TO GITHUB'}
        </button>
      </div>

    </div>
  );
}