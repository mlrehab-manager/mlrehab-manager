const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
    launchOptions: process.env.CI
      ? {}
      : { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] },
  },
  webServer: { command: "python3 -m http.server 4173", port: 4173 },
});
