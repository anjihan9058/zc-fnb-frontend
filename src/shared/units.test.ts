import { describe, expect, it } from 'vitest';
import { unitFactor, recipeUnits } from './units';
describe('명확한 단위 환산만 허용', () => {
  it('무게와 부피를 각각 환산한다', () => {
    expect(unitFactor('g', 'kg')).toBe(0.001);
    expect(unitFactor('kg', 'g')).toBe(1000);
    expect(unitFactor('mL', 'L')).toBe(0.001);
    expect(unitFactor('L', 'ml')).toBe(1000);
  });
  it('부피와 무게 사이 또는 포장 규격을 추측하지 않는다', () => {
    expect(unitFactor('L', 'kg')).toBeNull();
    expect(unitFactor('봉지', 'kg')).toBeNull();
    expect(unitFactor('박스', '개')).toBeNull();
    expect(unitFactor('', '')).toBeNull();
    expect(unitFactor('봉지', '봉지')).toBe(1);
    expect(recipeUnits('봉지')).toEqual(['봉지']);
  });
});
