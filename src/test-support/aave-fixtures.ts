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
