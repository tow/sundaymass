const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const SupabaseClient = require("../src/services/supabase-client.js");

test("shared Supabase bootstrap validates configuration and imports the pinned local client", async () => {
  const imports = [];
  const calls = [];
  const client = { name: "shared-client" };
  const result = await SupabaseClient.create({
    url: "https://example.supabase.co",
    publishableKey: "public-key",
  }, {
    moduleUrl: "/vendor/supabase.js",
    importModule: async url => {
      imports.push(url);
      return {
        createClient(urlValue, keyValue, options) {
          calls.push({ urlValue, keyValue, options });
          return client;
        },
      };
    },
  });

  assert.equal(result, client);
  assert.deepEqual(imports, ["/vendor/supabase.js"]);
  assert.deepEqual(calls, [{
    urlValue: "https://example.supabase.co",
    keyValue: "public-key",
    options: {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
      },
    },
  }]);
});

test("shared Supabase bootstrap rejects incomplete configuration", async () => {
  await assert.rejects(
    () => SupabaseClient.create({ url: "", publishableKey: "key" }),
    /Supabase URL and publishable key are required/,
  );
  await assert.rejects(
    () => SupabaseClient.create({ url: "https://example.supabase.co" }),
    /Supabase URL and publishable key are required/,
  );
});

test("default browser import stays inside a GitHub Pages project subdirectory", async () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../src/services/supabase-client.js"),
    "utf8",
  );
  const context = {
    document: {
      baseURI: "https://tow.github.io/sundaymass/index.html",
      currentScript: null,
    },
    module: { exports: {} },
    URL,
  };
  vm.runInNewContext(source, context);

  const imports = [];
  await context.module.exports.create({
    url: "https://example.supabase.co",
    publishableKey: "public-key",
  }, {
    importModule: async url => {
      imports.push(url);
      return { createClient: () => ({}) };
    },
  });

  assert.deepEqual(imports, [
    "https://tow.github.io/sundaymass/vendor/supabase.js",
  ]);
});
