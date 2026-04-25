/**
 * NeuralDesk UI Utilities
 */

// ===== TOASTS =====
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type]||'ℹ'}</span>${msg}`;
  container.appendChild(toast);
  setTimeout(() => { 
    toast.style.opacity = '0'; 
    toast.style.transform = 'translateX(20px)'; 
    setTimeout(() => toast.remove(), 300); 
  }, 3000);
}

// ===== THEME & ACCENT =====
function setTheme(theme, silent = false) {
  const root = document.documentElement;
  const resolvedTheme = theme === 'system' 
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') 
    : theme;
  
  root.setAttribute('data-theme', resolvedTheme);
  if (!silent) showToast(`Theme: ${theme}`, 'success');
  if (window.state.runtimeSettings) window.state.runtimeSettings.theme = theme;
}

function setAccent(color, color2) {
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent2', color2);
  showToast('Accent color updated', 'success');
}

// ===== DOM HELPERS =====
function toggleParam(el) {
  el.classList.toggle('on');
}

function closeOnOutside(e, modalId, closeFn) {
  if (e.target === document.getElementById(modalId)) closeFn();
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

function getTimeAgo(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHrs < 24) return `${diffHrs}h`;
  return `${diffDays}d`;
}

function setConnectionBadge(state, text) {
  const badge = document.getElementById('connectionBadge');
  if (!badge) return;
  badge.classList.remove('ok', 'err', 'checking');
  if (state) badge.classList.add(state);
  badge.textContent = text;
}

function getChatIcon(title) {
  const t = title.toLowerCase();
  if (t.includes('api') || t.includes('rest')) return '💬';
  if (t.includes('debug') || t.includes('leak')) return '🔧';
  if (t.includes('analyze') || t.includes('data') || t.includes('csv')) return '📊';
  if (t.includes('agent') || t.includes('pipeline')) return '🤖';
  if (t.includes('blog') || t.includes('write')) return '📝';
  if (t.includes('scrape') || t.includes('web')) return '🌐';
  if (t.includes('test') || t.includes('unit')) return '🧪';
  if (t.includes('sql') || t.includes('db') || t.includes('schema')) return '🗄️';
  return '💬';
}
