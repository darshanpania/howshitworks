// Site tools on every page: light/dark toggle, share menu, and (on appliance pages) a sound
// toggle. The theme choice is saved; an inline script in each page's <head> applies it
// before first paint, so the page never flashes the wrong colours.
import { track } from './analytics.js';

const THEME_KEY = 'hsw-theme';
const root = typeof document === 'undefined' ? null : document.documentElement;
const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
export const currentTheme = () => root?.dataset.theme || (systemDark() ? 'dark' : 'light');

export function setTheme(theme) {
  root.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  root.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

// Calls fn(theme) now and whenever the theme changes: from the toggle or from the system.
export function onThemeChange(fn) {
  if (!root) return;
  const call = () => fn(currentTheme());
  root.addEventListener('themechange', call);
  if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', call);
  call();
}

// Share targets. Instagram has no web share link, so it uses the phone's share sheet when
// there is one, and otherwise copies the link and opens Instagram.
export function shareLinks(url, text) {
  const u = encodeURIComponent(url), t = encodeURIComponent(text);
  return {
    x: `https://x.com/intent/post?text=${t}&url=${u}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    instagram: 'https://www.instagram.com/',
  };
}

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  soundOn: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  soundOff: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m17 9 5 6M22 9l-5 6"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  x: '<path d="M4 4l16 16M20 4 4 20" />',
  whatsapp: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1a4 4 0 0 1-2-2l1-1-1-2z"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.8" cy="7.2" r=".6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

function button(doc, cls, label, html) {
  const b = doc.createElement('button');
  b.type = 'button'; b.className = `btn tool ${cls}`; b.setAttribute('aria-label', label); b.title = label; b.innerHTML = html;
  return b;
}

// Builds the tools into container. sound is the engine's sound object, or null.
export function mountSiteTools(container, { sound = null, doc = document } = {}) {
  const win = doc.defaultView;
  const tools = doc.createElement('div'); tools.className = 'site-tools';

  if (sound?.supported) {
    const b = button(doc, 'sound-toggle', '', '');
    const show = on => {
      b.innerHTML = icon(on ? 'soundOn' : 'soundOff');
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on'); b.title = b.getAttribute('aria-label');
    };
    show(sound.on); sound.onChange(show);
    b.addEventListener('click', () => { const on = sound.toggle(); track('sound_toggled', { on }); });
    tools.append(b);
  }

  // Share menu
  const wrap = doc.createElement('div'); wrap.className = 'share';
  const shareBtn = button(doc, 'share-toggle', 'Share this page', icon('share'));
  shareBtn.setAttribute('aria-haspopup', 'true'); shareBtn.setAttribute('aria-expanded', 'false');
  const menu = doc.createElement('div'); menu.className = 'share-menu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
  const canonical = doc.querySelector('link[rel=canonical]')?.href || win.location.href;
  const title = doc.title.replace(' · How Shit Works', '');
  const text = title === 'How Shit Works' ? 'How Shit Works: everyday appliances, taken apart in 3D.' : `How a ${title.toLowerCase()} works, taken apart in 3D.`;
  const links = shareLinks(canonical, text);
  const status = doc.createElement('p'); status.className = 'share-status'; status.setAttribute('role', 'status');
  const items = [
    ['copy', 'Copy link', 'link'],
    ['x', 'Post on X', 'x'],
    ['whatsapp', 'Send on WhatsApp', 'whatsapp'],
    ['instagram', 'Share on Instagram', 'instagram'],
  ].map(([id, label, ic]) => {
    const item = doc.createElement('button'); item.type = 'button'; item.className = 'share-item'; item.setAttribute('role', 'menuitem');
    item.dataset.target = id; item.innerHTML = `${icon(ic)}<span>${label}</span>`;
    menu.append(item); return item;
  });
  menu.append(status);

  const copy = async () => {
    try { await win.navigator.clipboard.writeText(canonical); return true; } catch { return false; }
  };
  const say = msg => { status.textContent = msg; };
  function setOpen(open) {
    menu.hidden = !open; shareBtn.setAttribute('aria-expanded', String(open));
    if (open) { say(''); items[0].focus(); }
  }
  shareBtn.addEventListener('click', () => setOpen(menu.hidden));
  menu.addEventListener('click', async e => {
    const item = e.target.closest('.share-item'); if (!item) return;
    const target = item.dataset.target;
    track('page_shared', { target });
    if (target === 'copy') { say(await copy() ? 'Link copied.' : canonical); return; }
    if (target === 'instagram') {
      // Instagram only takes links from its app, so hand over to the share sheet or the clipboard.
      if (win.navigator.share) { try { await win.navigator.share({ title: doc.title, text, url: canonical }); } catch { /* closed */ } return; }
      const ok = await copy();
      say(ok ? 'Link copied. Paste it in your Instagram story or DM.' : canonical);
      win.open(links.instagram, '_blank', 'noopener');
      return;
    }
    win.open(links[target], '_blank', 'noopener');
    setOpen(false);
  });
  doc.addEventListener('pointerdown', e => { if (!wrap.contains(e.target)) setOpen(false); });
  wrap.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); setOpen(false); shareBtn.focus(); }
  });
  wrap.append(shareBtn, menu);
  tools.append(wrap);

  // Theme toggle: shows the theme you switch to.
  const themeBtn = button(doc, 'theme-toggle', '', '');
  const showTheme = () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    themeBtn.innerHTML = icon(next === 'dark' ? 'moon' : 'sun');
    themeBtn.setAttribute('aria-label', `Switch to ${next} mode`); themeBtn.title = themeBtn.getAttribute('aria-label');
  };
  themeBtn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next); showTheme(); track('theme_toggled', { theme: next });
  });
  showTheme();
  tools.append(themeBtn);

  container.append(tools);
  return tools;
}
