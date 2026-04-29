import { getProviderForAgent } from './agentProvider.js';

export class UIController {
    settingsModal = null;
    toastContainer = null;
    constructor() {
        this.toastContainer = document.getElementById('toastContainer');
        // Explicitly bind methods to ensure they are available as functions
        this.switchPanelTab = this.switchPanelTab.bind(this);
        this.switchSettingsPane = this.switchSettingsPane.bind(this);
        this.closeOnOutside = this.closeOnOutside.bind(this);
    }
    openSettings(pane = 'general') {
        if (!this.settingsModal) {
            this.settingsModal = document.getElementById('settingsModal');
        }
        if (this.settingsModal) {
            this.settingsModal.classList.add('open');
            this.switchSettingsPane(pane);
        } else {
            console.error('Settings modal not found in DOM');
        }
    }
    closeSettings() {
        if (this.settingsModal)
            this.settingsModal.classList.remove('open');
    }
    switchSettingsPane(paneId, el) {
        // Update sidebar active state
        const items = document.querySelectorAll('.msidebar-item');
        items.forEach(item => item.classList.remove('active'));
        if (el) {
            el.classList.add('active');
        }
        else {
            const target = document.querySelector(`.msidebar-item[data-pane="${paneId}"]`);
            if (target)
                target.classList.add('active');
        }
        // Show pane
        const panes = document.querySelectorAll('.settings-pane');
        panes.forEach(p => p.classList.add('hidden'));
        
        const targetPane = document.getElementById(`pane-${paneId}`);
        if (targetPane)
            targetPane.classList.remove('hidden');
        else
            console.error(`Settings pane not found for ID: pane-${paneId}`);
    }
    switchPanelTab(tabId, el = null) {
        const tabs = document.querySelectorAll('.panel-tab');
        tabs.forEach(t => t.classList.remove('active'));
        
        const targetTab = el || document.querySelector(`.panel-tab[data-tab="${tabId}"]`);
        if (targetTab)
            targetTab.classList.add('active');
        
        const contents = document.querySelectorAll('.panel-content');
        contents.forEach(c => c.classList.add('hidden'));
        
        // Convert 'mcp' to 'Mcp'
        const camelTabId = tabId.charAt(0).toUpperCase() + tabId.slice(1);
        const target = document.getElementById(`panel${camelTabId}`);
        if (target)
            target.classList.remove('hidden');
    }
    showToast(message, type = 'info') {
        if (!this.toastContainer)
            return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    renderMarkdown(content, container, opts = {}) {
        const safeContent = this.renderArtifacts(content ?? '');
        if (window.marked && container) {
            container.innerHTML = window.marked.parse(safeContent);
            if (window.Prism && !opts.skipHighlight)
                window.Prism.highlightAllUnder(container);
        }
        else if (container) {
            container.textContent = safeContent;
        }
    }
    renderArtifacts(content) {
        let rendered = this.autoFormatToArtifacts(String(content || ''));
        const chartRe = /```artifact:chart(?:\s+title=(?:"([^"]*)"|'([^']*)'))?[^\r\n]*\r?\n([\s\S]*?)```/gi;
        rendered = rendered.replace(chartRe, (_m, t1, t2, body) => this.buildChartArtifactHtml((t1 || t2 || 'Chart'), body || ''));
        const tableRe = /```artifact:table(?:\s+title=(?:"([^"]*)"|'([^']*)'))?[^\r\n]*\r?\n([\s\S]*?)```/gi;
        rendered = rendered.replace(tableRe, (_m, t1, t2, body) => this.buildTableArtifactHtml((t1 || t2 || 'Table'), body || ''));
        return rendered;
    }
    autoFormatToArtifacts(content) {
        const text = String(content || '');
        if (/```artifact:(chart|table|code|html|svg)/i.test(text)) return text;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 6) return text;
        const hasLambdaTopic = /lambda|anonymous function|map|filter|reduce|python/i.test(text);
        if (!hasLambdaTopic) return text;
        const codeLines = text.split(/\r?\n/).filter(l => /^\s*(from\s+\w+\s+import|def\s+\w+|[A-Za-z_]\w*\s*=|print\(|return\s+|if\s+|for\s+)/.test(l));
        const summaryRows = [
            { Section: "Definition", "Key Point": "Anonymous single-expression function: lambda params: expression" },
            { Section: "Best Use", "Key Point": "Short callbacks, sorting keys, simple transformations" },
            { Section: "Limits", "Key Point": "Single expression only; avoid for complex logic" }
        ];
        const tableArtifact = "```artifact:table title=\"Quick Summary\"\n" +
            JSON.stringify({ columns: ["Section", "Key Point"], rows: summaryRows }, null, 2) +
            "\n```";
        const codeArtifact = codeLines.length
            ? "\n\n```artifact:code title=\"Extracted Example Code\"\n" + codeLines.join("\n") + "\n```"
            : "";
        const shortIntro = lines.slice(0, 3).join(" ");
        return `${shortIntro}\n\n${tableArtifact}${codeArtifact}`;
    }
    cleanArtifactJsonBody(body) {
        let text = String(body || '').trim();
        if (/^json\s*$/i.test(text.split(/\r?\n/, 1)[0])) {
            text = text.split(/\r?\n/).slice(1).join('\n').trim();
        }
        return text;
    }
    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    toPoints(raw) {
        return (Array.isArray(raw) ? raw : [])
            .map((item, i) => {
            if (typeof item === 'number')
                return { x: i + 1, y: item };
            if (item && typeof item === 'object') {
                const y = Number(item.y ?? item.value ?? item.count ?? item.temp ?? item.temperature ?? item.v);
                const x = item.x ?? item.label ?? item.time ?? item.timestamp ?? (i + 1);
                if (Number.isFinite(y))
                    return { x, y };
            }
            return null;
        })
            .filter(Boolean);
    }
    buildChartArtifactHtml(title, body) {
        let parsed;
        try {
            parsed = JSON.parse(this.cleanArtifactJsonBody(body));
        }
        catch {
            return `<div class="artifact-card artifact-error">Invalid chart artifact JSON.</div>`;
        }
        const palette = ["#5ec2ff", "#34d399", "#f59e0b", "#f87171", "#a78bfa", "#22d3ee"];
        let series = [];
        if (Array.isArray(parsed?.series)) {
            series = parsed.series
                .map((s, i) => ({
                name: String(s?.name || `Series ${i + 1}`),
                color: palette[i % palette.length],
                points: this.toPoints(s?.data)
            }))
                .filter(s => s.points.length > 0);
        }
        if (!series.length) {
            const raw = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : []);
            const pts = this.toPoints(raw);
            if (pts.length) {
                series = [{ name: "Series 1", color: palette[0], points: pts }];
            }
        }
        if (!series.length)
            return `<div class="artifact-card artifact-error">No plottable points in chart artifact.</div>`;
        const ys = series.flatMap(s => s.points.map(p => p.y));
        const min = Math.min(...ys);
        const max = Math.max(...ys);
        const avg = ys.reduce((a, b) => a + b, 0) / ys.length;
        const w = 560, h = 180, pad = 20;
        const dy = Math.max(1, max - min);
        const polylines = series.map((s) => {
            const dx = Math.max(1, s.points.length - 1);
            const poly = s.points.map((p, i) => {
                const x = pad + (i / dx) * (w - pad * 2);
                const y = h - pad - ((p.y - min) / dy) * (h - pad * 2);
                return `${x},${y}`;
            }).join(' ');
            return `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" points="${poly}"></polyline>`;
        }).join('');
        const bars = series[0].points.slice(0, 48).map(p => {
            const bh = Math.max(4, Math.round(((p.y - min) / dy) * 60));
            const label = String(p.x).replace(/"/g, '&quot;');
            return `<div class="chart-bar" style="height:${bh}px" title="${label}: ${p.y}"></div>`;
        }).join('');
        const legend = series.map((s) => `<span class="artifact-legend-item"><i style="background:${s.color}"></i>${s.name}</span>`).join('');
        return `
<div class="artifact-card">
  <div class="artifact-head">${title}</div>
  <div class="artifact-legend">${legend}</div>
  <svg class="artifact-line" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    ${polylines}
  </svg>
  <div class="mini-chart">${bars}</div>
  <div class="artifact-stats">min ${min.toFixed(2)} | max ${max.toFixed(2)} | avg ${avg.toFixed(2)} | n ${ys.length}</div>
</div>`;
    }
    buildTableArtifactHtml(title, body) {
        let parsed;
        try {
            parsed = JSON.parse(this.cleanArtifactJsonBody(body));
        }
        catch {
            return `<div class="artifact-card artifact-error">Invalid table artifact JSON.</div>`;
        }
        const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.rows) ? parsed.rows : []);
        if (!rows.length || typeof rows[0] !== 'object') {
            return `<div class="artifact-card artifact-error">No tabular rows found in table artifact.</div>`;
        }
        const columns = Array.isArray(parsed?.columns) && parsed.columns.length
            ? parsed.columns.map(c => this.escapeHtml(c))
            : Object.keys(rows[0]);
        const safeCols = columns.map(c => this.escapeHtml(c));
        const head = safeCols.map(c => `<th>${c}</th>`).join('');
        const bodyRows = rows.slice(0, 100).map(r => {
            const tds = safeCols.map((c, i) => {
                const rawKey = (Array.isArray(parsed?.columns) && parsed.columns[i] != null) ? String(parsed.columns[i]) : c;
                return `<td>${this.escapeHtml(r?.[rawKey] ?? '')}</td>`;
            }).join('');
            return `<tr>${tds}</tr>`;
        }).join('');
        return `
<div class="artifact-card">
  <div class="artifact-head">${title}</div>
  <div class="artifact-table-wrap">
    <table class="artifact-table">
      <thead><tr>${head}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>
</div>`;
    }

    autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }
    toggleRightPanel() {
        const panel = document.getElementById('rightPanel');
        const btn = document.getElementById('panelToggleBtn');
        if (panel) {
            panel.classList.toggle('collapsed');
            if (btn)
                btn.classList.toggle('active');
        }
    }
    async checkConnection() {
        const badge = document.getElementById('connectionBadge');
        if (!badge)
            return;
        const agentSelect = document.getElementById('agentSelect');
        const agentName = agentSelect?.value || 'auto';
        const provider = getProviderForAgent(agentName, window.appData.settings?.ai?.defaultProvider || 'openai');
        const keys = window.appData.settings?.apiKeys || {};
        const keyMap = {
            openai: keys.openai,
            claude: keys.anthropic,
            gemini: keys.gemini,
            deepseek: keys.deepseek,
            ollama: true,
            aipipe: keys.aipipe ? true : false
        };
        const hasKey = keyMap[provider];
        if (hasKey) {
            badge.textContent = 'Connected';
            badge.className = 'connection-badge connected';
        }
        else {
            badge.textContent = 'Disconnected';
            badge.className = 'connection-badge offline';
        }
    }
    updateIncognitoIndicator(active) {
        const el = document.getElementById('incognitoIndicator');
        if (el) {
            if (active) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    }
    setArtifactView(view) {
        const tabs = document.querySelectorAll('.art-tab');
        tabs.forEach(t => t.classList.remove('active'));
        if (view === 'preview') {
            tabs[0]?.classList.add('active');
            // Logic to show preview
        }
        else {
            tabs[1]?.classList.add('active');
            // Logic to show code
        }
    }
    closeArtifact() {
        const panel = document.getElementById('artifactPanel');
        if (panel)
            panel.classList.remove('visible');
    }
    closeOnOutside(event, modalId, closeFn) {
        if (event.target.id === modalId) {
            closeFn();
        }
    }
    handleKey(e, sendMessage) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }
}
export const uiController = new UIController();
