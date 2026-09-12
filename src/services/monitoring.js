// Optional Sentry issues and structured-logs bootstrap. A blank DSN keeps it disabled.
(function (global) {
  "use strict";

  const config = global.MASS_PLANNER_MONITORING_CONFIG || {};
  const logger = global.AppLogger;
  if (!logger || !config.dsn) return;

  const errorAttributeNames = [
    "error_type",
    "error_code",
    "error_status",
    "error_details",
    "error_hint",
  ];

  function errorAttributes(source) {
    const attributes = {};
    errorAttributeNames.forEach(name => {
      const value = source?.[name];
      if (value !== undefined && value !== null && value !== "") {
        attributes[name] = String(value);
      }
    });
    return attributes;
  }

  // PostgREST failures carry their diagnosis in code/details/hint rather than
  // the message; surface them so PGRST301 groups apart from P0001 or a fetch
  // failure. The logger wraps non-Error values with the original as `cause`.
  function errorDetail(error) {
    if (!error) return {};
    const source = error.cause && typeof error.cause === "object" ? error.cause : {};
    return errorAttributes({
      error_type: error.name || "Error",
      error_code: error.code ?? source.code,
      error_status: error.status ?? source.status,
      error_details: error.details ?? source.details,
      error_hint: error.hint ?? source.hint,
    });
  }

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
              ...errorAttributes(log.attributes),
            },
          };
        },
      });
      logger.setReporter(({ level, error, label }) => {
        const detail = errorDetail(error);
        Sentry.logger[level](label, error ? detail : undefined);
        if (level === "error") {
          Sentry.captureException(error, {
            tags: {
              app_surface: document.body?.dataset?.surface || "unknown",
              app_build: global.MASS_PLANNER_BUILD || "unknown",
              ...(detail.error_code ? { error_code: detail.error_code } : {}),
            },
            extra: {
              ...(label && label !== error.message ? { operation: label } : {}),
              ...detail,
            },
          });
        }
      });
    })
    .catch(error => console.warn("Error monitoring could not start", error));
})(typeof window === "undefined" ? globalThis : window);
