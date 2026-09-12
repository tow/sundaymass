const test = require("node:test");
const assert = require("node:assert/strict");

const Failures = require("../src/domain/failures.js");

test("an expected failure carries its message and cause and is recognisable", () => {
  const cause = new TypeError("Failed to fetch");
  const failure = Failures.expected("Editing requires an internet connection", cause);

  assert.equal(failure.message, "Editing requires an internet connection");
  assert.equal(failure.cause, cause);
  assert.equal(Failures.isExpected(failure), true);
});

test("an unmarked failure is a fault, and so is a non-object", () => {
  assert.equal(Failures.isExpected(new Error("Reading catalogue response was invalid")), false);
  assert.equal(Failures.isExpected(null), false);
  assert.equal(Failures.isExpected("Editor access required"), false);
  assert.equal(Failures.isExpected({ expected: "yes" }), false);
});

test("marking someone else's error keeps the original object", () => {
  const original = new Error("Invalid login credentials");
  assert.equal(Failures.markExpected(original), original);
  assert.equal(Failures.isExpected(original), true);
});

test("a rejected password is recognised, and a server fault is not", () => {
  const byCode = Object.assign(new Error("Invalid login credentials"), {
    name: "AuthApiError",
    code: "invalid_credentials",
  });
  const byStatus = Object.assign(new Error("Invalid login credentials"), {
    name: "AuthApiError",
    status: 400,
  });
  const serverFault = Object.assign(new Error("Service unavailable"), {
    name: "AuthApiError",
    status: 503,
  });
  const network = new TypeError("Failed to fetch");

  assert.equal(Failures.isRejectedCredentials(byCode), true);
  assert.equal(Failures.isRejectedCredentials(byStatus), true);
  assert.equal(Failures.isRejectedCredentials(serverFault), false);
  assert.equal(Failures.isRejectedCredentials(network), false);
  assert.equal(Failures.isRejectedCredentials(null), false);
});

// The wording differs per browser, so all four shapes count. A bundle that downloads but
// will not parse is a defect and must not be mistaken for a connectivity problem.
test("a failed module fetch is connectivity; a broken bundle is not", () => {
  const shapes = [
    "Failed to fetch dynamically imported module: https://example.test/vendor/pptxgenjs.js",
    "Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "Load failed",
  ];
  for (const message of shapes) {
    assert.equal(Failures.isModuleFetchFailure(new TypeError(message)), true, message);
  }
  assert.equal(Failures.isModuleFetchFailure(new SyntaxError("Unexpected token '<'")), false);
  assert.equal(Failures.isModuleFetchFailure(null), false);
});
