import { uiController } from './ui.js';
export class SettingsController {
    async saveSettings() {
        const systemPrompt = document.getElementById('systemPromptText')?.value || '';
        const settings = {
            ai: {
                defaultProvider: document.getElementById('defaultProviderSelect')?.value,
                temperature: parseFloat(document.getElementById('aiTemperature')?.value || '0.7'),
                maxTokens: parseInt(document.getElementById('maxTokens')?.value || '4096'),
                systemPrompt
            },
            systemPrompt,
            ui: {
                theme: document.getElementById('themeSelect')?.value,
                displayName: document.getElementById('displayName')?.value,
                autoScroll: document.getElementById('setting-autoscroll')?.classList.contains('on'),
                compact: document.getElementById('setting-compact')?.classList.contains('on')
            },
            endpoints: {
                openaiCompatibleBaseUrl: document.getElementById('customBaseUrl')?.value || '',
                ollamaBaseUrl: document.getElementById('ollamaBaseUrl')?.value || ''
            },
            apiKeys: {
                anthropic: document.getElementById('anthropicKey')?.value,
                gemini: document.getElementById('geminiKey')?.value,
                openai: document.getElementById('openaiKey')?.value,
                deepseek: document.getElementById('deepseekKey')?.value
            },
            topbar: {
                selectedAgent: document.getElementById('agentSelect')?.value || 'auto',
                selectedModel: document.getElementById('modelTypeSelect')?.value || 'fast',
                connectionText: document.getElementById('connectionBadge')?.textContent || 'Not checked',
                connectionClass: document.getElementById('connectionBadge')?.className || 'connection-badge'
            }
        };
        try {
            await window.electronAPI.saveData('settings', settings);
            window.appData.settings = settings;
            if (typeof window.refreshSettingsPanels === 'function') {
                window.refreshSettingsPanels();
            }
            uiController.showToast('Settings saved successfully', 'success');
            uiController.closeSettings();
            // Apply theme
            document.documentElement.setAttribute('data-theme', settings.ui.theme);
        }
        catch (err) {
            console.error(err);
            uiController.showToast('Failed to save settings', 'error');
        }
    }
    toggleSetting(id) {
        const el = document.getElementById(`setting-${id}`);
        if (el) {
            el.classList.toggle('on');
        }
    }
    toggleKeyVisibility(id) {
        const input = document.getElementById(id);
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    }
}
export const settingsController = new SettingsController();
