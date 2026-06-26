// ═══════════════════════════════════════════════
//  KNOWLEDGE GRAPH BUILDER  –  app.js
// ═══════════════════════════════════════════════

// ── STATE ──────────────────────────────────────
const STATE = {
  apiKey: '',
  articles: [],          // { id, title, text, nodeIds, edgeIds }
  graph: {
    nodes: [],           // { id, label, type, articles:[], connections:0 }
    edges: [],           // { id, source, target, label, article }
  },
  activeFilters: new Set(),   // entity types to SHOW (empty = show all)
  simulation: null,
  svg: null,
  zoom: null,
  g: null,               // main group inside svg
};

const NODE_COLORS = {
  person:       'var(--c-person)',
  organization: 'var(--c-organization)',
  location:     'var(--c-location)',
  concept:      'var(--c-concept)',
  event:        'var(--c-event)',
  technology:   'var(--c-technology)',
  product:      'var(--c-product)',
  other:        'var(--c-other)',
};
const NODE_COLORS_HEX = {
  person:       '#4f8ef7',
  organization: '#3ecf8e',
  location:     '#f7c948',
  concept:      '#a78bfa',
  event:        '#fb923c',
  technology:   '#22d3ee',
  product:      '#f472b6',
  other:        '#8a92a6',
};

// ── INIT ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  initGraph();
  renderAll();
});

// ── STORAGE ─────────────────────────────────────
function loadFromStorage() {
  try {
    const k = localStorage.getItem('kg_apikey');
    if (k) { STATE.apiKey = k; document.getElementById('apiKeyInput').value = k; showKeyStatus(true); }
    const d = localStorage.getItem('kg_data');
    if (d) {
      const parsed = JSON.parse(d);
      STATE.articles = parsed.articles || [];
      STATE.graph    = parsed.graph    || { nodes: [], edges: [] };
    }
  } catch(e) { console.warn('Storage load failed', e); }
}

function saveToStorage() {
  try {
    localStorage.setItem('kg_data', JSON.stringify({ articles: STATE.articles, graph: STATE.graph }));
  } catch(e) { console.warn('Storage save failed', e); }
}

function saveApiKey() {
  const val = document.getElementById('apiKeyInput').value.trim();
  if (!val.startsWith('sk-ant-')) { showNotif('Key must start with sk-ant-', 'error'); return; }
  STATE.apiKey = val;
  localStorage.setItem('kg_apikey', val);
  showKeyStatus(true);
  showNotif('API key saved', 'success');
}

function showKeyStatus(ok) {
  const el = document.getElementById('keyStatus');
  el.textContent = ok ? '✓ Key saved' : '';
  el.style.color = ok ? 'var(--green)' : 'var(--red)';
}

// ── API CALL ────────────────────────────────────
async function callClaude(messages, systemPrompt = '') {
  if (!STATE.apiKey) throw new Error('No API key. Add your Anthropic key first.');
  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: systemPrompt,
    messages,
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': STATE.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

// ── EXTRACT GRAPH FROM ARTICLE ──────────────────
async function extractGraph(title, text) {
  const system = `You are a knowledge graph extractor. Given an article, extract entities and relationships.
Return ONLY valid JSON, no markdown, no explanation, exactly this structure:
{
  "nodes": [
    {"id": "unique_snake_case_id", "label": "Display Name", "type": "person|organization|location|concept|event|technology|product|other"}
  ],
  "edges": [
    {"source": "node_id", "target": "node_id", "label": "relationship verb"}
  ]
}
Rules:
- node id: lowercase, underscores, no spaces, max 30 chars, must be unique
- Extract 5-20 nodes per article
- Extract 5-25 edges per article
- Types: person, organization, location, concept, event, technology, product, other
- Edge label: short verb phrase (founded, acquired, located_in, developed, etc.)
- Only include entities clearly mentioned in the text
- Merge near-duplicate entities (same entity, different wording) into one node`;

  const content = `Article title: ${title || 'Untitled'}\n\n${text.slice(0, 3000)}`;
  const raw = await callClaude([{ role: 'user', content }], system);

  // Strip markdown fences if present
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed.nodes || !parsed.edges) throw new Error('Invalid extraction response');
  return parsed;
}

// ── INPUT SANITIZATION & VALIDATION ────────────
function sanitizeInput(raw) {
  // 1. Strip all HTML/script tags completely
  let text = raw.replace(/<[^>]*>/g, ' ');

  // 2. Decode common HTML entities that survived tag stripping
  text = text
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, ' ');

  // 3. Remove null bytes and non-printable control chars (keep newlines/tabs)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 4. Collapse excessive whitespace but preserve paragraph breaks
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

function validateArticleInput(title, text) {
  // Block if stripped text is too short
  if (text.length < 50) return 'Article text too short (min 50 characters).';

  // Block if > 80% of characters are non-alphanumeric (likely symbols/code dump)
  const alphanumCount = (text.match(/[a-zA-Z0-9\s]/g) || []).length;
  const ratio = alphanumCount / text.length;
  if (ratio < 0.20) return 'Input appears to contain mostly special characters or symbols. Please paste readable article text.';

  // Block if it looks like a script or code block
  const codePatterns = [
    /function\s*\(/, /=>\s*{/, /var\s+\w+\s*=/, /const\s+\w+\s*=/, /let\s+\w+\s*=/,
    /<script[\s>]/i, /javascript:/i, /on\w+\s*=/i, /eval\s*\(/i, /document\./i,
    /window\./i, /import\s+.*from/, /require\s*\(/,
  ];
  for (const pat of codePatterns) {
    if (pat.test(text)) return 'Input appears to contain code or script. Please paste plain article text only.';
  }

  // Block if title contains HTML/script
  if (title && /<[^>]*>/.test(title)) return 'Title contains HTML tags. Please use plain text.';

  return null; // valid
}

// ── ADD ARTICLE ─────────────────────────────────
async function addArticle() {
  const titleEl = document.getElementById('articleTitle');
  const textEl  = document.getElementById('articleText');
  const btn     = document.getElementById('addBtn');
  const btnText = document.getElementById('addBtnText');
  const spinner = document.getElementById('addSpinner');

  const title = sanitizeInput(titleEl.value.trim());
  const text  = sanitizeInput(textEl.value.trim());

  const validationError = validateArticleInput(title, text);
  if (validationError) { showNotif(validationError, 'error'); return; }
  if (!STATE.apiKey)   { showNotif('Save your API key first', 'error'); return; }

  btn.disabled = true;
  btnText.textContent = 'Extracting…';
  spinner.classList.remove('hidden');

  try {
    const extracted = await extractGraph(title, text);
    mergeIntoGraph(extracted, title || `Article ${STATE.articles.length + 1}`, text);
    titleEl.value = '';
    textEl.value  = '';
    showNotif(`Added ${extracted.nodes.length} nodes, ${extracted.edges.length} edges`, 'success');
    saveToStorage();
    renderAll();
  } catch(e) {
    showNotif('Extraction failed: ' + e.message, 'error');
    console.error(e);
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Extract & Add to Graph';
    spinner.classList.add('hidden');
  }
}

// ── MERGE EXTRACTED DATA INTO GLOBAL GRAPH ──────
function mergeIntoGraph(extracted, articleTitle, articleText) {
  const articleId = 'art_' + Date.now();
  const addedNodeIds = [];
  const addedEdgeIds = [];
  const nodeIdMap = {}; // extracted id → final id

  // Merge nodes
  for (const n of extracted.nodes) {
    const normLabel = n.label.trim().toLowerCase();
    const existing  = STATE.graph.nodes.find(
      x => x.label.trim().toLowerCase() === normLabel && x.type === n.type
    );
    if (existing) {
      if (!existing.articles.includes(articleId)) existing.articles.push(articleId);
      nodeIdMap[n.id] = existing.id;
    } else {
      const newNode = {
        id:       n.id,
        label:    n.label,
        type:     n.type || 'other',
        articles: [articleId],
        connections: 0,
        x: undefined, y: undefined,
      };
      STATE.graph.nodes.push(newNode);
      addedNodeIds.push(n.id);
      nodeIdMap[n.id] = n.id;
    }
  }

  // Merge edges
  for (const e of extracted.edges) {
    const srcId = nodeIdMap[e.source];
    const tgtId = nodeIdMap[e.target];
    if (!srcId || !tgtId) continue;
    const existing = STATE.graph.edges.find(
      x => x.source === srcId && x.target === tgtId && x.label === e.label
    );
    if (!existing) {
      const edgeId = `e_${srcId}_${tgtId}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      STATE.graph.edges.push({ id: edgeId, source: srcId, target: tgtId, label: e.label, article: articleId });
      addedEdgeIds.push(edgeId);
    }
  }

  // Recompute connection counts
  STATE.graph.nodes.forEach(n => n.connections = 0);
  STATE.graph.edges.forEach(e => {
    const s = STATE.graph.nodes.find(n => n.id === e.source);
    const t = STATE.graph.nodes.find(n => n.id === e.target);
    if (s) s.connections++;
    if (t) t.connections++;
  });

  STATE.articles.push({
    id: articleId,
    title: articleTitle,
    text: articleText.slice(0, 500),
    nodeCount: addedNodeIds.length,
    edgeCount: addedEdgeIds.length,
  });
}

// ── DELETE ARTICLE ───────────────────────────────
function deleteArticle(articleId) {
  const art = STATE.articles.find(a => a.id === articleId);
  if (!art) return;
  STATE.articles = STATE.articles.filter(a => a.id !== articleId);

  // Remove edges linked to this article only
  STATE.graph.edges = STATE.graph.edges.filter(e => {
    if (e.article !== articleId) return true;
    return false;
  });

  // Remove nodes that only belong to this article
  STATE.graph.nodes = STATE.graph.nodes.filter(n => {
    n.articles = n.articles.filter(a => a !== articleId);
    return n.articles.length > 0;
  });

  // Recompute connections
  STATE.graph.nodes.forEach(n => n.connections = 0);
  STATE.graph.edges.forEach(e => {
    const s = STATE.graph.nodes.find(n => n.id === e.source);
    const t = STATE.graph.nodes.find(n => n.id === e.target);
    if (s) s.connections++;
    if (t) t.connections++;
  });

  showNotif('Article removed', 'info');
  saveToStorage();
  renderAll();
}

// ── CLEAR ALL ────────────────────────────────────
function clearAll() {
  if (!confirm('Clear all articles and the graph? This cannot be undone.')) return;
  STATE.articles = [];
  STATE.graph = { nodes: [], edges: [] };
  STATE.activeFilters.clear();
  saveToStorage();
  renderAll();
  showNotif('Cleared', 'info');
}

// ── RENDER ALL ───────────────────────────────────
function renderAll() {
  renderArticleList();
  updateStats();
  renderFilterChips();
  updateLegend();
  renderGraph();
}

function renderArticleList() {
  const el = document.getElementById('articleList');
  document.getElementById('articleCount').textContent = STATE.articles.length;
  if (!STATE.articles.length) {
    el.innerHTML = '<div class="empty-state">No articles yet. Add one above.</div>';
    return;
  }
  el.innerHTML = STATE.articles.map(a => `
    <div class="article-item" id="art-${a.id}">
      <div class="article-item-dot"></div>
      <div class="article-item-info">
        <div class="article-item-title" title="${esc(a.title)}">${esc(a.title)}</div>
        <div class="article-item-meta">${a.nodeCount} nodes · ${a.edgeCount} edges added</div>
      </div>
      <button class="article-item-del" title="Remove article" onclick="deleteArticle('${a.id}')">✕</button>
    </div>
  `).join('');
}

function updateStats() {
  const types = new Set(STATE.graph.nodes.map(n => n.type));
  document.getElementById('statNodes').textContent    = STATE.graph.nodes.length;
  document.getElementById('statEdges').textContent    = STATE.graph.edges.length;
  document.getElementById('statArticles').textContent = STATE.articles.length;
  document.getElementById('statTypes').textContent    = types.size;
  document.getElementById('nodeCount').textContent    = `${STATE.graph.nodes.length} nodes · ${STATE.graph.edges.length} edges`;
}

function renderFilterChips() {
  const el = document.getElementById('filterChips');
  const types = [...new Set(STATE.graph.nodes.map(n => n.type))].sort();
  if (!types.length) {
    el.innerHTML = '<div class="empty-state small">Add articles to see entity types.</div>';
    return;
  }
  el.innerHTML = types.map(t => `
    <div class="filter-chip ${STATE.activeFilters.size === 0 || STATE.activeFilters.has(t) ? 'active' : ''}"
         onclick="toggleFilter('${t}')">
      <div class="filter-chip-dot" style="background:${NODE_COLORS_HEX[t] || '#8a92a6'}"></div>
      ${t}
    </div>
  `).join('');
}

function toggleFilter(type) {
  if (STATE.activeFilters.has(type)) {
    STATE.activeFilters.delete(type);
  } else {
    const allTypes = [...new Set(STATE.graph.nodes.map(n => n.type))];
    if (STATE.activeFilters.size === 0) {
      // Activate all except this one
      allTypes.forEach(t => { if (t !== type) STATE.activeFilters.add(t); });
    } else {
      STATE.activeFilters.add(type);
      if (STATE.activeFilters.size === allTypes.length) STATE.activeFilters.clear();
    }
  }
  renderFilterChips();
  renderGraph();
}

function updateLegend() {
  const types = [...new Set(STATE.graph.nodes.map(n => n.type))].sort();
  const el = document.getElementById('legendItems');
  el.innerHTML = types.map(t => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${NODE_COLORS_HEX[t] || '#8a92a6'}"></div>
      <div class="legend-label">${t}</div>
    </div>
  `).join('');
}

// ── D3 GRAPH ─────────────────────────────────────
function initGraph() {
  const container = document.getElementById('graphContainer');
  const svg = d3.select('#graphSvg');
  STATE.svg = svg;

  const zoom = d3.zoom()
    .scaleExtent([0.1, 5])
    .on('zoom', (e) => { STATE.g.attr('transform', e.transform); });
  STATE.zoom = zoom;
  svg.call(zoom);

  STATE.g = svg.append('g').attr('class', 'graph-root');
  STATE.g.append('g').attr('class', 'links');
  STATE.g.append('g').attr('class', 'edge-labels');
  STATE.g.append('g').attr('class', 'nodes');
  STATE.g.append('g').attr('class', 'node-labels');
}

function renderGraph() {
  const emptyEl = document.getElementById('graphEmpty');
  if (!STATE.graph.nodes.length) {
    emptyEl.style.display = 'flex';
    clearSvg();
    return;
  }
  emptyEl.style.display = 'none';

  // Filter
  const visibleTypes = STATE.activeFilters;
  const nodes = STATE.graph.nodes.filter(
    n => visibleTypes.size === 0 || visibleTypes.has(n.type)
  );
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = STATE.graph.edges.filter(
    e => nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  // Work with copies for D3 (avoid mutating STATE)
  const nodesCopy = nodes.map(n => ({ ...n }));
  const edgesCopy = edges.map(e => ({ ...e }));

  drawGraph(nodesCopy, edgesCopy);
}

function clearSvg() {
  if (!STATE.g) return;
  STATE.g.select('.links').selectAll('*').remove();
  STATE.g.select('.edge-labels').selectAll('*').remove();
  STATE.g.select('.nodes').selectAll('*').remove();
  STATE.g.select('.node-labels').selectAll('*').remove();
  if (STATE.simulation) STATE.simulation.stop();
}

function drawGraph(nodes, edges) {
  const container  = document.getElementById('graphContainer');
  const W = container.clientWidth  || 800;
  const H = container.clientHeight || 600;

  clearSvg();

  // Init positions if missing
  nodes.forEach(n => {
    if (!n.x) n.x = W / 2 + (Math.random() - 0.5) * 300;
    if (!n.y) n.y = H / 2 + (Math.random() - 0.5) * 300;
  });

  // Size scale by connections
  const maxConn = Math.max(...nodes.map(n => n.connections), 1);
  const rScale  = d => 6 + (d.connections / maxConn) * 18;

  // Force simulation
  if (STATE.simulation) STATE.simulation.stop();
  STATE.simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id(d => d.id).distance(90).strength(0.5))
    .force('charge', d3.forceManyBody().strength(-220))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide().radius(d => rScale(d) + 10));

  // Links
  const link = STATE.g.select('.links')
    .selectAll('line')
    .data(edges)
    .enter().append('line');

  // Edge labels
  const edgeLabel = STATE.g.select('.edge-labels')
    .selectAll('text')
    .data(edges)
    .enter().append('text')
    .attr('text-anchor', 'middle')
    .text(d => d.label && d.label.length < 18 ? d.label : '');

  // Nodes
  const node = STATE.g.select('.nodes')
    .selectAll('circle')
    .data(nodes)
    .enter().append('circle')
    .attr('r', rScale)
    .attr('fill', d => NODE_COLORS_HEX[d.type] || '#8a92a6')
    .attr('fill-opacity', 0.85)
    .attr('stroke', d => NODE_COLORS_HEX[d.type] || '#8a92a6')
    .call(d3.drag()
      .on('start', dragStart)
      .on('drag', dragging)
      .on('end', dragEnd)
    )
    .on('mouseover', showTooltip)
    .on('mousemove', moveTooltip)
    .on('mouseout', hideTooltip)
    .on('click', nodeClick);

  // Node labels
  const label = STATE.g.select('.node-labels')
    .selectAll('text')
    .data(nodes)
    .enter().append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', d => rScale(d) + 13)
    .text(d => d.label.length > 18 ? d.label.slice(0, 16) + '…' : d.label);

  // Tick
  STATE.simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    edgeLabel
      .attr('x', d => (d.source.x + d.target.x) / 2)
      .attr('y', d => (d.source.y + d.target.y) / 2);

    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);

    label
      .attr('x', d => d.x)
      .attr('y', d => d.y);
  });

  // Zoom to fit after settle
  setTimeout(() => zoomToFit(), 1200);
}

// ── DRAG ─────────────────────────────────────────
function dragStart(event, d) {
  if (!event.active) STATE.simulation.alphaTarget(0.3).restart();
  d.fx = d.x; d.fy = d.y;
}
function dragging(event, d) { d.fx = event.x; d.fy = event.y; }
function dragEnd(event, d) {
  if (!event.active) STATE.simulation.alphaTarget(0);
  d.fx = null; d.fy = null;
}

// ── TOOLTIP ──────────────────────────────────────
function showTooltip(event, d) {
  const tt = document.getElementById('nodeTooltip');
  const sources = STATE.articles
    .filter(a => d.articles.includes(a.id))
    .map(a => a.title).join(', ');

  tt.innerHTML = `
    <div class="tooltip-name">${esc(d.label)}</div>
    <div class="tooltip-type" style="color:${NODE_COLORS_HEX[d.type] || '#8a92a6'}">${d.type}</div>
    <div class="tooltip-connections">${d.connections} connection${d.connections !== 1 ? 's' : ''}</div>
    ${sources ? `<div class="tooltip-sources">From: ${esc(sources)}</div>` : ''}
  `;
  tt.classList.remove('hidden');
  moveTooltip(event);
}
function moveTooltip(event) {
  const tt = document.getElementById('nodeTooltip');
  const container = document.getElementById('graphContainer');
  const rect = container.getBoundingClientRect();
  let x = event.clientX - rect.left + 14;
  let y = event.clientY - rect.top  - 14;
  if (x + 230 > rect.width) x -= 240;
  if (y + 120 > rect.height) y -= 120;
  tt.style.left = x + 'px';
  tt.style.top  = y + 'px';
}
function hideTooltip() {
  document.getElementById('nodeTooltip').classList.add('hidden');
}

// ── NODE CLICK: highlight connected ──────────────
function nodeClick(event, d) {
  const connectedIds = new Set([d.id]);
  STATE.g.select('.links').selectAll('line').each(function(e) {
    const srcId = typeof e.source === 'object' ? e.source.id : e.source;
    const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
    if (srcId === d.id) connectedIds.add(tgtId);
    if (tgtId === d.id) connectedIds.add(srcId);
  });

  STATE.g.select('.nodes').selectAll('circle')
    .attr('fill-opacity', n => connectedIds.has(n.id) ? 1 : 0.2);
  STATE.g.select('.node-labels').selectAll('text')
    .attr('opacity', n => connectedIds.has(n.id) ? 1 : 0.2);
  STATE.g.select('.links').selectAll('line')
    .classed('highlighted', e => {
      const s = typeof e.source === 'object' ? e.source.id : e.source;
      const t = typeof e.target === 'object' ? e.target.id : e.target;
      return s === d.id || t === d.id;
    })
    .attr('stroke-opacity', e => {
      const s = typeof e.source === 'object' ? e.source.id : e.source;
      const t = typeof e.target === 'object' ? e.target.id : e.target;
      return (s === d.id || t === d.id) ? 1 : 0.15;
    });

  // Click background to reset
  STATE.svg.on('click.reset', function(ev) {
    if (ev.target.tagName === 'svg' || ev.target.tagName === 'g') {
      STATE.g.select('.nodes').selectAll('circle').attr('fill-opacity', 0.85);
      STATE.g.select('.node-labels').selectAll('text').attr('opacity', 1);
      STATE.g.select('.links').selectAll('line')
        .classed('highlighted', false)
        .attr('stroke-opacity', 0.7);
      STATE.svg.on('click.reset', null);
    }
  });
}

// ── ZOOM CONTROLS ────────────────────────────────
function zoomToFit() {
  const svg  = STATE.svg;
  const g    = STATE.g;
  if (!svg || !g) return;
  try {
    const bounds = g.node().getBBox();
    if (!bounds.width || !bounds.height) return;
    const container = document.getElementById('graphContainer');
    const W = container.clientWidth;
    const H = container.clientHeight;
    const pad = 60;
    const scale = Math.min(
      (W - pad * 2) / bounds.width,
      (H - pad * 2) / bounds.height,
      2
    );
    const tx = W / 2 - (bounds.x + bounds.width  / 2) * scale;
    const ty = H / 2 - (bounds.y + bounds.height / 2) * scale;
    svg.transition().duration(600)
       .call(STATE.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  } catch(e) {}
}

function resetZoom() {
  STATE.svg.transition().duration(400)
    .call(STATE.zoom.transform, d3.zoomIdentity);
}

// ── QUERY GRAPH ──────────────────────────────────
async function queryGraph() {
  const qInput  = document.getElementById('queryInput');
  const btn     = document.getElementById('queryBtn');
  const btnText = document.getElementById('queryBtnText');
  const spinner = document.getElementById('querySpinner');
  const resultsEl = document.getElementById('queryResults');

  const q = sanitizeInput(qInput.value.trim());
  if (!q) { showNotif('Enter a question', 'error'); return; }
  if (q.length > 500) { showNotif('Query too long (max 500 characters)', 'error'); return; }
  if (!STATE.apiKey) { showNotif('Save your API key first', 'error'); return; }
  if (!STATE.graph.nodes.length) { showNotif('Add articles to build the graph first', 'error'); return; }

  btn.disabled = true;
  btnText.textContent = 'Thinking…';
  spinner.classList.remove('hidden');

  try {
    const graphSummary = buildGraphSummary();
    const system = `You are an intelligent assistant that answers questions about a knowledge graph.
The knowledge graph was extracted from articles. Answer concisely and specifically.
Base your answers only on the provided graph data.`;

    const content = `Knowledge Graph Data:\n${graphSummary}\n\nQuestion: ${q}`;
    const answer = await callClaude([{ role: 'user', content }], system);

    const item = document.createElement('div');
    item.className = 'query-result-item';
    item.innerHTML = `<div class="query-result-q">Q: ${esc(q)}</div><div>${formatAnswer(answer)}</div>`;
    if (resultsEl.querySelector('.empty-state')) resultsEl.innerHTML = '';
    resultsEl.insertBefore(item, resultsEl.firstChild);
    qInput.value = '';
  } catch(e) {
    showNotif('Query failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Ask';
    spinner.classList.add('hidden');
  }
}

function setQuery(q) {
  document.getElementById('queryInput').value = q;
  document.getElementById('queryInput').focus();
}

function buildGraphSummary() {
  const nodeLines = STATE.graph.nodes.map(n =>
    `- [${n.type}] ${n.label} (connections: ${n.connections}, in articles: ${
      STATE.articles.filter(a => n.articles.includes(a.id)).map(a => a.title).join(', ')
    })`
  );
  const edgeLines = STATE.graph.edges.map(e => {
    const s = STATE.graph.nodes.find(n => n.id === e.source);
    const t = STATE.graph.nodes.find(n => n.id === e.target);
    if (!s || !t) return null;
    return `- ${s.label} --[${e.label}]--> ${t.label}`;
  }).filter(Boolean);

  return `NODES (${STATE.graph.nodes.length}):\n${nodeLines.join('\n')}\n\nEDGES (${STATE.graph.edges.length}):\n${edgeLines.join('\n')}`;
}

function formatAnswer(text) {
  // Simple markdown-like formatting
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

// ── EXPORT ───────────────────────────────────────
function exportJSON() {
  const data = {
    metadata: {
      articles: STATE.articles.length,
      nodes: STATE.graph.nodes.length,
      edges: STATE.graph.edges.length,
      exported: new Date().toISOString(),
    },
    articles: STATE.articles.map(a => ({ id: a.id, title: a.title })),
    nodes: STATE.graph.nodes.map(({ id, label, type, articles, connections }) =>
      ({ id, label, type, articles, connections })),
    edges: STATE.graph.edges.map(({ id, source, target, label, article }) =>
      ({ id, source, target, label, article })),
  };
  download('knowledge-graph.json', JSON.stringify(data, null, 2), 'application/json');
}

function exportCSV() {
  const nodeRows = ['id,label,type,connections,articles'];
  STATE.graph.nodes.forEach(n => {
    const arts = STATE.articles.filter(a => n.articles.includes(a.id)).map(a => a.title).join('; ');
    nodeRows.push(`"${n.id}","${n.label}","${n.type}",${n.connections},"${arts}"`);
  });
  const edgeRows = ['\nid,source,target,label'];
  STATE.graph.edges.forEach(e => {
    const s = STATE.graph.nodes.find(n => n.id === e.source);
    const t = STATE.graph.nodes.find(n => n.id === e.target);
    edgeRows.push(`"${e.id}","${s?.label || e.source}","${t?.label || e.target}","${e.label}"`);
  });
  download('knowledge-graph.csv', [...nodeRows, ...edgeRows].join('\n'), 'text/csv');
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// ── NOTIFICATION ─────────────────────────────────
function showNotif(msg, type = 'info') {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.className = `notification ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3500);
}

// ── UTILS ────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
