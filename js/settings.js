/**
 * NeuralDesk Settings Manager
 * Handles all settings persistence, UI hydration, and configuration logic.
 */

window.settingsManager = {
  /**
   * Save all settings from the UI to the database
   */
  save: async function() {
    if (!window.state.runtimeSettings) return;

    const getValue = (id) => document.getElementById(id)?.value || '';
    const getToggle = (id) => document.getElementById(`setting-${id}`)?.classList.contains('on');
    
    const updatedSettings = {
      ...window.state.runtimeSettings,
      profile: { 
        displayName: getValue('displayName') || 'Guest',
        theme: getValue('themeSelect') || 'dark'
      },
      systemPrompt: getValue('systemPromptText'),
      apiKeys: {
        ...window.state.runtimeSettings.apiKeys,
        anthropic: getValue('anthropicKey'),
        gemini: getValue('geminiKey'),
        openai: getValue('openaiKey'),
        deepseek: getValue('deepseekKey'),
        github: getValue('githubToken')
      },
      external: {
        github: getValue('githubToken'),
        notion: getValue('notionKey'),
        discord: getValue('discordWebhook'),
        slack: getValue('slackWebhook'),
        linear: getValue('linearKey')
      },
      endpoints: {
        openaiCompatibleBaseUrl: getValue('customBaseUrl'),
        ollamaBaseUrl: getValue('ollamaBaseUrl')
      },
      ui: {
        autoscroll: getToggle('autoscroll'),
        compact: getToggle('compact'),
        autosave: getToggle('autosave'),
        showLineNumbers: getToggle('lineNumbers')
      },
      ai: {
        temperature: parseFloat(getValue('aiTemperature')),
        maxTokens: parseInt(getValue('maxTokens')),
        confirmHandoff: getToggle('confirmHandoff'),
        defaultProvider: getValue('defaultProviderSelect')
      },
      privacy: {
        clearOnExit: getToggle('clearOnExit'),
        incognitoMode: getToggle('incognito')
      }
    };

    try {
      const saved = await window.db.saveSettings(updatedSettings);
      window.state.runtimeSettings = saved;
      
      // Apply immediate UI changes
      document.body.classList.toggle('compact-view', updatedSettings.ui?.compact);
      if (updatedSettings.profile.theme) {
        document.documentElement.setAttribute('data-theme', updatedSettings.profile.theme);
      }
      
      showToast('Settings successfully updated', 'success');
      if (typeof onModelChange === 'function') onModelChange();
    } catch (err) {
      console.error('Failed to save settings:', err);
      showToast('Error saving configuration', 'error');
    }
  },

  /**
   * Populate the settings UI from the loaded configuration
   */
  hydrate: function() {
    const rs = window.state.runtimeSettings;
    if (!rs) return;

    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el && value !== undefined) el.value = value;
    };

    // Profile & General
    setValue('displayName', rs.profile?.displayName || '');
    setValue('themeSelect', rs.profile?.theme || 'dark');

    // AI Configuration
    setValue('systemPromptText', rs.systemPrompt || '');
    setValue('aiTemperature', rs.ai?.temperature || 0.7);
    setValue('maxTokens', rs.ai?.maxTokens || 4096);
    setValue('defaultProviderSelect', rs.ai?.defaultProvider || 'openai');
    if (document.getElementById('tempVal')) {
        document.getElementById('tempVal').textContent = rs.ai?.temperature || 0.7;
    }

    // API Keys
    setValue('anthropicKey', rs.apiKeys?.anthropic || '');
    setValue('geminiKey', rs.apiKeys?.gemini || '');
    setValue('openaiKey', rs.apiKeys?.openai || '');
    setValue('deepseekKey', rs.apiKeys?.deepseek || '');

    // External Services
    setValue('githubToken', rs.external?.github || '');
    setValue('notionKey', rs.external?.notion || '');
    setValue('discordWebhook', rs.external?.discord || '');
    setValue('slackWebhook', rs.external?.slack || '');
    setValue('linearKey', rs.external?.linear || '');

    // Endpoints
    setValue('customBaseUrl', rs.endpoints?.openaiCompatibleBaseUrl || '');
    setValue('ollamaBaseUrl', rs.endpoints?.ollamaBaseUrl || '');

    // Toggles
    const syncToggle = (id, val) => {
      const el = document.getElementById(`setting-${id}`);
      if (el) el.classList.toggle('on', !!val);
    };
    
    syncToggle('autoscroll', rs.ui?.autoscroll ?? true);
    syncToggle('compact', rs.ui?.compact ?? false);
    syncToggle('autosave', rs.ui?.autosave ?? true);
    syncToggle('lineNumbers', rs.ui?.showLineNumbers ?? true);
    syncToggle('confirmHandoff', rs.ai?.confirmHandoff ?? false);
    syncToggle('clearOnExit', rs.privacy?.clearOnExit ?? false);
    syncToggle('incognito', rs.privacy?.incognitoMode ?? false);
    
    // Apply initial state
    document.body.classList.toggle('compact-view', rs.ui?.compact);
  }
};

/**
 * UI Event Handlers for Settings
 */

function openSettings(pane = 'general') {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;
  modal.classList.add('open');
  switchSettingsPane(pane, document.querySelector(`[data-pane="${pane}"]`) || document.querySelector('.msidebar-item'));
  if (pane === 'mcp' && typeof loadMcpServers === 'function') loadMcpServers();
}

function closeSettings() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.remove('open');
}

function switchSettingsPane(pane, el) {
  document.querySelectorAll('.settings-pane').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.msidebar-item').forEach(i => i.classList.remove('active'));
  const target = document.getElementById(`pane-${pane}`);
  if (target) target.classList.remove('hidden');
  if (el) el.classList.add('active');
}

function toggleSetting(id) {
  const el = document.getElementById(`setting-${id}`);
  if (el) el.classList.toggle('on');
}

function toggleKeyVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const toggle = input.nextElementSibling;
  if (input.type === 'password') {
    input.type = 'text';
    if (toggle) toggle.textContent = 'Hide';
  } else {
    input.type = 'password';
    if (toggle) toggle.textContent = 'Show';
  }
}

async function saveSettings() {
    await window.settingsManager.save();
}
