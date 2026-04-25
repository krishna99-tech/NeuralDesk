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
  const email = window.state.user?.email || '';
  const avatar = name.charAt(0).toUpperCase();
  
  document.getElementById('sidebarAvatar').textContent = avatar;
  document.getElementById('sidebarName').textContent = name;
  
  // Update settings fields
  const dn = document.getElementById('displayName');
  if (dn) dn.value = name;
  const ue = document.getElementById('userEmail');
  if (ue) ue.value = email;

  // Sync settings values to forms
  const rs = window.state.runtimeSettings;
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined) el.value = value;
  };
  
  if (rs) {
    setValue('systemPromptText', rs.systemPrompt || '');
    setValue('anthropicKey', rs.apiKeys?.anthropic || '');
    setValue('geminiKey', rs.apiKeys?.gemini || '');
    setValue('openaiKey', rs.apiKeys?.openai || '');
    setValue('githubToken', rs.external?.github || '');
    setValue('notionKey', rs.external?.notion || '');
    setValue('discordWebhook', rs.external?.discord || '');
    setValue('customBaseUrl', rs.endpoints?.openaiCompatibleBaseUrl || '');
    setValue('ollamaBaseUrl', rs.endpoints?.ollamaBaseUrl || '');
    if (rs.theme) setTheme(rs.theme, true);
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
