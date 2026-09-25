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

  // A random token per browser lets Sentry count how many browsers an issue reaches.
  // It names nobody: no name, email, or IP address is ever attached to an event.
  const browserIdKey = "st-james-monitoring-browser-v1";
  function browserId() {
    try {
      const storage = global.localStorage;
      const existing = storage?.getItem(browserIdKey);
      if (existing) return existing;
      const id = global.crypto?.randomUUID?.();
      if (id) storage?.setItem(browserIdKey, id);
      return id;
    } catch {
      return undefined;
    }
  }

  const moduleUrl = global.AppAssets?.url("vendor/sentry.js")
    || new URL("./vendor/sentry.js", document.baseURI).href;

  // Named `planner@<build>` or `repertoire@<build>`: the deploy workflow creates the release
  // under the same name and attaches the commit it was built from.
  const surface = document.body?.dataset?.surface || "unknown";
  const release = global.MASS_PLANNER_BUILD
    ? `${surface}@${global.MASS_PLANNER_BUILD}`
    : undefined;

  import(moduleUrl)
    .then(Sentry => {
      Sentry.init({
        dsn: config.dsn,
        environment: config.environment || "production",
        release,
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
        // In-app browsers inject their own scripts into every page (Meta's Android
        // browsers under `iabjs:`); their failures are not this application's.
        denyUrls: [/^iabjs:/i],
        beforeSend(event) {
          event.user = event.user?.id ? { id: event.user.id } : undefined;
          delete event.request;
          delete event.breadcrumbs;
          return event;
        },
        beforeSendLog(log) {
          return {
            ...log,
            attributes: {
              app_surface: surface,
              app_build: global.MASS_PLANNER_BUILD || "unknown",
              "sentry.release": release || "unknown",
              "sentry.environment": config.environment || "production",
              ...errorAttributes(log.attributes),
            },
          };
        },
      });
      const id = browserId();
      if (id) Sentry.setUser({ id });
      logger.setReporter(({ level, error, label }) => {
        const detail = errorDetail(error);
        Sentry.logger[level](label, error ? detail : undefined);
        if (level === "error") {
          Sentry.captureException(error, {
            tags: {
              app_surface: surface,
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
