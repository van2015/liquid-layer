import { vi } from 'vitest'
import {
  Side,
  type LiquidityProvider,
  type Position,
  type Result,
  type TransactionRequest,
  type UpstreamFailure,
} from '../liquid-layer'

export const preparedTx: TransactionRequest = {
  to: '0x000000000000000000000000000000000000dead',
  data: '0x',
  value: '0',
}

export function fakeProvider(
  overrides: Partial<LiquidityProvider> = {},
): LiquidityProvider {
  return {
    openPosition: vi.fn(),
    closePosition: vi.fn(),
    depositCollateral: vi.fn(),
    withdrawCollateral: vi.fn(),
    settlePnl: vi.fn(async () => ({
      success: true as const,
      value: undefined,
    })),
    settleFunding: vi.fn(async () => ({
      success: true as const,
      value: undefined,
    })),
    getCollateralBalance: vi.fn(async () => ({
      success: true as const,
      value: 10000,
    })),
    getRequiredMargin: vi.fn(async () => ({
      success: true as const,
      value: 0,
    })),
    getMaintenanceMargin: vi.fn(async () => ({
      success: true as const,
      value: 0,
    })),
    getFundingRate: vi.fn(async () => ({ success: true as const, value: 0 })),
    getPosition: vi.fn(async (id: string) => ({
      success: true as const,
      value: { id, side: Side.Long, size: 1, entryPrice: 0 },
    })),
    listPositions: vi.fn(
      (): Promise<Result<Position[], UpstreamFailure>> =>
        Promise.resolve({ success: true, value: [] }),
    ),
    ...overrides,
  }
}
