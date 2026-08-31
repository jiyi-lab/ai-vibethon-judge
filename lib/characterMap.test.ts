// 캐릭터 매핑 일관성 테스트 — 데이터가 서로 어긋나면 여기서 잡힌다.
//
// 세 데이터가 손으로 만들어졌다: 이미지 판독(CHARACTER_NAMES), 담당자 제공
// 학교 배정(SCHOOL_CHARACTERS), 그리고 기존 universityLogos. 셋의 정합을 기계로 고정한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHARACTER_NAMES,
  SCHOOL_CHARACTERS,
  characterKeyForSchool,
  characterKeyByName,
  characterName,
} from './characterMap.ts';
import universityLogos from './universityLogos.ts';

test('캐릭터는 char_01~80 정확히 80종, 이름 중복 없음', () => {
  const keys = Object.keys(CHARACTER_NAMES);
  assert.equal(keys.length, 80);
  for (let i = 1; i <= 80; i += 1) {
    assert.ok(keys.includes(`char_${String(i).padStart(2, '0')}`), `char_${i} 누락`);
  }
  assert.equal(new Set(Object.values(CHARACTER_NAMES)).size, 80);
});

test('학교 배정은 80개, 모든 배정 이름이 실제 캐릭터로 해석된다', () => {
  const schools = Object.keys(SCHOOL_CHARACTERS);
  assert.equal(schools.length, 80);

  for (const school of schools) {
    const key = characterKeyForSchool(school);
    assert.ok(key !== null, `${school} → "${SCHOOL_CHARACTERS[school]}" 에 해당하는 캐릭터 없음`);
  }
});

test('학교 ↔ 캐릭터는 1:1 — 두 학교가 같은 캐릭터를 쓰지 않는다', () => {
  const keys = Object.keys(SCHOOL_CHARACTERS).map((s) => characterKeyForSchool(s));
  assert.equal(new Set(keys).size, 80);
});

test('배정 학교명은 전부 universityLogos 표기와 일치한다 (로고 매칭이 함께 동작해야 함)', () => {
  for (const school of Object.keys(SCHOOL_CHARACTERS)) {
    assert.ok(school in universityLogos, `${school} 이 universityLogos 에 없음 — 표기 불일치`);
  }
});

test('조회 헬퍼 동작', () => {
  assert.equal(characterKeyForSchool('서울대학교'), 'char_72'); // 광석
  assert.equal(characterKeyForSchool('  서울대학교 '), 'char_72'); // 공백 무시
  assert.equal(characterKeyForSchool('없는대학교'), null);
  assert.equal(characterKeyByName('그리핀'), 'char_62');
  assert.equal(characterName('char_21'), '팬더');
  assert.equal(characterName(null), null);
});
