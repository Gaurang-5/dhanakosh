// This page loads no application bundle, analytics, or third-party assets.
(() => {
  const params = new URLSearchParams(window.location.search);
  window.history.replaceState(null, "", window.location.pathname);
  const one = (name) => params.getAll(name).length === 1 ? params.get(name) : null;
  const state = one("state");
  const token = one("request_token");
  const status = one("status");
  if (!window.opener || !state || state.length > 100) return;
  window.opener.postMessage({
    type: "wealthfolio:zerodha-callback",
    state,
    status: status === "success" && token ? "success" : "error",
    token: token && token.length <= 4096 ? token : null,
  }, window.location.origin);
})();
