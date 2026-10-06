import { vi } from 'vitest'
import type { LiquidityProvider } from '../liquid-layer'

export function fakeProvider(
  overrides: Partial<LiquidityProvider> = {},
): LiquidityProvider {
  return {
    openPosition: vi.fn(),
    closePosition: vi.fn(),
    depositCollateral: vi.fn(),
    withdrawCollateral: vi.fn(),
    settlePnl: vi.fn(),
    getCollateralBalance: vi.fn(() => 10000),
    getRequiredMargin: vi.fn(() => 0),
    ...overrides,
  }
}
