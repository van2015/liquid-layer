import { vi } from 'vitest'
import { Side, type LiquidityProvider } from '../liquid-layer'

export function fakeProvider(
  overrides: Partial<LiquidityProvider> = {},
): LiquidityProvider {
  return {
    openPosition: vi.fn(),
    closePosition: vi.fn(),
    depositCollateral: vi.fn(),
    withdrawCollateral: vi.fn(),
    settlePnl: vi.fn(),
    settleFunding: vi.fn(),
    getCollateralBalance: vi.fn(() => 10000),
    getRequiredMargin: vi.fn(() => 0),
    getFundingRate: vi.fn(() => 0),
    getPosition: vi.fn((id: string) => ({
      ok: true as const,
      value: { id, side: Side.Long, size: 1, entryPrice: 0 },
    })),
    ...overrides,
  }
}
