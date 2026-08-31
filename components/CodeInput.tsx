'use client';

import { useRef, useState, KeyboardEvent, ChangeEvent, ClipboardEvent } from 'react';

type Props = {
  universityName: string;
  onSubmit: (code: string) => void;
  isLoading: boolean;
  error?: string;
  onBack?: () => void;
};

const BOX_COUNT = 5;

export default function CodeInput({ universityName, onSubmit, isLoading, error, onBack }: Props) {
  const [chars, setChars] = useState<string[]>(Array(BOX_COUNT).fill(''));
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (i: number, e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().slice(-1);
    const next = [...chars];
    next[i] = val;
    setChars(next);
    if (val && i < BOX_COUNT - 1) inputRefs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !chars[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  // 코드 전체를 붙여넣으면 각 칸에 자동 분배
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      .slice(0, BOX_COUNT);
    if (!pasted) return;
    const next = Array(BOX_COUNT).fill('');
    pasted.split('').forEach((c, idx) => { next[idx] = c; });
    setChars(next);
    const focusTarget = Math.min(pasted.length, BOX_COUNT - 1);
    inputRefs.current[focusTarget]?.focus();
  };

  const handleSubmit = () => {
    const code = chars.join('');
    if (code.length === BOX_COUNT) onSubmit(code);
  };

  const isFilled = chars.every((c) => c !== '');

  return (
    <div className="ci-root">
      <style>{`
        .ci-root {
          min-height: 100dvh;
          background: #0e0e0e;
          display: flex;
          flex-direction: column;
          padding: 20px 16px 18px;
          max-width: 480px;
          margin: 0 auto;
          width: 100%;
          position: relative;
          overflow: hidden;
        }
        .ci-header {
          position: sticky;
          top: 0;
          background: #0e0e0e;
          z-index: 10;
          padding: 0 0 16px;
          flex: 0 0 auto;
        }
        .ci-back {
          display: block;
          margin: 0 0 0 0;
          color: rgba(255,255,255,0.3);
          font-size: 14px;
          font-weight: 500;
          background: none;
          border: none;
          cursor: pointer;
          letter-spacing: 0.03em;
          transition: color 0.15s;
        }
        .ci-back:hover { color: rgba(255,255,255,0.7); }

        .ci-card { display: contents; }
        .ci-text { flex: 0 0 auto; z-index: 1; }
        .ci-center {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 1;
        }
        .ci-cta { flex: 0 0 auto; z-index: 1; }

        .ci-title {
          font-size: 28px;
          font-weight: 800;
          color: #fff;
          text-align: center;
          letter-spacing: 0.02em;
          line-height: 1.3;
          margin: 36px 0 14px;
          text-shadow: 0px 2px 8px rgba(214,81,0,0.3);
        }
        .ci-pill-row { display: flex; justify-content: center; margin-bottom: 14px; }
        .ci-pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 8px 16px;
          border-radius: 99px;
          border: 1px solid rgba(236,108,1,0.35);
          background: linear-gradient(180deg, rgba(236,108,1,0) 30%, rgba(236,108,1,0.12) 100%);
        }
        .ci-boxes {
          display: flex;
          gap: 8px;
          justify-content: center;
        }
        .ci-box {
          width: 58px;
          height: 66px;
          border-radius: 10px;
          text-align: center;
          font-size: 26px;
          font-weight: 600;
          background: linear-gradient(180deg, rgba(78,69,64,0.5) 0%, rgba(0,0,0,0.5) 100%);
          outline: none;
          letter-spacing: 0.03em;
          caret-color: #ec6c01;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ci-text-pc { display: none; }
        .ci-error { color: #f87171; font-size: 13px; text-align: center; margin: 14px 0 0; }
        .ci-submit {
          width: 100%;
          padding: 17px 10px;
          border-radius: 14px;
          background: #ec6c01;
          color: #fff;
          font-size: 16px;
          font-weight: 800;
          border: none;
          letter-spacing: 0.03em;
          text-shadow: 0px 2px 4px rgba(214,81,0,0.25);
          transition: opacity 0.2s, box-shadow 0.2s, transform 0.08s;
        }
        .ci-submit:not(:disabled):active { transform: scale(0.985); }

        @keyframes code-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-7px); }
          40%, 80% { transform: translateX(7px); }
        }
        @keyframes ci-glow-anim {
          0%, 100% { box-shadow: 0 0 12px 1px rgba(236,108,1,0.10); }
          50%      { box-shadow: 0 0 20px 3px rgba(236,108,1,0.16); }
        }

        /* ===== PC: 가운데 카드 패널 ===== */
        @media (min-width: 769px) {
          .ci-root { justify-content: center; padding: 28px 40px 40px; max-width: 1232px; position: relative; }
          .ci-header { position: static; background: none; padding: 0; }
          .ci-back { position: absolute; top: 28px; left: 40px; z-index: 2; }
          .ci-header .ci-text { display: none; }
          .ci-text-pc { display: block; }
          .ci-card {
            display: flex;
            flex-direction: column;
            width: 100%;
            max-width: 560px;
            margin: 24px auto 0;
            padding: 48px 40px;
            border-radius: 24px;
            border: 1px solid rgba(255,255,255,0.08);
            background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%);
            box-shadow: 0 24px 60px rgba(0,0,0,0.4);
          }
          .ci-center { flex: 0 0 auto; margin: 36px 0; }
          .ci-title { font-size: 30px; margin: 0 0 16px; }
          .ci-box { width: 66px; height: 76px; font-size: 30px; }
          .ci-submit { font-size: 18px; padding: 19px 10px; }
        }
      `}</style>


      <div className="ci-header">
        {onBack && (
          <button onClick={onBack} className="ci-back">
            ‹ 돌아가기
          </button>
        )}
        <div className="ci-text">
          <h1 className="ci-title">티켓 코드를 입력해주세요</h1>
          <div className="ci-pill-row">
            <div className="ci-pill">
              <span style={{ fontSize: 14, color: '#fff', letterSpacing: '0.02em', fontWeight: 700 }}>
                {universityName}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="ci-card">
        {/* PC 전용 타이틀 */}
        <div className="ci-text ci-text-pc">
          <h1 className="ci-title">티켓 코드를 입력해주세요</h1>
          <div className="ci-pill-row">
            <div className="ci-pill">
              <span style={{ fontSize: 14, color: '#fff', letterSpacing: '0.02em', fontWeight: 700 }}>
                {universityName}
              </span>
            </div>
          </div>
        </div>

        {/* 입력칸 — Clarity 세션 녹화에서 코드 값이 노출되지 않도록 마스킹 */}
        <div className="ci-center" data-clarity-mask="true">
          <div className="ci-boxes" data-clarity-mask="true" style={{ animation: error ? 'code-shake 0.4s ease' : undefined }}>
            {chars.map((ch, i) => {
              const filled = ch !== '';
              const active = focusIdx === i;
              return (
                <input
                  key={i}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  data-clarity-mask="true"
                  value={ch}
                  onChange={(e) => handleChange(i, e)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={handlePaste}
                  onFocus={() => setFocusIdx(i)}
                  onPointerDown={(e) => {
                    const firstEmpty = chars.findIndex((c) => c === '');
                    const target = firstEmpty === -1 ? BOX_COUNT - 1 : firstEmpty;
                    if (target !== i) {
                      e.preventDefault();
                      inputRefs.current[target]?.focus();
                    }
                  }}
                  onBlur={() => setFocusIdx(null)}
                  disabled={isLoading}
                  className="ci-box"
                  style={{
                    color: filled ? '#fff' : 'rgba(255,255,255,0.35)',
                    border: `1.5px solid ${
                      active || filled ? 'rgba(236,108,1,0.9)' : 'rgba(255,255,255,0.28)'
                    }`,
                    boxShadow: active ? '0 0 0 3px rgba(236,108,1,0.18)' : 'none',
                  }}
                  autoComplete="off"
                  autoCapitalize="characters"
                />
              );
            })}
          </div>

          {error && <p className="ci-error">{error}</p>}
        </div>

        {/* 제출 버튼 */}
        <div className="ci-cta">
          <button
            onClick={handleSubmit}
            disabled={isLoading || !isFilled}
            className="ci-submit"
            style={{
              cursor: isLoading || !isFilled ? 'not-allowed' : 'pointer',
              opacity: isLoading || !isFilled ? 0.45 : 1,
              boxShadow: isLoading || !isFilled ? 'none' : '0 6px 18px rgba(236,108,1,0.18)',
              animation: isFilled && !isLoading ? 'ci-glow-anim 2.4s ease-in-out infinite' : undefined,
            }}
          >
            티켓 사용하기 &nbsp;›
          </button>
        </div>
      </div>
    </div>
  );
}
