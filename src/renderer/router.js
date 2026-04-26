export class Router {
    currentView = 'chat';
    constructor() {
        this.init();
    }
    init() {
        console.log('Router initialized');
        // Set initial view based on current state or default
        this.switchView('chat');
    }
    switchView(view, element) {
        console.log(`Switching view to: ${view}`);
        this.currentView = view;
        // Hide all panels
        const panels = ['chatPanel', 'agentBuilderPanel', 'vizPanel'];
        panels.forEach(id => {
            const el = document.getElementById(id);
            if (el)
                el.style.display = 'none';
        });
        // Show selected panel
        const selectedId = this.getPanelId(view);
        const selectedEl = document.getElementById(selectedId);
        if (selectedEl) {
            selectedEl.style.display = (view === 'chat' || view === 'viz') ? 'flex' : 'flex';
            if (view === 'agents')
                selectedEl.classList.add('visible');
        }
        // Update sidebar UI
        document.querySelectorAll('.nav-item').forEach(nav => {
            nav.classList.remove('active');
        });
        if (element) {
            element.classList.add('active');
        }
        else {
            const navItem = document.querySelector(`.nav-item[data-view="${view}"]`);
            if (navItem)
                navItem.classList.add('active');
        }
    }
    getPanelId(view) {
        switch (view) {
            case 'chat': return 'chatPanel';
            case 'agents': return 'agentBuilderPanel';
            case 'viz': return 'vizPanel';
            default: return 'chatPanel';
        }
    }
    getCurrentView() {
        return this.currentView;
    }
}
// Global instance
export const router = new Router();
