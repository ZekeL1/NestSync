const { startServer } = require("./src/createServer");

startServer()
  .then(({ port }) => {
    console.log(`NestSync Server running on http://localhost:${port}`);
  })
  .catch((error) => {
    console.error("Failed to start NestSync server:", error);
    process.exit(1);
  });
