export const postGraphQLFailureResult = {
  success: false,
  error: { type: 'UpstreamFailure', operation: 'postGraphQL' },
} as const

export const reserveWethFixture = {
  data: {
    reserve: {
      supplyInfo: {
        maxLTV: { value: '0.805' },
        liquidationThreshold: { value: '0.83' },
        apy: { value: '0.013475641458201418297577074' },
      },
      borrowInfo: {
        apy: { value: '0.019838845936971794448782321' },
      },
    },
  },
} as const

export const reserveBorrowDisabledFixture = {
  data: {
    reserve: {
      ...reserveWethFixture.data.reserve,
      borrowInfo: null,
    },
  },
} as const

export const reserveNotFoundFixture = {
  data: {
    reserve: null,
  },
} as const

export const userPositionsWithSupplyFixture = {
  data: {
    borrows: [],
    supplies: [
      {
        currency: {
          address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          symbol: 'WETH',
          decimals: 18,
        },
        balance: {
          amount: { value: '0.000074432272270623' },
          usd: '0.20225261152966136412744675',
          usdPerToken: '2717.27041725',
        },
        isCollateral: true,
      },
    ],
  },
} as const

export const supplyTxFixture = {
  data: {
    supply: {
      to: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      data: '0x617ba0370000000000000000000000000000000000000000000000000000000000000001',
      value: '0',
    },
  },
} as const

export const supplyMissingTxFixture = {
  data: {
    supply: null,
  },
} as const

export const withdrawTxFixture = {
  data: {
    withdraw: {
      to: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      data: '0x853828b60000000000000000000000000000000000000000000000000000000000000002',
      value: '0',
    },
  },
} as const

export const userNoPositionFixture = {
  data: {
    borrows: [],
    supplies: [],
  },
} as const

export const withdrawMissingTxFixture = {
  data: {
    withdraw: null,
  },
} as const

export const userWethCollateralFixture = {
  data: {
    borrows: [],
    supplies: [
      {
        currency: {
          address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          symbol: 'WETH',
          decimals: 18,
        },
        balance: {
          amount: { value: '100' },
          usd: '270000',
          usdPerToken: '2700',
        },
        isCollateral: true,
      },
    ],
  },
} as const

export const userPositionsWithWethDebtFixture = {
  data: {
    borrows: [
      {
        currency: {
          address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          symbol: 'WETH',
          decimals: 18,
        },
        debt: {
          amount: { value: '0.025294505537082373' },
          usd: '68.73201161488025502933013425',
        },
      },
    ],
    supplies: [
      {
        currency: {
          address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
          symbol: 'AAVE',
          decimals: 18,
        },
        balance: {
          amount: { value: '0.800774491535946253' },
          usd: '146.07088592712432378816662263',
          usdPerToken: '182.41201171',
        },
        isCollateral: true,
      },
    ],
  },
} as const

export const userPositionsWithWethSupplyFixture = {
  data: {
    borrows: [
      {
        currency: {
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          symbol: 'USDC',
          decimals: 6,
        },
        debt: {
          amount: { value: '41501.683598' },
          usd: '41496.329880815858',
        },
      },
    ],
    supplies: [
      {
        currency: {
          address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          symbol: 'WETH',
          decimals: 18,
        },
        balance: {
          amount: { value: '26.512887202828885925' },
          usd: '71736.896200471362075289203173',
          usdPerToken: '2705.73686116',
        },
        isCollateral: true,
      },
    ],
  },
} as const
