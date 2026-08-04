/**
 * Express 4 does NOT automatically catch rejected promises from async route
 * handlers — an unhandled rejection in one request (e.g. a DB hiccup) crashes
 * the entire Node process and takes the app down for every user. Wrap every
 * async handler with this so errors are forwarded to Express's error handler
 * instead of escaping as unhandled rejections.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
