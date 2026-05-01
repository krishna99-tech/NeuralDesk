import { uiController } from './ui.js';
const SUPPORTED_THEMES = new Set(['dark', 'light', 'cyber', 'forest', 'sunset', 'ocean', 'midnight']);

function normalizeTheme(theme) {
    const value = String(theme || '').trim().toLowerCase();
    return SUPPORTED_THEMES.has(value) ? value : 'dark';
}
export class SettingsController {
    async saveSettings() {
        const secretPairs = [
            ['api.openai', document.getElementById('openaiKey')?.value || ''],
            ['api.anthropic', document.getElementById('anthropicKey')?.value || ''],
            ['api.gemini', document.getElementById('geminiKey')?.value || ''],
            ['api.deepseek', document.getElementById('deepseekKey')?.value || ''],
            ['api.aipipe', document.getElementById('aipipeKey')?.value || ''],
            ['external.github', document.getElementById('githubToken')?.value || ''],
            ['external.notion', document.getElementById('notionKey')?.value || ''],
            ['external.linear', document.getElementById('linearKey')?.value || ''],
            ['external.slackWebhook', document.getElementById('slackWebhook')?.value || ''],
            ['external.discordWebhook', document.getElementById('discordWebhook')?.value || '']
        ];
        for (const [name, value] of secretPairs) {
            if (value && window.electronAPI?.vaultSetSecret) {
                await window.electronAPI.vaultSetSecret(name, value);
            }
        }
        const systemPrompt = document.getElementById('systemPromptText')?.value || '';
        const settings = {
            ai: {
                defaultProvider: document.getElementById('defaultProviderSelect')?.value,
                temperature: parseFloat(document.getElementById('aiTemperature')?.value || '0.7'),
                maxTokens: parseInt(document.getElementById('maxTokens')?.value || '4096'),
                systemPrompt,
                confirmHandoff: document.getElementById('setting-confirmHandoff')?.classList.contains('on')
            },
            systemPrompt,
            ui: {
                theme: document.getElementById('themeSelect')?.value,
                defaultModel: document.getElementById('defaultModelSelect')?.value,
                displayName: document.getElementById('displayName')?.value,
                autoScroll: document.getElementById('setting-autoscroll')?.classList.contains('on'),
                compact: document.getElementById('setting-compact')?.classList.contains('on'),
                autoSave: document.getElementById('setting-autosave')?.classList.contains('on')
            },
            privacy: {
                logRetention: document.getElementById('logRetentionSelect')?.value || '30',
                clearOnExit: document.getElementById('setting-clearOnExit')?.classList.contains('on'),
                incognito: document.getElementById('setting-incognito')?.classList.contains('on')
            },
            endpoints: {
                openaiCompatibleBaseUrl: document.getElementById('customBaseUrl')?.value || '',
                ollamaBaseUrl: document.getElementById('ollamaBaseUrl')?.value || ''
            },
            apiKeys: {
                anthropic: document.getElementById('anthropicKey')?.value || '',
                gemini: document.getElementById('geminiKey')?.value || '',
                openai: document.getElementById('openaiKey')?.value || '',
                deepseek: document.getElementById('deepseekKey')?.value || '',
                aipipe: document.getElementById('aipipeKey')?.value || '',
            },
            external: {
                githubToken: document.getElementById('githubToken')?.value || '',
                notionKey: document.getElementById('notionKey')?.value || '',
                discordWebhook: document.getElementById('discordWebhook')?.value || '',
                slackWebhook: document.getElementById('slackWebhook')?.value || '',
                linearKey: document.getElementById('linearKey')?.value || '',
                webSearchIntegration: document.getElementById('setting-webSearchIntegration')?.classList.contains('on')
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
            document.documentElement.setAttribute('data-theme', normalizeTheme(settings.ui.theme));
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
