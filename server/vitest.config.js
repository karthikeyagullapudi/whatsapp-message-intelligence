import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://placeholder/overridden-by-memory-server',
    },
    // mongodb-memory-server downloads a mongod binary the first time.
    hookTimeout: 120000,
    testTimeout: 20000,
  },
});
