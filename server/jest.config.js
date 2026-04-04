module.exports = {
  collectCoverageFrom: ["src/**/*.js", "!src/legacy/**"],
  coverageDirectory: "coverage",
  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/unit/**/*.test.js"]
    },
    {
      displayName: "integration",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/integration/**/*.test.js"],
      testTimeout: 15000
    },
    {
      displayName: "system",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/system/**/*.test.js"],
      testTimeout: 20000
    }
  ]
};
