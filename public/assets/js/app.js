const API = {
  async get(path, opts = {}) {
    const res = await fetch(path, { credentials: 'include', ...opts });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async put(path, body) {
    const res = await fetch(path, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
};

async function setAuthNav() {
  try {
    const { user } = await API.get('/api/auth/me');
    const nav = document.getElementById('nav');
    if (!nav) return;
    nav.innerHTML = `
      <a href="/my-tickets.html" class="nav-link">My Tickets</a>
      <a href="/profile.html" class="nav-link">${user.name || 'Profile'}</a>
      <a href="/dashboard.html" class="nav-link">Organizer</a>
      <a href="#" id="logoutTop" class="nav-link">Logout</a>
    `;
    document.getElementById('logoutTop')?.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch (_) {}
      location.href = '/';
    });
  } catch (_) { /* not logged in */ }
}

async function loadEvents() {
  const params = new URLSearchParams();
  const q = document.getElementById('search');
  const c = document.getElementById('category');
  if (q && q.value) params.set('q', q.value);
  if (c && c.value) params.set('category', c.value);
  params.set('public', '1');
  const data = await API.get(`/api/events?${params.toString()}`);
  const root = document.getElementById('events');
  if (!root) return;
  root.innerHTML = '';

  const now = new Date();

  // keep only upcoming or ongoing events
  const visibleEvents = data.events.filter(e => {
    const endOrStart = e.end_time ? new Date(e.end_time) : new Date(e.start_time);
    return endOrStart > now;
  });

  visibleEvents.forEach((e, i) => {
    const d = document.createElement('div');
    d.className = 'card appear';
    d.style.animationDelay = `${i * 40}ms`;
    d.innerHTML = `
      <h3>${e.title}</h3>
      <div class="muted">${new Date(e.start_time).toLocaleString()} • ${e.location || ''}</div>
      <p>${(e.description || '').slice(0, 120)}${(e.description || '').length > 120 ? '...' : ''}</p>
      <div class="flex">
        <a class="btn outline" href="/event.html?e=${e.uuid}">View</a>
      </div>
    `;
    root.appendChild(d);
  });
}

function bindFilters() {
  const q = document.getElementById('search');
  const c = document.getElementById('category');
  if (q) q.addEventListener('input', debounce(loadEvents, 300));
  if (c) c.addEventListener('change', loadEvents);
}

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Auto init on landing page
if (document.getElementById('events')) {
  setAuthNav();
  bindFilters();
  loadEvents();
}
