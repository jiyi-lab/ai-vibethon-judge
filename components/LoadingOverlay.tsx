'use client';

type Props = { message?: string };

export default function LoadingOverlay({ message = '처리 중...' }: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(4px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      zIndex: 50,
    }}>
      <div style={{
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, padding: '28px 40px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 16,
        boxShadow: '0 0 60px rgba(236,108,1,0.15)',
      }}>
        <div style={{
          width: 44, height: 44,
          border: '4px solid rgba(236,108,1,0.2)',
          borderTop: '4px solid #ec6c01',
          borderRadius: '50%',
        }} className="animate-spin" />
        <p style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500, margin: 0 }}>{message}</p>
      </div>
    </div>
  );
}
