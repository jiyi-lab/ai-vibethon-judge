// UniversitySelect 가 쓰는 최소 타입.
// 원본 프로젝트의 DB 스키마(open_code_hash 등)는 가져오지 않았으므로
// 새 데이터 소스에 맞춰 자유롭게 확장하면 된다.
export type University = {
  id: string;
  name: string;
  assigned_character_id: string | null;
};
