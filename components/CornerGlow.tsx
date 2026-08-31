export default function CornerGlow() {
  return (
    <>
      {/* 우상단 — 메인페이지와 동일한 큰 글로우 */}
      <div style={{
        position: 'absolute',
        top: '-32%', right: '-28%',
        width: 900, height: 700,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(236,108,1,0.18) 0%, rgba(236,108,1,0.05) 40%, transparent 70%)',
        filter: 'blur(30px)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      {/* 좌하단 — 부드러운 보조 글로우 */}
      <div style={{
        position: 'absolute',
        bottom: '0%', left: '-10%',
        width: 560, height: 560,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,150,40,0.18) 0%, transparent 65%)',
        filter: 'blur(40px)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
    </>
  );
}
