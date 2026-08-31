import type { Side } from './tournament';

export const CRITERIA = [
  {
    key: 'problem_clear',
    group: '① 문제 정의 및 아이디어',
    label: '해결하려는 문제가 명확한가',
    max: 10,
  },
  {
    key: 'problem_value',
    group: '① 문제 정의 및 아이디어',
    label: '해결 가치가 있는 문제인가',
    max: 10,
  },
  {
    key: 'problem_originality',
    group: '① 문제 정의 및 아이디어',
    label: '아이디어가 참신한가',
    max: 5,
  },
  {
    key: 'ai_effective',
    group: '② AI 활용도',
    label: 'AI를 적절하고 효과적으로 활용했는가',
    max: 10,
  },
  {
    key: 'ai_core_value',
    group: '② AI 활용도',
    label: 'AI 활용이 서비스의 핵심 가치와 연결되는가',
    max: 10,
  },
  {
    key: 'mvp_core',
    group: '③ 서비스 완성도 (MVP)',
    label: '핵심 기능이 구현되어 있는가',
    max: 15,
  },
  {
    key: 'mvp_working',
    group: '③ 서비스 완성도 (MVP)',
    label: 'MVP 수준에서 서비스가 실제로 동작하는가',
    max: 15,
  },
  {
    key: 'presentation_clarity',
    group: '④ 발표 및 시연',
    label: '발표 내용이 명확하고 전달력이 좋은가',
    max: 7,
  },
  {
    key: 'presentation_demo',
    group: '④ 발표 및 시연',
    label: 'Demo가 원활하게 진행되는가',
    max: 8,
  },
  {
    key: 'feasibility_service',
    group: '⑤ 실현 가능성 및 확장성',
    label: '실제 서비스로 발전할 가능성이 있는가',
    max: 5,
  },
  {
    key: 'feasibility_growth',
    group: '⑤ 실현 가능성 및 확장성',
    label: '향후 확장 방향이 구체적이고 합리적인가',
    max: 5,
  },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]['key'];
export type ScoreSet = Record<CriterionKey, number>;
export type MatchScores = Record<Side, ScoreSet>;
export type FeedbackSet = {
  good: string;
  improve: string;
  other: string;
};
export type MatchFeedback = Record<Side, FeedbackSet>;

export const emptyScoreSet = (): ScoreSet =>
  Object.fromEntries(CRITERIA.map((criterion) => [criterion.key, 0])) as ScoreSet;

export const emptyMatchScores = (): MatchScores => ({
  A: emptyScoreSet(),
  B: emptyScoreSet(),
});

export const emptyFeedbackSet = (): FeedbackSet => ({ good: '', improve: '', other: '' });

export const emptyMatchFeedback = (): MatchFeedback => ({
  A: emptyFeedbackSet(),
  B: emptyFeedbackSet(),
});

export const totalScore = (scores: ScoreSet): number =>
  CRITERIA.reduce((sum, criterion) => sum + (Number(scores[criterion.key]) || 0), 0);

export const sideTotal = (scores: MatchScores, side: Side): number => totalScore(scores[side]);

export const winningSideFromScores = (scores: MatchScores): Side =>
  sideTotal(scores, 'A') >= sideTotal(scores, 'B') ? 'A' : 'B';
