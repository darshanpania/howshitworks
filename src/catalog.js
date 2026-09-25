// The published appliances, in reading order. "No. 0N" on each page comes from here.
export const CATALOG = [
  { slug: 'ceiling-fan', no: 1, title: 'Ceiling Fan' },
  { slug: 'toaster', no: 2, title: 'Toaster' },
  { slug: 'pressure-cooker', no: 3, title: 'Pressure Cooker' },
  { slug: 'door-knob', no: 4, title: 'Door Knob' },
  { slug: 'door-lock', no: 5, title: 'Door Lock' },
];

export const applianceUrl = slug => `/appliances/${slug}`;

// Where "Next" goes after the last step: the following appliance, or home after the last one.
export function nextAppliance(slug) {
  const i = CATALOG.findIndex(a => a.slug === slug);
  if (i < 0 || i === CATALOG.length - 1) return { href: '/', label: 'All appliances', slug: 'home' };
  const next = CATALOG[i + 1];
  return { href: applianceUrl(next.slug), label: `Next: ${next.title}`, slug: next.slug };
}
