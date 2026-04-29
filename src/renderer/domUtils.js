export function collectActiveTools() {
    const normalizeToolName = (value) => String(value || '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, '_')
        .replace(/^_+|_+$/g, '');
    return Array.from(document.querySelectorAll('.tool-btn.active, .btn-tool.active, .toolbar-btn.active, [data-tool].active'))
        .map((btn) => normalizeToolName(btn.getAttribute('data-tool') || btn.textContent?.trim()))
        .filter(Boolean);
}

export function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof value === 'undefined' || value === null) return;
    el.value = String(value);
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function maskSecret(secret) {
    const raw = String(secret || '');
    if (!raw) return 'Not set';
    if (raw.length <= 8) return `${raw.slice(0, 2)}...${raw.slice(-1)}`;
    return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

function resolvePath(pathExpr, root = window) {
    return pathExpr.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), root);
}

function splitArgs(argsRaw) {
    const args = [];
    let current = '';
    let quote = null;
    let depth = 0;
    for (let i = 0; i < argsRaw.length; i++) {
        const ch = argsRaw[i];
        if (quote) {
            current += ch;
            if (ch === quote && argsRaw[i - 1] !== '\\') quote = null;
            continue;
        }
        if (ch === '\'' || ch === '"') {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === '(') {
            depth++;
            current += ch;
            continue;
        }
        if (ch === ')') {
            depth = Math.max(0, depth - 1);
            current += ch;
            continue;
        }
        if (ch === ',' && depth === 0) {
            args.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) args.push(current.trim());
    return args;
}

function parseArg(token, element, event) {
    if (token === 'this') return element;
    if (token === 'event') return event;
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null') return null;
    if (token === 'undefined') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
    const quoted = token.match(/^(['"])(.*)\1$/);
    if (quoted) return quoted[2];
    const resolved = resolvePath(token);
    return resolved !== undefined ? resolved : token;
}

function executeDataExpression(expr, element, event) {
    const trimmed = expr.trim();
    if (!trimmed) return;

    const tempMatch = trimmed.match(/^document\.getElementById\('([^']+)'\)\.textContent=this\.value$/);
    if (tempMatch) {
        const target = document.getElementById(tempMatch[1]);
        if (target && element instanceof HTMLInputElement) target.textContent = element.value;
        return;
    }

    const callMatch = trimmed.match(/^([A-Za-z_$][\w$.]*)\((.*)\)$/);
    if (!callMatch) {
        const fnNoArgs = resolvePath(trimmed);
        if (typeof fnNoArgs === 'function') fnNoArgs();
        return;
    }
    const fn = resolvePath(callMatch[1]);
    if (typeof fn !== 'function') {
        console.warn('Missing handler for expression:', trimmed);
        return;
    }
    const args = splitArgs(callMatch[2]).map(arg => parseArg(arg, element, event));
    fn(...args);
}

function migrateInlineEventHandlers() {
    const mappings = [
        ['onclick', 'data-onclick'],
        ['onchange', 'data-onchange'],
        ['oninput', 'data-oninput'],
        ['onkeydown', 'data-onkeydown'],
    ];
    mappings.forEach(([inlineAttr, dataAttr]) => {
        document.querySelectorAll(`[${inlineAttr}]`).forEach((el) => {
            if (el.hasAttribute(dataAttr)) return;
            const expr = el.getAttribute(inlineAttr);
            if (!expr) return;
            el.setAttribute(dataAttr, expr);
            el.removeAttribute(inlineAttr);
        });
    });
}

export function bindDataDrivenHandlers() {
    migrateInlineEventHandlers();
    const observer = new MutationObserver(() => {
        migrateInlineEventHandlers();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const delegate = (attr, eventName) => {
        document.addEventListener(eventName, (event) => {
            const rawTarget = event.target;
            const target = rawTarget instanceof Element
                ? rawTarget
                : rawTarget instanceof Node
                    ? rawTarget.parentElement
                    : null;
            const el = target?.closest(`[${attr}]`);
            if (!el) return;
            const expr = el.getAttribute(attr);
            if (!expr) return;
            executeDataExpression(expr, el, event);
        });
    };
    delegate('data-onclick', 'click');
    delegate('data-onchange', 'change');
    delegate('data-oninput', 'input');
    delegate('data-onkeydown', 'keydown');
}
