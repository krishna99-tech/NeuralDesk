/**
 * NeuralDesk Premium Response Renderer
 * Handles markdown, syntax highlighting, artifact extraction, and data visualization.
 */

window.renderer = {
  /**
   * Main entry point to render AI response text
   */
  render: function(text, container) {
    if (!container) return;
    
    // 1. Process Artifacts (extract code/data blocks for the side panel)
    const processedText = this.extractArtifacts(text);
    
    // 2. Render Markdown
    const html = marked.parse(processedText);
    container.innerHTML = html;
    
    // 3. Apply Syntax Highlighting
    if (window.Prism) {
      Prism.highlightAllUnder(container);
    }
    
    // 4. Initialize dynamic components (e.g. charts if data was detected)
    this.initDynamicComponents(container);
  },

  /**
   * Detects blocks like ```chart or ```json and prepares them for specialized rendering
   */
  extractArtifacts: function(text) {
    // Artifact detection logic (e.g. looking for specific blocks)
    // For now, we'll look for blocks that should go into the Side Panel
    const artifactRegex = /```artifact:(\w+)\s+title="([^"]+)"\n([\s\S]+?)```/g;
    
    return text.replace(artifactRegex, (match, type, title, content) => {
      // Create a "View Artifact" button in the chat
      const id = 'art_' + Math.random().toString(36).substr(2, 9);
      this.registerArtifact(id, { type, title, content });
      
      return `
        <div class="artifact-preview" onclick="openArtifact('${id}')">
          <div class="ap-icon">${this.getIconForType(type)}</div>
          <div class="ap-info">
            <div class="ap-title">${title}</div>
            <div class="ap-meta">Click to view artifact</div>
          </div>
          <div class="ap-action">↗</div>
        </div>
      `;
    });
  },

  artifacts: {},
  registerArtifact: function(id, data) {
    this.artifacts[id] = data;
  },

  getIconForType: function(type) {
    const icons = {
      code: '💻',
      data: '📊',
      react: '⚛️',
      html: '🌐',
      chart: '📈'
    };
    return icons[type] || '📄';
  },

  /**
   * Render charts if JSON data is present in a specific format
   */
  initDynamicComponents: function(container) {
    const charts = container.querySelectorAll('pre code.language-chart');
    charts.forEach(el => {
      try {
        const data = JSON.parse(el.textContent);
        const canvas = document.createElement('canvas');
        canvas.style.maxHeight = '300px';
        el.parentElement.replaceWith(canvas);
        
        new Chart(canvas, {
          type: data.type || 'bar',
          data: {
            labels: data.labels || [],
            datasets: [{
              label: data.label || 'Data',
              data: data.values || [],
              backgroundColor: 'rgba(124, 106, 255, 0.5)',
              borderColor: '#7c6aff',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
          }
        });
      } catch (e) {
        console.error('Chart rendering failed:', e);
      }
    });

    // Handle JSON Data Tables
    const jsonBlocks = container.querySelectorAll('pre code.language-json');
    jsonBlocks.forEach(el => {
      try {
        const data = JSON.parse(el.textContent);
        if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
          const table = document.createElement('table');
          table.className = 'data-table';
          
          // Header
          const keys = Object.keys(data[0]);
          const thead = document.createElement('thead');
          const headerRow = document.createElement('tr');
          keys.forEach(k => {
            const th = document.createElement('th');
            th.textContent = k;
            headerRow.appendChild(th);
          });
          thead.appendChild(headerRow);
          table.appendChild(thead);
          
          // Body
          const tbody = document.createElement('tbody');
          data.slice(0, 10).forEach(row => { // Limit to 10 for preview
            const tr = document.createElement('tr');
            keys.forEach(k => {
              const td = document.createElement('td');
              td.textContent = typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k];
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          });
          table.appendChild(tbody);
          
          const wrapper = document.createElement('div');
          wrapper.className = 'table-wrapper';
          wrapper.style.overflowX = 'auto';
          wrapper.appendChild(table);
          
          const label = document.createElement('div');
          label.className = 'text-xs text-muted mb-1';
          label.textContent = 'Auto-formatted Table (JSON):';
          
          el.parentElement.replaceWith(label, wrapper);
        }
      } catch (e) {}
    });
  }
};

/**
 * Artifact Panel Controls
 */
let currentArtifactId = null;
let currentArtifactView = 'preview';

function openArtifact(id) {
  currentArtifactId = id;
  const art = window.renderer.artifacts[id];
  if (!art) return;

  const panel = document.getElementById('artifactPanel');
  const title = document.getElementById('artifactTitle');
  const icon = document.getElementById('artifactIcon');

  title.textContent = art.title;
  icon.textContent = window.renderer.getIconForType(art.type);
  
  renderArtifactContent();
  panel.classList.add('open');
}

function setArtifactView(mode) {
  currentArtifactView = mode;
  document.querySelectorAll('.art-tab').forEach(t => {
    t.classList.toggle('active', t.textContent.toLowerCase() === mode);
  });
  renderArtifactContent();
}

function renderArtifactContent() {
  if (!currentArtifactId) return;
  const art = window.renderer.artifacts[currentArtifactId];
  const content = document.getElementById('artifactContent');
  
  if (currentArtifactView === 'code') {
    content.innerHTML = `<div class="artifact-code-container"><pre><code class="language-javascript">${escapeHtml(art.content)}</code></pre></div>`;
    if (window.Prism) Prism.highlightAllUnder(content);
  } else {
    // PREVIEW MODE
    if (art.type === 'html' || art.type === 'react') {
      const iframe = document.createElement('iframe');
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.style.background = 'white';
      content.innerHTML = '';
      content.appendChild(iframe);
      
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(art.content);
      doc.close();
    } else if (art.type === 'svg') {
      content.innerHTML = `<div class="artifact-render-container flex-center" style="background:#f8f9fa">${art.content}</div>`;
    } else if (art.type === 'chart') {
      content.innerHTML = '<div class="artifact-render-container"><canvas id="artCanvas"></canvas></div>';
      const canvas = document.getElementById('artCanvas');
      const data = JSON.parse(art.content);
      new Chart(canvas, {
        type: data.type || 'line',
        data: {
          labels: data.labels,
          datasets: [{
            label: data.label,
            data: data.values,
            borderColor: '#7c6aff',
            backgroundColor: 'rgba(124, 106, 255, 0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      });
    } else {
      content.innerHTML = `<div class="artifact-render-container">${marked.parse(art.content)}</div>`;
    }
  }
}

function closeArtifact() {
  document.getElementById('artifactPanel').classList.remove('open');
  currentArtifactId = null;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
