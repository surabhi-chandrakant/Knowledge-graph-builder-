# ⬡ Knowledge Graph Explorer

> Transform unstructured articles into a visual, queryable knowledge graph — entirely in your browser using free AI APIs.

---

## Table of Contents

1. [Overview](#overview)
2. [Live Demo / Deployment](#live-demo--deployment)
3. [Getting Started](#getting-started)
4. [How It Works](#how-it-works)
5. [Features](#features)
6. [API Configuration](#api-configuration)
7. [Usage Guide](#usage-guide)
8. [Expected Behavior](#expected-behavior)
9. [File Structure](#file-structure)
10. [Known Limitations](#known-limitations)
11. [Tech Stack](#tech-stack)

---

## Overview

**Knowledge Graph Explorer** is a zero-install, browser-based web application that uses Large Language Models (Groq or Gemini — both free tier) to extract **entities** and **relationships** from any article text, and renders them as an **interactive force-directed graph** using D3.js.

Users can add multiple articles over time, explore the growing graph visually, and ask **natural language questions** that are answered directly from the graph's data.

---

## Live Demo / Deployment

No server needed. Three ways to run it:

| Method | Steps | Result |
|---|---|---|
| **Local** | Unzip → open `index.html` in browser | Works immediately |
| **Netlify Drop** | Go to [app.netlify.com/drop](https://app.netlify.com/drop) → drag unzipped folder | Live URL in 30 seconds |
| **GitHub Pages** | Push files to repo → Settings → Pages → Deploy from branch | `yourusername.github.io/repo-name` |

---

## Getting Started

### Prerequisites

- A modern browser (Chrome 89+, Firefox 87+, Edge 89+)
- Internet connection (for AI API calls and CDN assets)
- A **free** API key from either:
  - **Groq:** [console.groq.com/keys](https://console.groq.com/keys) ← *Recommended*
  - **Gemini:** [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

### Steps

1. **Unzip** the downloaded archive
2. **Open** `index.html` in your browser
3. **Select** your API provider (Groq or Gemini) in the sidebar
4. **Paste** your API key into the key field
5. **Add an article** — paste text or click a Quick Load sample
6. Click **"⬡ Extract & Add to Graph"**
7. Watch your knowledge graph appear!

---

## How It Works

```
Article Text
     │
     ▼
LLM Prompt (Groq / Gemini)
     │
     ▼
JSON Response: { entities[], relations[] }
     │
     ├── entities → Nodes (colored by type)
     └── relations → Directed Edges (with labels)
          │
          ▼
     D3.js Force Graph
          │
          ├── User clicks node → Node Detail Panel
          └── User types question → NL Query → LLM → Answer Panel
```

### Entity Types

| Type | Color | Examples |
|---|---|---|
| Person | Blue | Albert Einstein, Marie Curie |
| Place | Green | Germany, Paris, Princeton |
| Organization | Yellow | CERN, MIT, W3C |
| Concept | Purple | Theory of Relativity, Radioactivity |
| Event | Red | Nobel Prize, Renaissance |
| Other | Teal | Anything that does not fit above |

---

## Features

- **AI Entity Extraction** — LLM identifies entities and classifies them by type
- **AI Relationship Mapping** — Extracts directed relationships between entities (e.g. "born in", "founded", "invented")
- **Interactive D3.js Graph** — Drag nodes, zoom, pan; nodes sized by their number of connections
- **Multi-Article Merging** — Add multiple articles; shared entities automatically merge into one node
- **Node Detail Panel** — Click any node to see its type, all connections (with direction), and source snippet
- **Natural Language Queries** — Ask questions in plain English; LLM answers using only the graph data
- **Color-Coded by Type** — Distinct color per entity type with an on-canvas legend
- **Dual API Support** — Works with Groq (Llama 3.3 70B) or Google Gemini (2.0 Flash)
- **Quick Load Samples** — Three built-in articles (Science, History, Tech) for instant demo
- **Live Stats** — Real-time entity / relation / article count in sidebar
- **Zoom Controls** — Zoom in, zoom out, fit-to-screen buttons

---

## API Configuration

### Groq (Recommended)

- **Model:** `llama-3.3-70b-versatile`
- **Free tier:** 14,400 requests/day, 6,000 tokens/min
- **Get key:** [console.groq.com/keys](https://console.groq.com/keys)
- **Endpoint:** `https://api.groq.com/openai/v1/chat/completions`

### Google Gemini

- **Model:** `gemini-2.0-flash`
- **Free tier:** 15 requests/minute
- **Get key:** [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`

> API keys are never stored — they live only in the input field during your session.

---

## Usage Guide

### Adding Articles

1. Paste any article text into the **sidebar textarea**
2. Click **"Extract & Add to Graph"**
3. Wait 3–8 seconds for extraction
4. Nodes and edges appear on the canvas

### Using Quick Load Samples

- Click **Science**, **History**, or **Tech**
- The textarea pre-fills with a sample article
- Click **"Extract & Add to Graph"** to process it

### Exploring the Graph

| Action | Result |
|---|---|
| Click a node | Opens Node Detail Panel on the right |
| Drag a node | Repositions it; layout re-simulates |
| Scroll / pinch | Zooms the canvas |
| Click background | Closes Node Detail Panel |
| + / - buttons | Zoom in / out |
| Fit button | Reset zoom to center |

### Querying the Graph

1. Type a question in the **top search bar**
   - e.g. "Who invented the World Wide Web?"
   - e.g. "What organizations is Einstein connected to?"
   - e.g. "Where was Marie Curie born?"
2. Press **Enter** or click **Ask**
3. The answer appears in the panel below the search bar
4. Click X to close the answer panel

---

## Expected Behavior

| Trigger | Expected Output |
|---|---|
| Article extracted successfully | New colored nodes and labeled edges appear on canvas; stats update |
| Node clicked | Right panel shows entity type, all connections, and source text |
| Question submitted | Answer panel shows 2-4 sentence response citing graph entity names |
| Empty API key | Toast error: "Please enter your Groq/Gemini API key" |
| Question with empty graph | Toast warning: "Add some articles first!" |
| Clear Graph clicked | Canvas resets; stats return to 0; empty state shown |
| Sample button clicked | Textarea pre-fills; user must still click Extract |

---

## File Structure

```
knowledge-graph-app/
├── index.html     ← App shell, layout, panels, D3 canvas
├── style.css      ← All styles (dark theme, graph elements, panels)
├── app.js         ← All logic (API calls, D3 graph, state, events)
└── README.md      ← This file
```

All three files must remain in the **same directory**. No build step, no npm install, no server required.

---

## Known Limitations

| Limitation | Details |
|---|---|
| No persistent storage | Refreshing the page clears all graph data |
| API key required | Users must supply their own free Groq or Gemini key |
| Rate limits | Groq: 14,400 req/day; Gemini: 15 req/min |
| LLM variability | Entity IDs may vary slightly between runs on the same text |
| No export | Graph cannot be saved to image, JSON, or CSV in this version |
| Large graph perf | 200+ nodes may slow down the D3 simulation |
| Internet required | CDN assets (D3, fonts) and AI APIs require a connection |
| No auth system | No login — intended for individual/demo use |

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI | Vanilla HTML5, CSS3, JavaScript (ES2020) |
| Graph | D3.js v7.8.5 (force-directed layout) |
| AI Option A | Groq API — Llama 3.3 70B Versatile |
| AI Option B | Google Gemini API — Gemini 2.0 Flash |
| Fonts | Inter (Google Fonts CDN) |
| Deployment | Any static host — Netlify, GitHub Pages, Vercel, or local file |

---

*Knowledge Graph Explorer v1.0 — June 2026*