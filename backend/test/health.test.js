const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");

let server;

test.before(() => {
  server = app.listen(0);
});

test.after(() => {
  if (server) {
    server.close();
  }
});

test("GET /api/health returns service payload", async () => {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.service, "appointly-api");
});
