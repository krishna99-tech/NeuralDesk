/**
 * NeuralDesk Application Core
 * Handles initialization, authentication lifecycle, and global events.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Check for existing session
  const savedUser = localStorage.getItem('nd_user');
  if (savedUser) {
    try {
      window.state.user = JSON.parse(savedUser);
      document.getElementById('authOverlay').style.display = 'none';
      await initializeApp();
    } catch (e) {
      console.error('Session restore failed:', e);
      localStorage.removeItem('nd_user');
      showAuth();
    }
  } else {
    showAuth();
  }
});

function showAuth() {
  document.getElementById('authOverlay').style.display = 'flex';
}

/**
 * Boot the application with user context
 */
async function initializeApp() {
  await loadUserData();
  hydrateUiFromData();
  
  onModelChange();
  showToast('NeuralDesk Secure Session Initialized', 'success');
}

/**
 * Fetch all necessary data from the SQLite backend
 */
async function loadUserData() {
  if (!window.state.user) return;
  
  const [settings, userChats] = await Promise.all([
    window.db.getSettings(),
    window.db.getChats()
  ]);

  window.state.runtimeSettings = settings || {};
  window.appData.chatHistory = userChats || [];
}

/**
 * Populate UI with loaded data
 */
function hydrateUiFromData() {
  const name = window.state.user?.username || 'Guest';
  const avatar = name.charAt(0).toUpperCase();
  
  document.getElementById('sidebarAvatar').textContent = avatar;
  document.getElementById('sidebarName').textContent = name;
  
  // Delegate all settings population to the Settings Manager
  if (window.settingsManager) {
    window.settingsManager.hydrate();
  }

  // Render lists
  renderRecentChats();
  renderMemory();
  renderKeys();
  loadMcpServers();
  renderActiveTools();
  checkConnection();
  if (typeof ensureChatInputReady === 'function') ensureChatInputReady();
}

/**
 * Global Keyboard Shortcuts
 */
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey) {
    if (e.key === 'n') { e.preventDefault(); newChat(); }
    if (e.key === ',') { e.preventDefault(); openSettings(); }
    if (e.key === 'b') { e.preventDefault(); toggleRightPanel(); }
    if (e.key === 'l') { e.preventDefault(); document.getElementById('chatInput').focus(); }
  }
});
