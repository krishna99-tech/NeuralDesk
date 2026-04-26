/**
 * NeuralDesk Tool Calling UI
 * Real-time orchestrator activity panel — shows planning, tool calls, and results.
 */
export class ToolUI {
    _unsubscribe = null;
    _panel = null;
    constructor() {
        this.init();
    }
    init() {
        this._panel = document.getElementById('toolActivityPanel');
        this._bindEvents();
    }
    _bindEvents() {
        if (!window.electronAPI?.onToolEvent)
            return;
        this._unsubscribe = window.electronAPI.onToolEvent((event) => {
            this.handleEvent(event);
        });
    }
    destroy() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    }
    // ─── Event Router ───────────────────────────────────────────────────────────
    handleEvent(event) {
        switch (event.type) {
            case 'planning': return this._onPlanning(event);
            case 'plan_ready': return this._onPlanReady(event);
            case 'step_start': return this._onStepStart(event);
            case 'step_done': return this._onStepDone(event);
            case 'step_error': return this._onStepError(event);
            case 'step_skip': return this._onStepSkip(event);
            case 'chart_ready': return this._onChartReady(event);
            case 'synthesizing': return this._onSynthesizing(event);
            case 'done': return this._onDone();
        }
    }
    // ─── Panel Control ───────────────────────────────────────────────────────────
    show() {
        if (!this._panel)
            this._panel = document.getElementById('toolActivityPanel');
        if (this._panel) {
            this._panel.classList.add('open');
            const log = document.getElementById('toolActivityLog');
            if (log)
                log.innerHTML = '';
        }
    }
    hide() {
        if (this._panel)
            this._panel.classList.remove('open');
    }
    // ─── Log Helpers ────────────────────────────────────────────────────────────
    _log(html) {
        const log = document.getElementById('toolActivityLog');
        if (!log)
            return;
        log.innerHTML += html;
        log.scrollTop = log.scrollHeight;
    }
    _updateStep(index, html) {
        const el = document.getElementById(`tool-step-${index}`);
        if (el)
            el.outerHTML = html;
    }
    // ─── Event Handlers ─────────────────────────────────────────────────────────
    _onPlanning({ message }) {
        this.show();
        this._log(`
      <div class="ta-section">
        <div class="ta-title">🧠 Planning</div>
        <div class="ta-thinking">
          <div class="ta-dot-loader"><span></span><span></span><span></span></div>
          <span>${message}</span>
        </div>
      </div>
    `);
    }
    _onPlanReady({ steps }) {
        const stepItems = steps.map((s, i) => `<div class="ta-plan-item" id="tool-step-${i}">
        <span class="ta-step-icon">○</span>
        <div class="ta-step-info">
          <span class="ta-step-tool">${s.tool}</span>
          <span class="ta-step-reason">${s.reason}</span>
        </div>
        <div class="ta-step-status ta-pending">PENDING</div>
      </div>`).join('');
        this._log(`
      <div class="ta-section">
        <div class="ta-title">📋 Plan (${steps.length} step${steps.length !== 1 ? 's' : ''})</div>
        <div class="ta-plan-list">${stepItems}</div>
      </div>
    `);
    }
    _onStepStart({ index, tool, reason }) {
        this._updateStep(index, `
      <div class="ta-plan-item running" id="tool-step-${index}">
        <span class="ta-step-icon ta-spin">⚙</span>
        <div class="ta-step-info">
          <span class="ta-step-tool">${tool}</span>
          <span class="ta-step-reason">${reason}</span>
        </div>
        <div class="ta-step-status ta-running">RUNNING</div>
      </div>
    `);
    }
    _onStepDone({ index, tool, summary }) {
        this._updateStep(index, `
      <div class="ta-plan-item done" id="tool-step-${index}">
        <span class="ta-step-icon">✓</span>
        <div class="ta-step-info">
          <span class="ta-step-tool">${tool}</span>
          <span class="ta-step-reason ta-result">${(summary || '').slice(0, 120)}</span>
        </div>
        <div class="ta-step-status ta-done">DONE</div>
      </div>
    `);
    }
    _onStepError({ index, tool, error }) {
        this._updateStep(index, `
      <div class="ta-plan-item error" id="tool-step-${index}">
        <span class="ta-step-icon">✕</span>
        <div class="ta-step-info">
          <span class="ta-step-tool">${tool}</span>
          <span class="ta-step-reason ta-error-text">${error}</span>
        </div>
        <div class="ta-step-status ta-error">ERROR</div>
      </div>
    `);
    }
    _onStepSkip({ reason }) {
        this._log(`<div class="ta-note">↷ Skipping tools: ${reason}</div>`);
    }
    _onChartReady({ data }) {
        this._log(`<div class="ta-note">📊 Chart data ready (${data.length} points) — will render in chat</div>`);
    }
    _onSynthesizing({ message }) {
        this._log(`
      <div class="ta-section">
        <div class="ta-title">✍ Synthesizing</div>
        <div class="ta-thinking">
          <div class="ta-dot-loader"><span></span><span></span><span></span></div>
          <span>${message}</span>
        </div>
      </div>
    `);
    }
    _onDone() {
        this._log(`<div class="ta-done-badge">✅ Complete</div>`);
        setTimeout(() => this.hide(), 8000);
    }
}
export const toolUI = new ToolUI();
