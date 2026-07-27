// Owns auth and date-scoped live-plan subscriptions plus their visible load status.
(function (global) {
  "use strict";

  function create({
    getDate,
    isOnline,
    onReset,
    onPlan,
    onAuth,
    onStatus,
    logger = console,
  }) {
    let store = null;
    let stopPlanSubscription = null;
    let stopAuthSubscription = null;
    let showingCachedPlan = false;

    function subscribe() {
      if (stopPlanSubscription) {
        stopPlanSubscription();
        stopPlanSubscription = null;
      }
      showingCachedPlan = false;
      onReset();
      if (!store) {
        onStatus("Connecting…", "");
        return;
      }

      onStatus("Loading…", "");
      stopPlanSubscription = store.subscribePlan(
        getDate(),
        (plan, meta = {}) => {
          const offline = Boolean(meta.offline);
          showingCachedPlan = Boolean(offline && meta.cached);
          onPlan(plan, meta);
          onStatus(
            offline
              ? (meta.cached ? "Offline — showing saved copy" : "Offline — no saved plan")
              : "Up to date",
            offline ? "" : "saved",
          );
        },
        (error, meta = {}) => {
          logger.error(error);
          if (meta.offline || !isOnline()) {
            const hasCachedPlan = showingCachedPlan || meta.cached;
            onStatus(
              hasCachedPlan ? "Offline — showing saved copy" : "Offline — no saved plan",
              hasCachedPlan ? "" : "error",
            );
          } else {
            onStatus("Could not load plan", "error");
          }
        },
      );
    }

    function connect(value) {
      if (stopAuthSubscription) {
        stopAuthSubscription();
        stopAuthSubscription = null;
      }
      store = value;
      stopAuthSubscription = store.subscribeAuth(onAuth);
      subscribe();
    }

    function stop() {
      if (stopPlanSubscription) {
        stopPlanSubscription();
        stopPlanSubscription = null;
      }
      if (stopAuthSubscription) {
        stopAuthSubscription();
        stopAuthSubscription = null;
      }
    }

    return Object.freeze({ connect, stop, subscribe });
  }

  const api = Object.freeze({ create });
  global.PlanSessionController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
