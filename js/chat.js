/**
 * NeuralDesk Chat & Messaging
 * Handles conversation flow, agent invocation, and persistence.
 */

function sendMessage() {
  if (window.streamState.isGenerating) return;
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  // Initialize a new chat session if none active
  if (!window.state.currentChatId) {
    const newId = 'c_' + Date.now();
    const newChat = {
      id: newId,
      title: text.substring(0, 30) + (text.length > 30 ? '...' : ''),
      timestamp: new Date().toISOString(),
      messages: []
    };
    window.appData.chatHistory.unshift(newChat);
    window.state.currentChatId = newId;
    renderRecentChats();
  }

  addMessage('user', text);
  window.state.messages.push({ role: 'user', content: text });
  
  // Update history in memory
  const chat = window.appData.chatHistory.find(c => c.id === window.state.currentChatId);
  if (chat) {
    chat.messages = window.state.messages;
    chat.timestamp = new Date().toISOString();
    saveChatHistory();
  }

  input.value = '';
  input.style.height = 'auto';
  requestAgentResponse();
}

/**
 * Add a message bubble to the UI
 */
function addMessage(role, content, opts = {}) {
  const screen = document.getElementById('welcomeScreen');
  if (screen) screen.remove();
  
  const container = document.getElementById('chatMessages');
  const isUser = role === 'user';
  const userName = window.state.user?.username || 'Guest';
  
  const row = document.createElement('div');
  row.className = `message-row ${isUser ? 'user' : ''}`;
  
  const avatarEl = document.createElement('div');
  avatarEl.className = `msg-avatar ${isUser ? 'user-av' : 'ai'}`;
  avatarEl.textContent = isUser ? userName.charAt(0).toUpperCase() : '✦';

  const body = document.createElement('div');
  body.className = 'msg-body';

  if (!isUser) {
    const sender = document.createElement('div');
    sender.className = 'msg-sender';
    const agent = document.getElementById('agentSelect')?.value || 'auto';
    const modelTag = (opts.model || agent).toUpperCase();
    sender.innerHTML = `<span>NeuralDesk</span><span class="model-tag">${modelTag}</span>`;
    body.appendChild(sender);
  }

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${isUser ? 'user-msg' : 'ai'}`;
  if (opts.id) bubble.id = opts.id + '_bubble';

  const msgContent = document.createElement('div');
  if (opts.id) msgContent.id = opts.id;
  if (opts.streaming) msgContent.className = 'streaming-cursor';
  
  if (window.renderer) {
    window.renderer.render(content, msgContent);
  } else {
    msgContent.textContent = content;
  }
  
  bubble.appendChild(msgContent);

  if (opts.mcpResults && opts.mcpResults.length > 0) {
    renderMcpVisualization(bubble, opts.mcpResults);
  }

  body.appendChild(bubble);

  if (isUser) { row.appendChild(body); row.appendChild(avatarEl); }
  else { row.appendChild(avatarEl); row.appendChild(body); }

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;

  return msgContent;
}

/**
 * Render MCP tool outputs as interactive cards and tables
 */
function renderMcpVisualization(container, results) {
  const wrapper = document.createElement('div');
  wrapper.className = 'mcp-viz-container';
  wrapper.style.marginTop = '12px';
  wrapper.style.borderTop = '1px solid rgba(255,255,255,0.1)';
  wrapper.style.paddingTop = '12px';

  const title = document.createElement('div');
  title.className = 'text-xs font-bold text-muted uppercase mb-2';
  title.style.letterSpacing = '0.5px';
  title.textContent = 'MCP Tool Output';
  wrapper.appendChild(title);

  results.forEach(res => {
    const card = document.createElement('div');
    card.style.background = 'rgba(255,255,255,0.03)';
    card.style.borderRadius = '8px';
    card.style.padding = '12px';
    card.style.marginBottom = '10px';
    card.style.border = '1px solid rgba(255,255,255,0.05)';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '8px';

    const name = document.createElement('span');
    name.style.fontSize = '12px';
    name.style.fontWeight = 'bold';
    name.textContent = res.name;
    
    const status = document.createElement('span');
    status.className = `chip ${res.ok ? 'chip-purple' : 'chip-red'}`;
    status.style.fontSize = '9px';
    status.textContent = res.ok ? 'SUCCESS' : 'FAILED';

    header.appendChild(name);
    header.appendChild(status);
    card.appendChild(header);

    let parsedData = null;
    try {
      if (res.stdout && (res.stdout.trim().startsWith('{') || res.stdout.trim().startsWith('['))) {
        parsedData = JSON.parse(res.stdout);
      }
    } catch (e) {}

    if (parsedData) {
      card.appendChild(renderStructuredData(parsedData));
    } else if (res.stdout) {
      card.appendChild(renderUnstructuredData(res.stdout));
    }

    if (res.stderr) {
      const err = document.createElement('div');
      err.style.fontSize = '11px';
      err.style.color = '#ff6b6b';
      err.style.marginTop = '6px';
      err.style.padding = '6px';
      err.style.background = 'rgba(255,107,107,0.05)';
      err.style.borderRadius = '4px';
      err.textContent = res.stderr;
      card.appendChild(err);
    }

    wrapper.appendChild(card);
  });

  container.appendChild(wrapper);
}

/**
 * Detects CSV/SQL and renders specialized components or fallback pre
 */
function renderUnstructuredData(text) {
  const trimmed = text.trim();
  if (!trimmed) return document.createElement('div');

  // 1. Detect CSV (multiple lines, consistent delimiters)
  const lines = trimmed.split(/\r?\n/).filter(l => l.trim());
  if (lines.length > 1) {
    const firstLine = lines[0];
    const delimiter = firstLine.includes(',') ? ',' : (firstLine.includes('\t') ? '\t' : (firstLine.includes(';') ? ';' : null));
    
    if (delimiter) {
      const headerCols = firstLine.split(delimiter);
      if (headerCols.length > 1) {
        // Verify consistency in first few rows
        const sample = lines.slice(1, 4);
        const isConsistent = sample.length > 0 && sample.every(l => l.split(delimiter).length === headerCols.length);
        
        if (isConsistent) {
          const tableData = lines.slice(1).map(line => {
            const cols = line.split(delimiter);
            const row = {};
            headerCols.forEach((h, i) => {
              row[h.trim() || `col_${i}`] = cols[i]?.trim() || '';
            });
            return row;
          });
          return renderStructuredData(tableData);
        }
      }
    }
  }

  // 2. Detect SQL (Common keywords)
  const sqlPattern = /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|DESCRIBE|EXEC|WITH|JOIN)\b/i;
  if (sqlPattern.test(trimmed)) {
    const pre = document.createElement('pre');
    pre.style.fontSize = '11px';
    pre.style.background = 'rgba(0,0,0,0.2)';
    pre.style.padding = '10px';
    pre.style.borderRadius = '4px';
    pre.style.color = '#fff';
    pre.style.borderLeft = '3px solid var(--accent)';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.overflowX = 'auto';
    
    // Very basic syntax highlighting
    const html = trimmed
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\b(SELECT|FROM|WHERE|AND|OR|IN|VALUES|INSERT|INTO|UPDATE|SET|DELETE|CREATE|TABLE|DATABASE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|ORDER|BY|GROUP|LIMIT|OFFSET|AS|WITH|UNION|ALL|DESC|ASC|DISTINCT)\b/gi, 
        '<span style="color:#ff79c6;font-weight:bold">$1</span>')
      .replace(/(--.*$)/gm, '<span style="color:#6272a4">$1</span>')
      .replace(/'([^']*)'/g, '<span style="color:#f1fa8c">\'$1\'</span>');
    
    pre.innerHTML = html;
    return pre;
  }

  // Default fallback
  const pre = document.createElement('pre');
  pre.style.fontSize = '11px';
  pre.style.opacity = '0.7';
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.maxHeight = '150px';
  pre.style.overflowY = 'auto';
  pre.style.margin = '0';
  pre.textContent = text;
  return pre;
}

function renderStructuredData(data) {
  const div = document.createElement('div');
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
    // Check if data is plottable (contains numeric values)
    const keys = Object.keys(data[0]);
    const numericKeys = keys.filter(k => typeof data[0][k] === 'number' || (!isNaN(parseFloat(data[0][k])) && isFinite(data[0][k])));
    const isPlottable = numericKeys.length > 0 && data.length > 1;

    const tableView = document.createElement('div');
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.fontSize = '10px';
    table.style.borderCollapse = 'collapse';
    const trH = document.createElement('tr');
    keys.forEach(k => {
      const th = document.createElement('th');
      th.style.textAlign = 'left';
      th.style.padding = '4px';
      th.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
      th.textContent = k;
      trH.appendChild(th);
    });
    table.appendChild(trH);
    data.slice(0, 5).forEach(row => {
      const tr = document.createElement('tr');
      keys.forEach(k => {
        const td = document.createElement('td');
        td.style.padding = '4px';
        td.textContent = String(row[k]).substring(0, 50);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    tableView.appendChild(table);

    if (isPlottable) {
      const toggleContainer = document.createElement('div');
      toggleContainer.style.display = 'flex';
      toggleContainer.style.gap = '8px';
      toggleContainer.style.marginBottom = '12px';

      const createBtn = (label, active = false) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.fontSize = '10px';
        btn.style.padding = '4px 10px';
        btn.style.borderRadius = '4px';
        btn.style.border = active ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)';
        btn.style.background = active ? 'var(--accent)' : 'rgba(255,255,255,0.05)';
        btn.style.color = '#fff';
        btn.style.cursor = 'pointer';
        btn.style.transition = 'all 0.2s';
        return btn;
      };

      const chartBtn = createBtn('Chart View', true);
      const tableBtn = createBtn('Table View', false);

      const chartView = document.createElement('div');
      chartView.style.margin = '15px 0';
      chartView.style.padding = '15px';
      chartView.style.background = 'rgba(0,0,0,0.2)';
      chartView.style.borderRadius = '8px';
      chartView.style.border = '1px solid rgba(255,255,255,0.1)';

      const chartTitle = document.createElement('div');
      chartTitle.className = 'text-xs font-bold mb-3 uppercase opacity-60';
      chartTitle.textContent = `Data Visualization: ${numericKeys[0]}`;
      chartView.appendChild(chartTitle);

      const barWrapper = document.createElement('div');
      barWrapper.style.display = 'flex';
      barWrapper.style.alignItems = 'flex-end';
      barWrapper.style.gap = '4px';
      barWrapper.style.height = '120px';
      barWrapper.style.paddingBottom = '20px';

      const values = data.map(d => parseFloat(d[numericKeys[0]])).filter(v => !isNaN(v));
      const max = Math.max(...values, 1);

      data.slice(0, 20).forEach((row, i) => {
        const val = parseFloat(row[numericKeys[0]]);
        if (isNaN(val)) return;
        const barGroup = document.createElement('div');
        barGroup.style.flex = '1';
        barGroup.style.display = 'flex';
        barGroup.style.flexDirection = 'column';
        barGroup.style.alignItems = 'center';
        barGroup.style.height = '100%';
        barGroup.style.justifyContent = 'flex-end';
        const bar = document.createElement('div');
        const heightPct = (val / max) * 100;
        bar.style.width = '100%';
        bar.style.height = `${heightPct}%`;
        bar.style.background = 'var(--accent)';
        bar.style.borderRadius = '2px 2px 0 0';
        bar.style.minHeight = '2px';
        bar.style.transition = 'height 0.3s ease';
        bar.title = `${numericKeys[0]}: ${val}`;
        const label = document.createElement('div');
        label.style.fontSize = '8px';
        label.style.marginTop = '4px';
        label.style.opacity = '0.5';
        label.style.width = '100%';
        label.style.textAlign = 'center';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.whiteSpace = 'nowrap';
        const labelKey = keys.find(k => ['name', 'id', 'timestamp', 'created_at', 'label', 'time'].includes(k.toLowerCase())) || keys[0];
        label.textContent = row[labelKey];
        barGroup.appendChild(bar);
        barGroup.appendChild(label);
        barWrapper.appendChild(barGroup);
      });

      chartView.appendChild(barWrapper);
      tableView.style.display = 'none';

      chartBtn.onclick = () => {
        chartView.style.display = 'block';
        tableView.style.display = 'none';
        chartBtn.style.background = 'var(--accent)';
        chartBtn.style.border = '1px solid var(--accent)';
        tableBtn.style.background = 'rgba(255,255,255,0.05)';
        tableBtn.style.border = '1px solid rgba(255,255,255,0.1)';
      };

      tableBtn.onclick = () => {
        chartView.style.display = 'none';
        tableView.style.display = 'block';
        tableBtn.style.background = 'var(--accent)';
        tableBtn.style.border = '1px solid var(--accent)';
        chartBtn.style.background = 'rgba(255,255,255,0.05)';
        chartBtn.style.border = '1px solid rgba(255,255,255,0.1)';
      };

      toggleContainer.appendChild(chartBtn);
      toggleContainer.appendChild(tableBtn);
      div.appendChild(toggleContainer);
      div.appendChild(chartView);
    }
    div.appendChild(tableView);
  } else {
    const pre = document.createElement('pre');
    pre.style.fontSize = '10px';
    pre.style.margin = '0';
    pre.textContent = JSON.stringify(data, null, 2);
    div.appendChild(pre);
  }
  return div;
}

/**
 * Invoke the Backend Agent Layer
 */
async function requestAgentResponse() {
  const id = 'm_' + Date.now();
  const el = addMessage('ai', '', { id, streaming: true });
  const requestId = 'r_' + Date.now();
  const chatIdAtRequest = window.state.currentChatId;
  window.streamState.activeRequestId = requestId;
  const isStale = () =>
    window.streamState.activeRequestId !== requestId ||
    window.state.currentChatId !== chatIdAtRequest;
  
  const agent = document.getElementById('agentSelect')?.value || 'auto';
  const modelType = document.getElementById('modelTypeSelect')?.value || 'fast';
  const input = window.state.messages[window.state.messages.length - 1]?.content || '';
  const tools = getSelectedTools();

  try {
    setGenerating(true);
    
    // Call the intelligent Agent Router via SQLite-integrated IPC
    const response = await window.api.askAI({ 
      input, 
      agent, 
      modelType,
      tools,
      chatId: window.state.currentChatId  // Pass chat ID for session continuity
    });

    if (isStale()) {
      const row = el.closest('.message-row');
      if (row) row.remove();
      return;
    }

    if (typeof response === 'object' && response !== null) {
      el.textContent = response.text;
      // Update the bubble with the real model name
      const senderTag = el.closest('.msg-body')?.querySelector('.model-tag');
      if (senderTag && response.model) {
        senderTag.textContent = response.model.toUpperCase();
      }

      if (response.mcpResults && response.mcpResults.length > 0) {
        renderMcpVisualization(el.parentElement, response.mcpResults);
      }

      // Render chart data if returned by data service (predict/plot intents)
      if (response.chartData && Array.isArray(response.chartData) && response.chartData.length > 0) {
        renderInlineChart(el.parentElement.parentElement, response.chartData, response.intent);
      }

      window.state.messages.push({ 
        role: 'assistant', 
        content: response.text, 
        mcpResults: response.mcpResults,
        model: response.model
      });
    } else {
      el.textContent = response;
      window.state.messages.push({ role: 'assistant', content: response });
    }

    el.classList.remove('streaming-cursor');

    // Finalize chat persistence
    const chat = window.appData.chatHistory.find(c => c.id === window.state.currentChatId);
    if (chat) { 
      chat.messages = window.state.messages; 
      saveChatHistory(); 
    }
  } catch (error) {
    if (isStale()) return;
    console.error('Agent Request failed:', error);
    showToast(`Agent Error: ${error.message}`, 'error');
    el.textContent = "I'm sorry, the agent encountered an error processing your request.";
    el.classList.remove('streaming-cursor');
  } finally {
    if (window.streamState.activeRequestId === requestId) {
      window.streamState.activeRequestId = null;
      setGenerating(false);
    }
  }
}

function setGenerating(isGenerating) {
  window.streamState.isGenerating = isGenerating;
  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) sendBtn.disabled = isGenerating;
}

async function saveChatHistory() {
  await window.db.saveChats(window.appData.chatHistory);
}

function onModelChange() {
  updatePrimaryChatTabLabel();
}

function updatePrimaryChatTabLabel() {
  const agent = document.getElementById('agentSelect');
  const tabLabel = document.getElementById('primaryChatTabLabel');
  if (!agent || !tabLabel) return;
  tabLabel.textContent = `Chat — ${agent.options[agent.selectedIndex].text}`;
}

function loadChatById(id) {
  window.state.currentChatId = id;
  const chat = window.appData.chatHistory.find(c => c.id === id);
  if (!chat) return;
  
  window.state.messages = chat.messages || [];
  renderMessages();
  renderRecentChats();
}

async function deleteChatById(id) {
  const index = window.appData.chatHistory.findIndex(c => c.id === id);
  if (index === -1) return;

  const target = window.appData.chatHistory[index];
  const label = target?.title || 'this chat';
  const confirmed = window.confirm(`Delete "${label}"? This cannot be undone.`);
  if (!confirmed) return;

  window.appData.chatHistory.splice(index, 1);
  const deletedActiveChat = window.state.currentChatId === id;

  if (deletedActiveChat) {
    if (window.streamState.isGenerating) {
      window.streamState.activeRequestId = null;
      setGenerating(false);
      const activeStream = document.querySelector('.streaming-cursor');
      if (activeStream) {
        const row = activeStream.closest('.message-row');
        if (row) row.remove();
      }
    }

    const nextChat = window.appData.chatHistory[0];
    if (nextChat) {
      loadChatById(nextChat.id);
    } else {
      window.state.currentChatId = null;
      window.state.messages = [];
      await saveChatHistory();
      location.reload();
      return;
    }
  } else {
    renderRecentChats();
  }

  await saveChatHistory();
  showToast('Chat deleted', 'success');
}

function cancelGeneration() {
  if (!window.streamState.isGenerating) return;

  window.streamState.activeRequestId = null;
  setGenerating(false);

  const activeStream = document.querySelector('.streaming-cursor');
  if (activeStream) {
    activeStream.textContent = 'Generation stopped.';
    activeStream.classList.remove('streaming-cursor');
  }
  showToast('Generation cancelled', 'success');
}

function renderMessages() {
  const container = document.getElementById('chatMessages');
  container.innerHTML = '';
  window.state.messages.forEach(msg => {
    addMessage(msg.role, msg.content, { 
      mcpResults: msg.mcpResults,
      model: msg.model 
    });
  });
}

function newChat() {
  window.state.messages = [];
  window.state.currentChatId = null;
  location.reload(); // Quick reset for the entire view state
}

function quickPrompt(text) {
  document.getElementById('chatInput').value = text;
  sendMessage();
}

/**
 * Render an inline Chart.js chart directly inside the chat message row.
 * Handles historical + predicted (flagged) data series.
 */
function renderInlineChart(container, data, intent) {
  if (!window.Chart || !Array.isArray(data)) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'inline-chart-wrapper';
  wrapper.style.cssText = `
    margin-top: 16px; padding: 16px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
  `;

  const label = document.createElement('div');
  label.style.cssText = 'font-size:11px; color:var(--text3); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px;';
  label.textContent = intent === 'predict' ? '📈 Prediction Chart' : '📊 Data Chart';
  wrapper.appendChild(label);

  const canvasWrapper = document.createElement('div');
  canvasWrapper.style.cssText = 'height: 220px; position: relative;';
  const canvas = document.createElement('canvas');
  canvasWrapper.appendChild(canvas);
  wrapper.appendChild(canvasWrapper);
  container.appendChild(wrapper);

  const historical = data.filter(d => !d.predicted);
  const predicted  = data.filter(d => d.predicted);

  new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map(d => `T${d.time}`),
      datasets: [
        {
          label: 'Data',
          data: historical.map(d => d.value),
          borderColor: '#7c6aff',
          backgroundColor: 'rgba(124, 106, 255, 0.15)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3
        },
        ...(predicted.length > 0 ? [{
          label: 'Predicted',
          data: [
            ...new Array(historical.length - 1).fill(null),
            historical[historical.length - 1]?.value,
            ...predicted.map(d => d.value)
          ],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.1)',
          borderDash: [5, 5],
          borderWidth: 2,
          fill: false,
          tension: 0.4,
          pointRadius: 3
        }] : [])
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#aaa', font: { size: 11 } } }
      },
      scales: {
        x: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}
