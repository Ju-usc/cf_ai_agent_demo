import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    deps: {
      optimizer: {
        ssr: {
          include: ['ajv'],
        },
      },
    },
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
          migrations: [
            {
              tag: 'v1',
              new_sqlite_classes: ['InteractionAgent', 'ResearchAgent'],
            },
          ],
        },
      },
    },
  },
});

