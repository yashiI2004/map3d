import React from 'react';
import { css } from '@emotion/react';

export function JobStatus({ jobId, statusData }: { jobId: string | null; statusData: any | null }) {
  if (!jobId || !statusData) return null;
  const progress = statusData.progress || 0;
  const stage = statusData.stage || statusData.status || 'unknown';
  const logs = statusData.logs || [];

  return (
    <div
      css={css({
        position: 'fixed',
        right: 16,
        bottom: 96,
        width: 320,
        background: 'rgba(255,255,255,0.95)',
        borderRadius: 12,
        padding: '12px',
        boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
        zIndex: 10000,
      })}
    >
      <div css={css({ fontWeight: 700, marginBottom: 8 })}>Job: {jobId}</div>
      <div css={css({ height: 10, background: '#e6e6e6', borderRadius: 8, overflow: 'hidden', marginBottom: 8 })}>
        <div css={css({ height: '100%', width: `${Math.min(100, Math.max(0, progress))}%`, background: '#2563eb' })} />
      </div>
      <div css={css({ fontSize: '12px', color: '#374151', marginBottom: 8 })}>Stage: {stage}</div>
      <div css={css({ maxHeight: 160, overflowY: 'auto', fontSize: '12px', color: '#374151' })}>
        {logs.slice(-6).reverse().map((l: any, i: number) => (
          <div key={i} css={css({ marginBottom: 6, borderLeft: '2px solid #e6e6e6', paddingLeft: 8 })}>
            <div css={css({ color: '#6b7280', fontSize: 11 })}>{new Date(l.time).toLocaleTimeString()}</div>
            <div>{l.message}</div>
          </div>
        ))}
      </div>
      {statusData.result && (
        <div css={css({ marginTop: 8, display: 'flex', gap: '0.5rem' })}>
          <a href={statusData.result.glb} target="_blank" rel="noreferrer" css={css({ padding: '0.45rem 0.6rem', background: '#f3f4f6', borderRadius: 8, textDecoration: 'none', color: '#111827' })}>Download GLB</a>
        </div>
      )}
    </div>
  );
}
