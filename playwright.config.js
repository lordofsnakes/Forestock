import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "test/browser",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3271",
    channel: "chrome",
    viewport: { width: 390, height: 844 },
    isMobile: true,
  },
  webServer: {
    command: "node dev.js",
    env: { PORT: "3271" },
    url: "http://127.0.0.1:3271",
    reuseExistingServer: false,
  },
});
