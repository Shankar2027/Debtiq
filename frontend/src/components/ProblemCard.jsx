import React from 'react';
import DebtBadge from './DebtBadge';
import { scoreColor } from '../services/api';

const SEV_SCORE = { critical: 21, major: 39, minor: 72 };

export default function ProblemCard({ problem, index = 0 }) {
  // Guard against an empty problem object injection
  if (!problem) return null;

  // Ensure case-insensitive fallback logic for severity lookups
  const severityKey = problem.severity?.toLowerCase() || 'minor';
  const color = scoreColor(SEV_SCORE[severityKey] ?? 72);
  
  // Guard against missing issue types
  const typeLabel = problem.type 
    ? problem.type.replace(/_/g, ' ').toUpperCase() 
    : 'CODE SMELL';

  return (
    <div style={{
      background: '#0d1527', /* Premium solid block surface avoids text bleeding */
      border: '1px solid #1e293b',
      borderLeft: `4px solid ${color}`,
      borderRadius: 8, 
      padding: '16px 20px',
      marginBottom: 4,
      position: 'relative', 
      overflow: 'hidden',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    }}>

      {/* Top Header Row Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            background: 'var(--bg-void)', border: '1px solid #1e293b',
            borderRadius: 4, padding: '3px 10px',
            fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
            color: 'var(--txt-2)', fontFamily: 'var(--font-mono)',
          }}>ANALYSIS</span>
          <span style={{
            background: `${color}15`, border: `1px solid ${color}35`,
            borderRadius: 4, padding: '3px 10px',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
            color, fontFamily: 'var(--font-mono)',
          }}>{typeLabel}</span>
        </div>
        
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {problem.line !== undefined && problem.line !== null && (
            <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              LINE {problem.line}
            </span>
          )}
          <DebtBadge level={severityKey} size="xs"/>
        </div>
      </div>

      {/* Primary Issue Content */}
      <p style={{ 
        fontSize: 13.5, 
        color: '#ffffff', 
        fontWeight: 500, 
        lineHeight: 1.65, 
        marginBottom: problem.suggestion ? 14 : 0, // Remove bottom margin if no box follows
        letterSpacing: '-0.005em'
      }}>
        {problem.description || 'No detailed issue description provided.'}
      </p>

      {/* Fix Execution Instruction Box - 🎯 FIX: Only render if an action suggestion exists */}
      {problem.suggestion && problem.suggestion.trim() !== '' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(0, 229, 255, 0.03)', 
          border: '1px solid rgba(0, 229, 255, 0.15)',
          borderRadius: 6, padding: '10px 14px',
        }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>💡</span>
          <p style={{
            fontSize: 11.5, color: 'var(--cyan)', lineHeight: 1.5,
            margin: 0,
            fontFamily: 'var(--font-mono)', fontWeight: 600,
            letterSpacing: '0.01em'
          }}>{problem.suggestion.toUpperCase()}</p>
        </div>
      )}
    </div>
  );
}