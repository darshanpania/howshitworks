export function partOpacity(name, { explode, focus }) {
  const interiorRequested = explode > 0.12 || focus.some(part => !['cord', 'shell'].includes(part));
  if (name === 'shell') return interiorRequested ? 0.2 : 1;
  if (!interiorRequested || focus.length === 0 || focus.includes(name)) return 1;
  return 0.28;
}
