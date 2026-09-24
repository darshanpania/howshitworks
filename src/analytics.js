// PostHog product analytics. posthog-js loads lazily so it never blocks the 3D scene,
// and events sent before it loads wait in a queue. Outside a browser (node tests) and
// in `vite dev` every call is a no-op.
const TOKEN = import.meta.env?.VITE_POSTHOG_KEY || 'phc_Bcxo97Wcr56KB4ww5AUhiWHcrJspNjSywEPEpzGRZEBe';
const HOST = import.meta.env?.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const enabled = typeof window !== 'undefined' && (import.meta.env?.PROD || import.meta.env?.VITE_POSTHOG_DEV === 'true');

let client = null;
const queue = [];

// "/appliances/toaster" -> "toaster"; the landing page is "home".
export const appliance = typeof location === 'undefined' ? null
  : (location.pathname.match(/\/appliances\/([^/]+)/)?.[1] ?? 'home');

if (enabled) {
  import('posthog-js').then(({ default: posthog }) => {
    posthog.init(TOKEN, {
      api_host: HOST,
      defaults: '2025-05-24',
      person_profiles: 'identified_only',
      loaded: ph => ph.register({ appliance }),
    });
    client = posthog;
    queue.splice(0).forEach(([event, props]) => client.capture(event, props));
  }).catch(() => {});
}

export function track(event, props = {}) {
  if (!enabled) return;
  if (client) client.capture(event, props);
  else queue.push([event, props]);
}

// Sends the event only the first time it happens on this page.
const seen = new Set();
export function trackOnce(event, props) {
  if (seen.has(event)) return;
  seen.add(event);
  track(event, props);
}
