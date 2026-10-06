import { vi } from 'vitest'
import {
  Side,
  type LiquidityProvider,
  type Result,
  type UpstreamFailure,
} from '../liquid-layer'
import { fakeProvider } from './fake-provider'

export function fakeCollateralProvider(
  initialBalance = 0,
  overrides: Partial<LiquidityProvider> = {},
) {
  let balance = initialBalance

  const depositCollateral = vi.fn(async (amount: number): Promise<number> => {
    balance += amount
    return balance
  })

  const withdrawCollateral = vi.fn(async (amount: number): Promise<number> => {
    balance -= amount
    return balance
  })

  const settlePnl = vi.fn(async (amount: number): Promise<number> => {
    balance += amount
    return balance
  })

  const settleFunding = vi.fn(async (amount: number): Promise<number> => {
    balance += amount
    return balance
  })

  const getCollateralBalance = vi.fn(
    async (): Promise<Result<number, UpstreamFailure>> => ({
      success: true,
      value: balance,
    }),
  )

  const provider: LiquidityProvider = fakeProvider({
    depositCollateral,
    withdrawCollateral,
    getCollateralBalance,
    settlePnl,
    settleFunding,
    getRequiredMargin: async (_side: Side, size: number, entryPrice: number) => ({
      success: true as const,
      value: size * entryPrice * 0.1,
    }),
    getMaintenanceMargin: async (_side: Side, size: number, entryPrice: number) => ({
      success: true as const,
      value: size * entryPrice * 0.05,
    }),
    ...overrides,
  })

  return {
    provider,
    depositCollateral,
    withdrawCollateral,
    settlePnl,
    settleFunding,
    getCollateralBalance,
  }
}
