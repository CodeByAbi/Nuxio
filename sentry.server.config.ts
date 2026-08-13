// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import { AppError } from "@/lib/server/shared/errors";
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://c0d7f11d107043b4f7476e171031aa17@o4511870285709312.ingest.us.sentry.io/4511870286036992",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  beforeSend(event, hint) {
    const error = hint.originalException;
    if (error instanceof AppError && error.isOperational) {
      return null;
    }
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
    }
    if (event.request?.cookies) {
      delete event.request.cookies;
    }
    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        if (/password|token|key|authorization/i.test(key)) {
          event.extra[key] = "[REDACTED]";
        }
      }
    }
    return event;
  },

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});
