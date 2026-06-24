// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  apiProvider: 'groq',
  nodes: [],       // { id, label, type, source }
  edges: [],       // { source, target, relation }
  articles: [],
};

const TYPE_COLORS = {
  Person:       '#6C8EBF',
  Place:        '#82B366',
  Organization: '#D6A832',
  Concept:      '#AE85C9',
  Event:        '#E06565',
  Other:        '#5FB8C4',
};

// ─── Sample Articles ──────────────────────────────────────────────────────────
const SAMPLES = {
  science: `Albert Einstein, born in Ulm, Germany in 1879, was a theoretical physicist who developed the theory of relativity. He worked at the Institute for Advanced Study in Princeton, New Jersey. Einstein received the Nobel Prize in Physics in 1921 for his discovery of the law of the photoelectric effect. He collaborated with Niels Bohr on discussions about quantum mechanics. Einstein's equation E=mc² became one of the most famous equations in physics. He fled Nazi Germany in 1933 and became an American citizen in 1940.

Marie Curie was a physicist and chemist who conducted pioneering research on radioactivity. She was born in Warsaw, Poland and later moved to Paris, France to study at the University of Paris. Curie discovered the elements polonium and radium. She was the first woman to win a Nobel Prize and the only person to win Nobel Prizes in two different sciences — Physics in 1903 and Chemistry in 1911. She worked at the Radium Institute in Paris.`,

  history: `The Renaissance was a cultural and intellectual movement that began in Florence, Italy during the 14th century. Leonardo da Vinci was a polymath of the Italian Renaissance who worked in Florence and Milan. He was apprenticed to Andrea del Verrocchio and later became a master painter, sculptor, architect, and scientist. Leonardo painted the Mona Lisa and The Last Supper. He worked under the patronage of Ludovico Sforza, the Duke of Milan.

Michelangelo Buonarroti was another great artist of the Renaissance. He was born in Caprese, Tuscany and worked primarily in Florence and Rome. Pope Julius II commissioned Michelangelo to paint the Sistine Chapel ceiling. Michelangelo also sculpted the famous statue of David, which is housed in the Galleria dell'Accademia in Florence. Both Leonardo and Michelangelo were influenced by the Medici family, who were powerful patrons of the arts in Florence.`,

  tech: `Tim Berners-Lee invented the World Wide Web in 1989 while working at CERN, the European Organization for Nuclear Research in Geneva, Switzerland. He proposed an information management system that became the foundation of the web. Berners-Lee founded the World Wide Web Consortium (W3C) at MIT to develop web standards. He was knighted by Queen Elizabeth II in 2004.

Linus Torvalds created the Linux kernel in 1991 while studying at the University of Helsinki in Finland. Linux is an open-source operating system kernel that powers millions of servers worldwide. Torvalds also created Git, a distributed version control system, in 2005. The Linux Foundation, based in San Francisco, supports the development of Linux. Many major technology companies including Google, IBM, and Red Hat contribute to Linux development. Android, developed by Google, is built on the Linux kernel.`,
};

// ─── API Calls ────────────────────────────────────────────────────────────────
async function callGroq(prompt) {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) throw new Error('Please enter your Groq API key.');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq API error ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGemini(prompt) {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) throw new Error('Please enter your Gemini API key.');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error ${res.status}`);
  }

  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callLLM(prompt) {
  return state.apiProvider === 'gemini' ? callGemini(prompt) : callGroq(prompt);
}

// ─── Extract Knowledge Graph from Article ────────────────────────────────────
async function extractGraph(articleText) {
  const prompt = `You are a knowledge graph extractor. Given the following article, extract:
1. Named entities with their types (Person, Place, Organization, Concept, Event, Other)
2. Relationships between entities

Return ONLY valid JSON in this exact format, no other text:
{
  "entities": [
    {"id": "unique_snake_case_id", "label": "Display Name", "type": "Person|Place|Organization|Concept|Event|Other"}
  ],
  "relations": [
    {"source": "source_id", "target": "target_id", "relation": "short verb phrase"}
  ]
}

Rules:
- Use snake_case for IDs (e.g., "albert_einstein", "university_of_paris")
- Types must be exactly one of: Person, Place, Organization, Concept, Event, Other
- Relations should be short active phrases (e.g., "born in", "founded", "works at", "invented")
- Extract 5-20 entities and 5-25 relations
- Avoid duplicate entities - if the same entity appears multiple times, use the same ID

Article:
${articleText}`;

  const raw = await callLLM(prompt);

  // Extract JSON from response (handle markdown code blocks)
  let json = raw;
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) json = match[1];
  else {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1) json = raw.slice(start, end + 1);
  }

  return JSON.parse(json.trim());
}

// ─── Query Graph ─────────────────────────────────────────────────────────────
async function queryGraph() {
  const q = document.getElementById('query-input').value.trim();
  if (!q) return;
  if (state.nodes.length === 0) { showToast('Add some articles first!', 'warn'); return; }

  const btn = document.getElementById('query-btn');
  btn.textContent = '…';
  btn.disabled = true;

  try {
    // Build a compact graph summary
    const nodeList = state.nodes.map(n => `${n.id} (${n.label}, ${n.type})`).join('\n');
    const edgeList = state.edges.map(e => `${e.source} -[${e.relation}]-> ${e.target}`).join('\n');

    const prompt = `You are a knowledge graph query engine. Given a knowledge graph and a question, answer the question using ONLY the information present in the graph.

KNOWLEDGE GRAPH NODES:
${nodeList}

KNOWLEDGE GRAPH EDGES:
${edgeList}

QUESTION: ${q}

Instructions:
- Answer the question using only the graph data above
- Be specific and cite entity names from the graph
- If the answer cannot be found in the graph, say "This information is not in the knowledge graph"
- Keep the answer concise (2-4 sentences)
- Highlight key entities mentioned`;

    const answer = await callLLM(prompt);
    showAnswer(q, answer);
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.textContent = 'Ask';
    btn.disabled = false;
  }
}

// ─── Add Article ──────────────────────────────────────────────────────────────
async function addArticle() {
  const text = document.getElementById('article-input').value.trim();
  if (!text) { showToast('Please enter some article text', 'warn'); return; }

  const btnText = document.getElementById('add-btn-text');
  const btnSpinner = document.getElementById('add-btn-spinner');
  const btn = document.querySelector('.btn-primary');

  btnText.textContent = 'Extracting…';
  btnSpinner.classList.remove('hidden');
  btn.disabled = true;

  try {
    const { entities, relations } = await extractGraph(text);

    let newNodes = 0;
    let newEdges = 0;

    entities.forEach(e => {
      if (!state.nodes.find(n => n.id === e.id)) {
        state.nodes.push({ ...e, source: text.slice(0, 100) + '…' });
        newNodes++;
      }
    });

    relations.forEach(r => {
      const exists = state.edges.find(
        e => e.source === r.source && e.target === r.target && e.relation === r.relation
      );
      if (!exists) {
        // Only add edge if both nodes exist
        const srcExists = state.nodes.find(n => n.id === r.source);
        const tgtExists = state.nodes.find(n => n.id === r.target);
        if (srcExists && tgtExists) {
          state.edges.push(r);
          newEdges++;
        }
      }
    });

    state.articles.push(text.slice(0, 80));
    document.getElementById('article-input').value = '';

    updateStats();
    renderGraph();
    showToast(`Added ${newNodes} entities, ${newEdges} relations`, 'success');

  } catch (e) {
    showToast('Error: ' + e.message, 'error');
    console.error(e);
  } finally {
    btnText.textContent = '⬡ Extract & Add to Graph';
    btnSpinner.classList.add('hidden');
    btn.disabled = false;
  }
}

// ─── Load Sample ─────────────────────────────────────────────────────────────
function loadSample(key) {
  document.getElementById('article-input').value = SAMPLES[key];
  showToast('Sample article loaded — click "Extract & Add to Graph"', 'success');
}

// ─── Stats ───────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-entities').textContent = state.nodes.length;
  document.getElementById('stat-relations').textContent = state.edges.length;
  document.getElementById('stat-articles').textContent = state.articles.length;
}

// ─── Clear Graph ─────────────────────────────────────────────────────────────
function clearGraph() {
  state.nodes = [];
  state.edges = [];
  state.articles = [];
  updateStats();
  renderGraph();
  closeAnswer();
  closeNodePanel();
  showToast('Graph cleared', 'warn');
}

// ─── API Provider ─────────────────────────────────────────────────────────────
function selectAPI(provider) {
  state.apiProvider = provider;
  document.getElementById('btn-groq').classList.toggle('active', provider === 'groq');
  document.getElementById('btn-gemini').classList.toggle('active', provider === 'gemini');

  const hint = document.getElementById('api-hint');
  if (provider === 'groq') {
    hint.innerHTML = 'Get free key: <a href="https://console.groq.com/keys" target="_blank">console.groq.com</a>';
  } else {
    hint.innerHTML = 'Get free key: <a href="https://aistudio.google.com/app/apikey" target="_blank">aistudio.google.com</a>';
  }
}

// ─── Answer Panel ─────────────────────────────────────────────────────────────
function showAnswer(question, answer) {
  document.getElementById('answer-title').textContent = question;
  document.getElementById('answer-body').textContent = answer;
  document.getElementById('answer-panel').classList.remove('hidden');
}

function closeAnswer() {
  document.getElementById('answer-panel').classList.add('hidden');
}

// ─── Node Panel ───────────────────────────────────────────────────────────────
function showNodePanel(node) {
  document.getElementById('node-panel-type').textContent = node.type;
  document.getElementById('node-panel-name').textContent = node.label;

  // Find connections
  const connections = state.edges
    .filter(e => e.source === node.id || e.target === node.id)
    .map(e => {
      if (e.source === node.id) {
        const target = state.nodes.find(n => n.id === e.target);
        return { rel: e.relation, name: target?.label || e.target, dir: 'out' };
      } else {
        const src = state.nodes.find(n => n.id === e.source);
        return { rel: e.relation, name: src?.label || e.source, dir: 'in' };
      }
    });

  const connDiv = document.getElementById('node-connections');
  connDiv.innerHTML = connections.length
    ? connections.map(c =>
        `<div class="np-connection">
          <span class="np-rel">${c.dir === 'out' ? '→' : '←'} ${c.rel}</span>
          <span class="np-target">${c.name}</span>
        </div>`
      ).join('')
    : '<div style="font-size:12px;color:var(--text3)">No connections</div>';

  document.getElementById('node-source').textContent = node.source || '—';
  document.getElementById('node-panel').classList.remove('hidden');

  // Highlight connected edges
  d3.selectAll('.graph-link')
    .classed('highlighted', d =>
      d.source.id === node.id || d.target.id === node.id
    );
}

function closeNodePanel() {
  document.getElementById('node-panel').classList.add('hidden');
  d3.selectAll('.graph-link').classed('highlighted', false);
}

// ─── D3 Graph ────────────────────────────────────────────────────────────────
let simulation, svgEl, gEl, zoomBehavior;

function renderGraph() {
  const svg = d3.select('#graph-svg');
  const wrap = document.getElementById('graph-wrap');
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;

  // Toggle empty state
  const empty = document.getElementById('empty-state');
  if (state.nodes.length === 0) {
    empty.classList.remove('hidden');
    svg.selectAll('*').remove();
    return;
  }
  empty.classList.add('hidden');

  // Clear
  svg.selectAll('*').remove();

  // Zoom
  zoomBehavior = d3.zoom().scaleExtent([0.1, 4]).on('zoom', e => {
    gEl.attr('transform', e.transform);
  });
  svg.call(zoomBehavior);

  // Defs (arrowhead)
  svg.append('defs').append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '-0 -5 10 10')
    .attr('refX', 20)
    .attr('refY', 0)
    .attr('orient', 'auto')
    .attr('markerWidth', 8)
    .attr('markerHeight', 8)
    .attr('xoverflow', 'visible')
    .append('path')
    .attr('d', 'M 0,-4 L 10,0 L 0,4')
    .attr('fill', '#3A4A64');

  gEl = svg.append('g');
  svgEl = svg;

  // Build nodes/edges for D3 (deep copy to avoid mutation issues)
  const nodes = state.nodes.map(n => ({ ...n }));
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));

  const links = state.edges
    .filter(e => nodeById[e.source] && nodeById[e.target])
    .map(e => ({ ...e, source: e.source, target: e.target }));

  // Simulation
  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(120))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(40));

  // Links
  const link = gEl.append('g').selectAll('.graph-link')
    .data(links).enter().append('line')
    .attr('class', 'graph-link');

  // Link labels
  const linkLabel = gEl.append('g').selectAll('.link-label')
    .data(links).enter().append('text')
    .attr('class', 'link-label')
    .text(d => d.relation);

  // Nodes
  const node = gEl.append('g').selectAll('.graph-node')
    .data(nodes).enter().append('g')
    .attr('class', 'graph-node')
    .call(
      d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
    )
    .on('click', (event, d) => {
      event.stopPropagation();
      const nodeData = state.nodes.find(n => n.id === d.id);
      if (nodeData) showNodePanel(nodeData);
    });

  node.append('circle')
    .attr('r', d => {
      const degree = links.filter(l =>
        (l.source.id || l.source) === d.id || (l.target.id || l.target) === d.id
      ).length;
      return Math.max(16, Math.min(32, 14 + degree * 2));
    })
    .attr('fill', d => TYPE_COLORS[d.type] || TYPE_COLORS.Other)
    .attr('stroke', d => d3.color(TYPE_COLORS[d.type] || TYPE_COLORS.Other).brighter(0.5))
    .attr('fill-opacity', 0.85);

  node.append('text')
    .text(d => d.label.length > 12 ? d.label.slice(0, 12) + '…' : d.label)
    .attr('dy', d => {
      const degree = links.filter(l =>
        (l.source.id || l.source) === d.id || (l.target.id || l.target) === d.id
      ).length;
      return Math.max(16, Math.min(32, 14 + degree * 2)) + 14;
    })
    .style('font-size', '10px')
    .attr('fill', '#8A9BB8');

  // Close panels when clicking background
  svg.on('click', () => { closeNodePanel(); });

  // Tick
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    linkLabel
      .attr('x', d => (d.source.x + d.target.x) / 2)
      .attr('y', d => (d.source.y + d.target.y) / 2);

    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}

// ─── Zoom Controls ────────────────────────────────────────────────────────────
function zoomIn()  { svgEl?.transition().call(zoomBehavior.scaleBy, 1.4); }
function zoomOut() { svgEl?.transition().call(zoomBehavior.scaleBy, 0.7); }
function resetZoom() {
  if (!svgEl) return;
  svgEl.transition().duration(400).call(
    zoomBehavior.transform,
    d3.zoomIdentity
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3200);
}

// ─── Enter key ───────────────────────────────────────────────────────────────
document.getElementById('query-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') queryGraph();
});

// ─── Init ────────────────────────────────────────────────────────────────────
updateStats();
renderGraph();

window.addEventListener('resize', () => {
  if (state.nodes.length > 0) renderGraph();
});
