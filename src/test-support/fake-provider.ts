import { vi } from 'vitest'
import {
  Side,
  type LiquidityProvider,
  type Position,
  type Result,
  type UpstreamFailure,
} from '../liquid-layer'

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
    getCollateralBalance: vi.fn(() => ({ success: true as const, value: 10000 })),
    getRequiredMargin: vi.fn(() => ({ success: true as const, value: 0 })),
    getMaintenanceMargin: vi.fn(() => ({ success: true as const, value: 0 })),
    getFundingRate: vi.fn(() => ({ success: true as const, value: 0 })),
    getPosition: vi.fn((id: string) => ({
      success: true as const,
      value: { id, side: Side.Long, size: 1, entryPrice: 0 },
    })),
    listPositions: vi.fn(
      (): Result<Position[], UpstreamFailure> => ({
        success: true,
        value: [],
      }),
    ),
    ...overrides,
  }
}
