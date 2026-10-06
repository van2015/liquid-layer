import { vi } from 'vitest'
import {
  Side,
  type LiquidityProvider,
  type Result,
  type TransactionRequest,
  type UpstreamFailure,
} from '../liquid-layer'
import { fakeProvider } from './fake-provider'

export const preparedTx: TransactionRequest = {
  to: '0x000000000000000000000000000000000000dead',
  data: '0x',
  value: '0',
}

export function fakeCollateralProvider(
  initialBalance = 0,
  overrides: Partial<LiquidityProvider> = {},
) {
  let balance = initialBalance

  const depositCollateral = vi.fn(
    async (amount: number): Promise<Result<TransactionRequest, never>> => {
      balance += amount
      return { success: true, value: preparedTx }
    },
  )

  const withdrawCollateral = vi.fn(
    async (amount: number): Promise<Result<TransactionRequest, never>> => {
      balance -= amount
      return { success: true, value: preparedTx }
    },
  )

  const settlePnl = vi.fn(
    async (amount: number): Promise<Result<void, UpstreamFailure>> => {
      balance += amount
      return { success: true, value: undefined }
    },
  )

  const settleFunding = vi.fn(
    async (amount: number): Promise<Result<void, UpstreamFailure>> => {
      balance += amount
      return { success: true, value: undefined }
    },
  )

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
