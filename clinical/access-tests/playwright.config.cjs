const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: ".",
  use: {
    baseURL: "http://127.0.0.1:4180",
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
    launchOptions: process.env.CI
      ? {}
      : { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] },
  },
  webServer: {
    command: "python3 -m http.server 4180 --directory clinical/access-dist",
    cwd: "../..",
    port: 4180,
  },
});
