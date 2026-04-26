const DEFAULT_PROMPTS = {
    all: [
        { icon: '💡', label: 'Explain this concept', text: 'Explain this concept in simple terms: ' },
        { icon: '🐛', label: 'Debug my code',        text: 'Debug the following code and explain what is wrong:\n\n' },
        { icon: '✍️', label: 'Summarize this text',  text: 'Summarize the following text concisely:\n\n' },
        { icon: '📊', label: 'Analyze this data',    text: 'Analyze the following data and give key insights:\n\n' },
        { icon: '📧', label: 'Draft an email',        text: 'Draft a professional email about: ' },
        { icon: '🌐', label: 'Translate to English',  text: 'Translate the following to English:\n\n' },
    ],
    code: [
        { icon: '🐛', label: 'Debug my code',        text: 'Debug the following code and explain what is wrong:\n\n' },
        { icon: '🔁', label: 'Refactor my code',     text: 'Refactor the following code for readability and performance:\n\n' },
        { icon: '🧪', label: 'Write unit tests',     text: 'Write unit tests for the following function:\n\n' },
        { icon: '📝', label: 'Add comments',         text: 'Add clear inline comments to this code:\n\n' },
        { icon: '⚡', label: 'Optimize performance', text: 'Optimize the following code for better performance:\n\n' },
        { icon: '🔒', label: 'Security review',      text: 'Review the following code for security vulnerabilities:\n\n' },
    ],
    write: [
        { icon: '📧', label: 'Draft an email',       text: 'Draft a professional email about: ' },
        { icon: '✍️', label: 'Summarize this text',  text: 'Summarize the following text concisely:\n\n' },
        { icon: '🖊️', label: 'Improve my writing',  text: 'Improve the clarity and tone of this text:\n\n' },
        { icon: '📣', label: 'Write a tweet',        text: 'Write a concise and engaging tweet about: ' },
        { icon: '📋', label: 'Create a report',      text: 'Create a structured report on: ' },
        { icon: '🎯', label: 'Write a bio',          text: 'Write a professional bio for someone who: ' },
    ],
    analyze: [
        { icon: '📊', label: 'Analyze this data',    text: 'Analyze the following data and give key insights:\n\n' },
        { icon: '⚖️', label: 'Pros and cons',        text: 'List the pros and cons of: ' },
        { icon: '🔍', label: 'Compare options',      text: 'Compare and contrast the following options:\n\n' },
        { icon: '📈', label: 'Trend analysis',       text: 'Identify trends in the following information:\n\n' },
        { icon: '🧩', label: 'Root cause analysis',  text: 'Perform a root cause analysis of this problem: ' },
    ],
    research: [
        { icon: '💡', label: 'Explain this concept', text: 'Explain this concept in simple terms: ' },
        { icon: '🌐', label: 'Translate to English', text: 'Translate the following to English:\n\n' },
        { icon: '🗂️', label: 'Literature summary',  text: 'Summarize current knowledge on: ' },
        { icon: '❓', label: 'Fact check this',      text: 'Fact check and verify the following claim: ' },
        { icon: '📚', label: 'Suggest resources',    text: 'Suggest learning resources for: ' },
    ],
};

const RESPONSE_OPTIONS = {
    mode:   { label: 'Mode',   choices: ['auto', 'fast', 'smart', 'creative'], default: 'auto' },
    length: { label: 'Length', choices: ['concise', 'default', 'detailed'],    default: 'default' },
    format: { label: 'Format', choices: ['markdown', 'plain'],                 default: 'markdown' },
};

const OPTION_SYSTEM_HINTS = {
    mode: {
        auto:     '',
        fast:     'Respond quickly with a brief, direct answer.',
        smart:    'Think step by step and provide a thorough, reasoned answer.',
        creative: 'Be creative, imaginative, and explore unconventional ideas.',
    },
    length: {
        concise:  'Keep your response very concise — a few sentences at most.',
        default:  '',
        detailed: 'Provide a comprehensive, detailed response with full explanations.',
    },
    format: {
        markdown: '',
        plain:    'Respond in plain text only. Do not use markdown, bullet points, or headers.',
    },
};

export class ChatController {
    inputEl           = null;
    messagesContainer = null;
    abortController   = null;

    options = {
        mode:   'auto',
        length: 'default',
        format: 'markdown',
    };

    promptHistory = [];

    constructor() {
        this.inputEl           = document.getElementById('chatInput');
        this.messagesContainer = document.getElementById('chatMessages');
        this._loadPromptHistory();
    }

    sendMessage(activeTools = []) {
        if (window.streamState.isGenerating) return;
        if (!this.inputEl)                   return;

        const text = this.inputEl.value.trim();
        if (!text) return;

        if (!window.state.currentChatId) this.createNewSession(text);

        this.addMessage('user', text);
        window.state.messages.push({ role: 'user', content: text });

        const chat = window.appData.chatHistory.find(c => c.id === window.state.currentChatId);
        if (chat) {
            chat.messages  = window.state.messages;
            chat.timestamp = new Date().toISOString();
            this.saveHistory();
        }

        this._addToPromptHistory(text);
        this.inputEl.value        = '';
        this.inputEl.style.height = 'auto';
        this.requestAgentResponse(text, activeTools);
    }

    applyDefaultPrompt(promptText) {
        if (!this.inputEl) return;
        this.inputEl.value = promptText;
        this.inputEl.focus();
        const len = promptText.length;
        this.inputEl.setSelectionRange(len, len);
    }

    setOption(key, value) {
        if (!(key in this.options)) return;
        this.options[key] = value;
        this._persistOptions();
    }

    stopGeneration() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    renderDefaultPrompts(container, category = 'all') {
        if (!container) return;
        container.innerHTML = '';

        const tabBar = document.createElement('div');
        tabBar.className = 'prompt-category-tabs';

        Object.keys(DEFAULT_PROMPTS).forEach(cat => {
            const tab = document.createElement('button');
            tab.className   = 'prompt-cat-tab' + (cat === category ? ' active' : '');
            tab.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
            tab.addEventListener('click', () => this.renderDefaultPrompts(container, cat));
            tabBar.appendChild(tab);
        });
        container.appendChild(tabBar);

        const grid = document.createElement('div');
        grid.className = 'prompt-chip-grid';

        (DEFAULT_PROMPTS[category] ?? DEFAULT_PROMPTS.all).forEach(({ icon, label, text }) => {
            const chip = document.createElement('button');
            chip.className = 'prompt-chip';
            chip.innerHTML = `<span class="prompt-chip-icon">${icon}</span><span>${label}</span>`;
            chip.addEventListener('click', () => this.applyDefaultPrompt(text));
            grid.appendChild(chip);
        });
        container.appendChild(grid);

        if (this.promptHistory.length > 0) {
            const recentTitle = document.createElement('p');
            recentTitle.className   = 'prompt-section-title';
            recentTitle.textContent = 'Recent';
            container.appendChild(recentTitle);

            const recentList = document.createElement('div');
            recentList.className = 'prompt-recent-list';

            this.promptHistory.slice(0, 5).forEach(histText => {
                const item = document.createElement('button');
                item.className   = 'prompt-recent-item';
                item.textContent = histText.length > 60 ? histText.slice(0, 57) + '…' : histText;
                item.title       = histText;
                item.addEventListener('click', () => this.applyDefaultPrompt(histText));
                recentList.appendChild(item);
            });
            container.appendChild(recentList);
        }
    }

    renderOptionsBar(container) {
        if (!container) return;
        container.innerHTML = '';

        Object.entries(RESPONSE_OPTIONS).forEach(([key, { label, choices }]) => {
            const group = document.createElement('div');
            group.className = 'options-group';

            const lbl = document.createElement('span');
            lbl.className   = 'options-label';
            lbl.textContent = label;
            group.appendChild(lbl);

            choices.forEach(choice => {
                const btn = document.createElement('button');
                btn.className   = 'options-btn' + (this.options[key] === choice ? ' active' : '');
                btn.textContent = choice.charAt(0).toUpperCase() + choice.slice(1);
                btn.addEventListener('click', () => {
                    this.setOption(key, choice);
                    this.renderOptionsBar(container);
                });
                group.appendChild(btn);
            });
            container.appendChild(group);
        });
    }

    createNewSession(titleText) {
        const newId   = 'c_' + Date.now();
        const newChat = {
            id:        newId,
            title:     titleText.substring(0, 30) + (titleText.length > 30 ? '…' : ''),
            timestamp: new Date().toISOString(),
            messages:  [],
        };
        window.appData.chatHistory.unshift(newChat);
        window.state.currentChatId = newId;
        this.renderRecentChats();
    }

    addMessage(role, content, opts = {}) {
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) welcomeScreen.remove();
        if (!this.messagesContainer) return;

        const isUser   = role === 'user';
        const userName = window.state.user?.username || 'Guest';

        const row = document.createElement('div');
        row.className = `message-row ${isUser ? 'user' : ''}`;

        const avatarEl = document.createElement('div');
        avatarEl.className   = `msg-avatar ${isUser ? 'user-av' : 'ai'}`;
        avatarEl.textContent = isUser ? userName.charAt(0).toUpperCase() : '✦';

        const body = document.createElement('div');
        body.className = 'msg-body';

        if (!isUser) {
            const sender   = document.createElement('div');
            sender.className = 'msg-sender';
            const agent    = document.getElementById('agentSelect')?.value || 'auto';
            const modelTag = (opts.model || agent).toUpperCase();
            sender.innerHTML = `<span>NeuralDesk</span><span class="model-tag">${modelTag}</span>`;
            body.appendChild(sender);
        }

        const bubble = document.createElement('div');
        bubble.className = `msg-bubble ${isUser ? 'user-msg' : 'ai'}`;
        if (opts.isError) bubble.classList.add('error-msg');
        if (opts.id) bubble.id = opts.id + '_bubble';

        const msgContent = document.createElement('div');
        if (opts.id)        msgContent.id        = opts.id;
        if (opts.streaming) msgContent.className = 'streaming-cursor';

        if (window.renderer) {
            window.renderer.render(content, msgContent);
        } else {
            msgContent.textContent = content;
        }

        bubble.appendChild(msgContent);
        body.appendChild(bubble);

        if (isUser) {
            row.appendChild(body);
            row.appendChild(avatarEl);
        } else {
            row.appendChild(avatarEl);
            row.appendChild(body);
        }

        this.messagesContainer.appendChild(row);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        return msgContent;
    }

    async requestAgentResponse(input, tools = []) {
        window.streamState.isGenerating = true;
        this.toggleLoading(true);
        this.abortController = new AbortController();

        try {
            const agent      = document.getElementById('agentSelect')?.value    || 'auto';
            const model      = document.getElementById('modelTypeSelect')?.value || 'smart';
            const systemHint = this._buildSystemHint();

            const response = await window.electronAPI.askAI(
                {
                    input,
                    chatId:     window.state.currentChatId,
                    agent,
                    modelType:  model,
                    systemHint,
                    tools,
                    options:    { ...this.options },
                },
                { signal: this.abortController.signal },
            );

            if (typeof response === 'string' && response.startsWith('Error')) {
                this.addMessage('assistant', response, { isError: true });
                return;
            }

            this.addMessage('assistant', response.text, {
                model:      response.model,
                mcpResults: response.mcpResults,
            });

            window.state.messages.push({ role: 'assistant', content: response.text });
            if (response.chartData) window.state.sessionData = response.chartData;
            this.saveHistory();

        } catch (error) {
            if (error.name === 'AbortError') {
                this.addMessage('assistant', '_Generation stopped._');
            } else {
                console.error('Chat Error:', error);
                this.addMessage('assistant', `Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        } finally {
            window.streamState.isGenerating = false;
            this.abortController            = null;
            this.toggleLoading(false);
        }
    }

    toggleLoading(show) {
        const sendBtn = document.getElementById('sendBtn');
        const stopBtn = document.getElementById('stopBtn');
        if (show) {
            sendBtn?.classList.add('hidden');
            stopBtn?.classList.remove('hidden');
        } else {
            sendBtn?.classList.remove('hidden');
            stopBtn?.classList.add('hidden');
        }
    }

    saveHistory() {
        window.electronAPI.saveData('chatHistory', window.appData.chatHistory);
    }

    renderRecentChats() {
        if (typeof window.renderHistory === 'function') window.renderHistory();
    }

    _buildSystemHint() {
        return Object.entries(this.options)
            .map(([key, value]) => OPTION_SYSTEM_HINTS[key]?.[value] ?? '')
            .filter(Boolean)
            .join(' ');
    }

    _addToPromptHistory(text) {
        this.promptHistory = [text, ...this.promptHistory.filter(p => p !== text)].slice(0, 20);
        this._persistPromptHistory();
    }

    _persistPromptHistory() {
        try { window.electronAPI?.saveData?.('promptHistory', this.promptHistory); } catch (_) {}
    }

    _loadPromptHistory() {
        try {
            const saved = window.electronAPI?.getData?.('promptHistory');
            if (Array.isArray(saved))
                this.promptHistory = saved;
        }
        catch (_) { }
    }

    _persistOptions() {
        try { window.electronAPI?.saveData?.('chatOptions', this.options); } catch (_) {}
    }
}

export const chatController = new ChatController();
