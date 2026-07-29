// Optional Sentry issues and structured-logs bootstrap. A blank DSN keeps it disabled.
(function (global) {
  "use strict";

  const config = global.MASS_PLANNER_MONITORING_CONFIG || {};
  const logger = global.AppLogger;
  if (!logger || !config.dsn) return;

  const moduleUrl = global.AppAssets?.url("vendor/sentry.js")
    || new URL("./vendor/sentry.js", document.baseURI).href;

  import(moduleUrl)
    .then(Sentry => {
      Sentry.init({
        dsn: config.dsn,
        environment: config.environment || "production",
        release: global.MASS_PLANNER_BUILD || undefined,
        sendDefaultPii: false,
        enableLogs: true,
        enableMetrics: false,
        defaultIntegrations: false,
        integrations: [
          Sentry.inboundFiltersIntegration(),
          Sentry.browserApiErrorsIntegration(),
          Sentry.globalHandlersIntegration(),
          Sentry.linkedErrorsIntegration(),
          Sentry.dedupeIntegration(),
        ],
        tracesSampleRate: 0,
        beforeSend(event) {
          delete event.user;
          delete event.request;
          delete event.breadcrumbs;
          return event;
        },
        beforeSendLog(log) {
          return {
            ...log,
            attributes: {
              app_surface: document.body?.dataset?.surface || "unknown",
              app_build: global.MASS_PLANNER_BUILD || "unknown",
              "sentry.release": global.MASS_PLANNER_BUILD || "unknown",
              "sentry.environment": config.environment || "production",
              ...(log.attributes?.error_type
                ? { error_type: String(log.attributes.error_type) }
                : {}),
            },
          };
        },
      });
      logger.setReporter(({ level, error, label }) => {
        const attributes = error ? { error_type: error.name || "Error" } : undefined;
        Sentry.logger[level](label, attributes);
        if (level === "error") {
          Sentry.captureException(error, {
            tags: {
              app_surface: document.body?.dataset?.surface || "unknown",
              app_build: global.MASS_PLANNER_BUILD || "unknown",
            },
            extra: label && label !== error.message ? { operation: label } : undefined,
          });
        }
      });
    })
    .catch(error => console.warn("Error monitoring could not start", error));
})(typeof window === "undefined" ? globalThis : window);
