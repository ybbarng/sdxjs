/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      '**/*.test.js',
      '**/test/test-*.js' // Chapter 5
    ],
    globals: true,
  },
})
