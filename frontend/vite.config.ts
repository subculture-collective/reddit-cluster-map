import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/subreddits": "http://localhost:8000",
      "/users": "http://localhost:8000",
      "/posts": "http://localhost:8000",
      "/comments": "http://localhost:8000",
      "/jobs": "http://localhost:8000",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/.{idea,git,cache,output,temp}/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**',
        'src/vite-env.d.ts',
        'src/main.tsx',
        'src/**/__typechecks__/**',
        // Type definition files
        'src/types/**/*.ts',
        // Exclude admin/dashboard components from coverage requirements
        'src/components/Admin.tsx',
        'src/components/Dashboard.tsx',
        'src/components/Communities.tsx',
        // Exclude complex utility that should be tested separately
        'src/utils/communityDetection.ts',
        'src/utils/apiErrors.ts',
        // Exclude Graph components that require extensive mocking of WebGL/Three.js
        'src/components/Graph3D.tsx',
        'src/components/Graph2D.tsx',
        'src/components/CommunityMap.tsx',
        // Mock data files
        'src/__mocks__/**/*.ts',
      ],
      thresholds: {
        lines: 75,
        functions: 60,
        branches: 70,
        statements: 75,
      },
    },
  },
});
