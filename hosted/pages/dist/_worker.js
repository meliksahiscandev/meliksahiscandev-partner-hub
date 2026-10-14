// Forwards everything to the partner-hub Worker; the Worker sees this host, so cookies, the CSRF origin check
// and the content security policy all apply to gamesmedya-partner-hub.pages.dev.
export default {
  fetch(request, env) {
    return env.HUB.fetch(request);
  },
};
