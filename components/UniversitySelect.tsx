'use client';

import Image from 'next/image';
import { University } from '@/lib/types';
import universityLogos from '@/lib/universityLogos';

type Props = {
  universities: University[];
  onSelect: (university: University) => void;
  isMobile?: boolean;
};

export default function UniversitySelect({ universities, onSelect, isMobile = false }: Props) {
  return (
    <>
      <style>{`
        .univ-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        @media (min-width: 744px) {
          .univ-grid { grid-template-columns: repeat(6, 1fr); gap: 16px; }
        }
        @media (min-width: 1280px) {
          .univ-grid { grid-template-columns: repeat(8, 1fr); gap: 16px; }
        }

        .univ-card-pc { display: flex; flex-direction: column; align-items: center; gap: 14px; background: none; border: none; cursor: pointer; padding: 0; width: 100%; }
        .univ-card-mobile { display: none; background: none; border: none; cursor: pointer; padding: 0; width: 100%; }

        .univ-box:hover { border-color: #ec6c01 !important; }
        .univ-box-mobile:hover { border-color: #ec6c01 !important; }

        @media (max-width: 743px) {
          .univ-grid { display: flex; flex-direction: column; gap: 10px; }
          .univ-card-pc { display: none; }
          .univ-card-mobile { display: block; }
        }
      `}</style>

      <div className="univ-grid">
        {universities.map((uni) => {
          const isAssigned = !!uni.assigned_character_id;
          const logoUrl = universityLogos[uni.name];
          const initial = uni.name.replace(/[()\/\s]/g, '').charAt(0);
          const displayName = uni.name;

          return (
            <div key={uni.id}>

              {/* ── PC 카드 ── */}
              {!isMobile && (
              <button className="univ-card-pc" onClick={() => onSelect(uni)}>
                <div
                  className="univ-box"
                  style={{
                    width: '100%', aspectRatio: '1 / 1', borderRadius: 14,
                    border: isAssigned ? '2px solid #8f3e1b' : '2px solid #343232',
                    background: isAssigned ? '#261711' : 'rgba(35,35,33,0.5)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 8, position: 'relative', overflow: 'hidden', transition: 'border-color 0.15s',
                  }}
                >
                  <div style={{ width: '45%', aspectRatio: '1/1', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                    {logoUrl ? (
                      <Image src={logoUrl} alt={uni.name} fill style={{ objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: 16, fontWeight: 800, color: isAssigned ? '#ec6c01' : '#949494' }}>{initial}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%', padding: '0 6px' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isAssigned ? '#ec6c01' : '#949494', textAlign: 'center', lineHeight: 1.2, wordBreak: 'keep-all', letterSpacing: '0.03em' }}>
                      {displayName}
                    </span>
                    <div style={{ background: isAssigned ? '#ec6c01' : '#3e3e3d', color: isAssigned ? '#fff' : '#949494', fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                      {isAssigned ? '완료' : '미배정'}
                    </div>
                  </div>
                </div>
              </button>
              )}

              {/* ── 모바일 리스트 ── */}
              {isMobile && (
              <button className="univ-card-mobile" onClick={() => onSelect(uni)}>
                <div
                  className="univ-box-mobile"
                  style={{
                    width: '100%', borderRadius: 14,
                    border: isAssigned ? '2px solid #8f3e1b' : '2px solid #343232',
                    background: isAssigned ? '#261711' : 'rgba(35,35,33,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px 12px 16px',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                      {logoUrl ? (
                        <Image src={logoUrl} alt={uni.name} fill style={{ objectFit: 'contain' }} />
                      ) : (
                        <span style={{ fontSize: 18, fontWeight: 800, color: isAssigned ? '#ec6c01' : '#949494' }}>{initial}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 700, color: isAssigned ? '#ec6c01' : '#949494', letterSpacing: '0.03em', lineHeight: 1 }}>
                      {displayName}
                    </span>
                  </div>
                  <div style={{ background: isAssigned ? '#ec6c01' : '#3e3e3d', color: isAssigned ? '#fff' : '#949494', fontSize: 12, fontWeight: 500, padding: '4px 8px', borderRadius: 999, letterSpacing: '0.03em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {isAssigned ? '완료' : '미배정'}
                  </div>
                </div>
              </button>
              )}

            </div>
          );
        })}
      </div>
    </>
  );
}
