import { vi } from 'vitest'
import type { LiquidityProvider } from '../liquid-layer'
import { fakeProvider } from './fake-provider'

export function fakeCollateralProvider(initialBalance = 0) {
  let balance = initialBalance

  const depositCollateral = vi.fn((params: { amount: number }): number => {
    balance += params.amount
    return balance
  })

  const withdrawCollateral = vi.fn((params: { amount: number }): number => {
    balance -= params.amount
    return balance
  })

  const getCollateralBalance = vi.fn((): number => balance)

  const provider: LiquidityProvider = fakeProvider({
    depositCollateral,
    withdrawCollateral,
    getCollateralBalance,
    getRequiredMargin: (params: { size: number; entryPrice: number }) =>
      params.size * params.entryPrice * 0.1,
  })

  return { provider, depositCollateral, withdrawCollateral, getCollateralBalance }
}
