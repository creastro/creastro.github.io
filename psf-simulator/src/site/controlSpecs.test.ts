import { describe, expect, it } from 'vitest'
import { ZERNIKE_NAMES } from '../lib/zernike'
import {
  LOG_STEPS,
  MAX_VANES,
  OTHER_CONTROL_IDS,
  RANGE_SPECS,
  READ_ROWS,
  VANE_IDS,
  ZERNIKE_IDS,
  fromPosition,
  toPosition,
} from './controlSpecs'

describe('RANGE_SPECS', () => {
  it('id không trùng nhau và không trùng điều khiển khác', () => {
    const ids = [...RANGE_SPECS.map((s) => s.id), ...OTHER_CONTROL_IDS]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('giá trị mặc định nằm trong khoảng và khớp bước (thang tuyến tính)', () => {
    for (const s of RANGE_SPECS) {
      expect(s.value, s.id).toBeGreaterThanOrEqual(s.min)
      expect(s.value, s.id).toBeLessThanOrEqual(s.max)
      expect(s.min, s.id).toBeLessThan(s.max)
      if (!s.log) {
        const steps = (s.value - s.min) / s.step
        expect(Math.abs(steps - Math.round(steps)), s.id).toBeLessThan(1e-6)
      }
    }
  })

  it('mỗi mode Zernike có một thanh trượt', () => {
    for (const name of ZERNIKE_NAMES) expect(RANGE_SPECS.some((s) => s.id === ZERNIKE_IDS[name])).toBe(true)
  })

  it('định dạng hiển thị tốt với giá trị mặc định, tối thiểu và tối đa', () => {
    for (const s of RANGE_SPECS) {
      for (const v of [s.value, s.min, s.max]) {
        const text = s.format(v)
        expect(text.length, s.id).toBeGreaterThan(0)
        expect(text, s.id).not.toContain('NaN')
      }
    }
  })
})

describe('thang logarit', () => {
  const D = RANGE_SPECS.find((s) => s.id === 'D')!

  it('vị trí và giá trị là hàm ngược của nhau, hai đầu khớp khoảng', () => {
    expect(toPosition(D, D.min)).toBeCloseTo(0, 9)
    expect(toPosition(D, D.max)).toBeCloseTo(LOG_STEPS, 9)
    expect(fromPosition(D, 0)).toBeCloseTo(D.min, 12)
    expect(fromPosition(D, LOG_STEPS)).toBeCloseTo(D.max, 9)
    for (const v of [0.1, 0.35, 1, 4.2, 10]) expect(fromPosition(D, toPosition(D, v))).toBeCloseTo(v, 9)
  })

  it('đều theo tỉ lệ: giữa thanh trượt là trung bình nhân', () => {
    expect(fromPosition(D, LOG_STEPS / 2)).toBeCloseTo(Math.sqrt(D.min * D.max), 9)
  })

  it('thang tuyến tính giữ nguyên giá trị', () => {
    const lam = RANGE_SPECS.find((s) => s.id === 'lam')!
    expect(toPosition(lam, 550)).toBe(550)
    expect(fromPosition(lam, 550)).toBe(550)
  })
})

describe('READ_ROWS', () => {
  it('khoá không trùng và có nhãn, chủ đề', () => {
    expect(new Set(READ_ROWS.map((r) => r[0])).size).toBe(READ_ROWS.length)
    for (const [key, label, topic] of READ_ROWS) {
      expect(label.length, key).toBeGreaterThan(2)
      expect(topic.length, key).toBeGreaterThan(1)
    }
  })
})

describe('giá trị mặc định trên thanh trượt logarit', () => {
  it('quy đổi qua vị trí nguyên của thanh trượt vẫn hiển thị đúng giá trị mặc định', () => {
    for (const s of RANGE_SPECS.filter((r) => r.log)) {
      const roundTrip = fromPosition(s, Math.round(toPosition(s, s.value)))
      expect(s.format(roundTrip), s.id).toBe(s.format(s.value))
    }
  })
})

describe('góc riêng của từng thanh chống', () => {
  it('có đúng MAX_VANES thanh trượt va1…va8 trong nhóm vaneEach, mặc định chia đều theo 45°', () => {
    expect(VANE_IDS).toEqual(['va1', 'va2', 'va3', 'va4', 'va5', 'va6', 'va7', 'va8'])
    expect(MAX_VANES).toBe(8)
    const specs = VANE_IDS.map((id) => RANGE_SPECS.find((s) => s.id === id))
    for (const [i, s] of specs.entries()) {
      expect(s?.group).toBe('vaneEach')
      expect(s?.value).toBe(i * 45)
      expect(s?.max).toBe(360)
    }
  })

  it('số thanh tối đa của thanh trượt "Spider vanes N" bằng số thanh trượt góc', () => {
    expect(RANGE_SPECS.find((s) => s.id === 'nvane')?.max).toBe(MAX_VANES)
  })
})
