const test = require("node:test");
const assert = require("node:assert/strict");

const PlanSessionController = require("../src/app/plan-session-controller.js");

function harness() {
  let date = "2026-08-02";
  let online = true;
  const resets = [];
  const plans = [];
  const auth = [];
  const statuses = [];
  const errors = [];
  const controller = PlanSessionController.create({
    getDate: () => date,
    isOnline: () => online,
    onReset: () => resets.push(date),
    onPlan: (plan, meta) => plans.push({ plan, meta }),
    onAuth: value => auth.push(value),
    onStatus: (text, state) => statuses.push({ text, state }),
    logger: { error: error => errors.push(error) },
  });
  return {
    controller,
    resets,
    plans,
    auth,
    statuses,
    errors,
    setDate(value) { date = value; },
    setOnline(value) { online = value; },
  };
}

function fakeStore() {
  const subscriptions = [];
  let authCallback = null;
  let authStops = 0;
  return {
    subscriptions,
    get authStops() { return authStops; },
    subscribeAuth(callback) {
      authCallback = callback;
      return () => { authStops += 1; };
    },
    emitAuth(value) {
      authCallback(value);
    },
    subscribePlan(date, onValue, onError) {
      const subscription = {
        date,
        onValue,
        onError,
        stops: 0,
      };
      subscriptions.push(subscription);
      return () => { subscription.stops += 1; };
    },
  };
}

test("subscribe without a store resets the view and reports connection startup", () => {
  const state = harness();

  state.controller.subscribe();

  assert.deepEqual(state.resets, ["2026-08-02"]);
  assert.deepEqual(state.statuses, [{ text: "Connecting…", state: "" }]);
});

test("connect owns auth and cached-first plan delivery", () => {
  const state = harness();
  const store = fakeStore();

  state.controller.connect(store);
  store.emitAuth({ user: { email: "editor@example.test" }, isEditor: true });
  store.subscriptions[0].onValue(
    { songs: { entrance: { title: "Table of Plenty" } } },
    { offline: true, cached: true },
  );

  assert.deepEqual(state.resets, ["2026-08-02"]);
  assert.deepEqual(state.auth, [{
    user: { email: "editor@example.test" },
    isEditor: true,
  }]);
  assert.equal(store.subscriptions[0].date, "2026-08-02");
  assert.deepEqual(state.plans, [{
    plan: { songs: { entrance: { title: "Table of Plenty" } } },
    meta: { offline: true, cached: true },
  }]);
  assert.deepEqual(state.statuses, [
    { text: "Loading…", state: "" },
    { text: "Offline — showing saved copy", state: "" },
  ]);
});

test("resubscribe cleans up the previous Sunday before loading the next", () => {
  const state = harness();
  const store = fakeStore();
  state.controller.connect(store);

  state.setDate("2026-08-09");
  state.controller.subscribe();

  assert.equal(store.subscriptions[0].stops, 1);
  assert.equal(store.subscriptions[1].date, "2026-08-09");
  assert.deepEqual(state.resets, ["2026-08-02", "2026-08-09"]);
  assert.deepEqual(state.statuses.slice(-1), [{ text: "Loading…", state: "" }]);
});

test("offline errors distinguish saved and never-visited Sundays", () => {
  const cachedState = harness();
  const cachedStore = fakeStore();
  cachedState.controller.connect(cachedStore);
  cachedStore.subscriptions[0].onValue({}, { offline: true, cached: true });
  cachedStore.subscriptions[0].onError(new Error("offline"), { offline: true });

  assert.deepEqual(cachedState.statuses.slice(-1), [{
    text: "Offline — showing saved copy",
    state: "",
  }]);

  const emptyState = harness();
  const emptyStore = fakeStore();
  emptyState.controller.connect(emptyStore);
  emptyStore.subscriptions[0].onError(new Error("offline"), {
    offline: true,
    cached: false,
  });

  assert.deepEqual(emptyState.statuses.slice(-1), [{
    text: "Offline — no saved plan",
    state: "error",
  }]);
});

test("online load failures remain distinct from network loss", () => {
  const state = harness();
  const store = fakeStore();
  state.controller.connect(store);
  store.subscriptions[0].onError(new Error("database unavailable"), {});

  assert.deepEqual(state.statuses.slice(-1), [{
    text: "Could not load plan",
    state: "error",
  }]);
  assert.equal(state.errors.length, 1);

  state.setOnline(false);
  store.subscriptions[0].onError(new Error("network unavailable"), {});
  assert.deepEqual(state.statuses.slice(-1), [{
    text: "Offline — no saved plan",
    state: "error",
  }]);
});

test("reconnect and stop clean up both subscription types exactly once", () => {
  const state = harness();
  const first = fakeStore();
  const second = fakeStore();
  state.controller.connect(first);

  state.controller.connect(second);
  assert.equal(first.authStops, 1);
  assert.equal(first.subscriptions[0].stops, 1);

  state.controller.stop();
  assert.equal(second.authStops, 1);
  assert.equal(second.subscriptions[0].stops, 1);

  state.controller.stop();
  assert.equal(second.authStops, 1);
  assert.equal(second.subscriptions[0].stops, 1);
});
