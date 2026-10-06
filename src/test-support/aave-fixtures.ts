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
      supplyInfo: {
        maxLTV: { value: '0.805' },
        liquidationThreshold: { value: '0.83' },
        apy: { value: '0.013475641458201418297577074' },
      },
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

export const userNoPositionFixture = {
  data: {
    borrows: [],
    supplies: [],
  },
} as const
