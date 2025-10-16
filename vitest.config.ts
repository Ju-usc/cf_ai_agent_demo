import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        singleWorker: true,
        isolatedStorage: true,
        main: './backend/index.ts',
        miniflare: {
          compatibilityDate: '2024-10-14',
          compatibilityFlags: ['nodejs_compat'],
          durableObjects: {
            INTERACTION_AGENT: 'InteractionAgent',
            RESEARCH_AGENT: 'ResearchAgent',
          },
        },
      },
    },
  },
});

