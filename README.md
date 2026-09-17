# ⚡ AI Showdown: The LLM Chess Arena

**AI Showdown** is an esports-grade live chess arena benchmarking the strategic reasoning, tactical planning, and tool-calling execution of frontier Large Language Models.

Watch top models like **Claude 3.7 / Opus 4.6**, **GPT-6 / 5.6**, and **Gemini 3.8** battle in real-time with digital chess clocks, live neural reasoning streams, automated tournaments, and PGN game telemetry.

---

## 🌟 Key Features

### ⚔️ 1v1 Live Duels & Digital Clocks
- Real-time animated interactive chessboard rendered with pure high-performance CSS and SVG pieces.
- Digital dual chess clocks with time-control presets:
  - **Bullet** (1m + 0s / 2m + 1s)
  - **Blitz** (3m + 2s / 5m + 3s)
  - **Rapid** (10m + 5s / 15m + 10s)
  - **Classical** (30m + 0s)
- Sound effects for moves, captures, checks, and checkmates using Web Audio API synthesis.

### 🧠 Split Neural Thinking Feed & Live SSE Streaming
- **Dual Column Split View**: White and Black agents stream their neural reasoning and tool calls side-by-side.
- **Token Streaming**: Real-time Server-Sent Events (SSE) reader displays thinking tokens as they generate with an animated blinking cursor (`▌`).
- **Telemetry Inspector**: Click any move card to inspect the full tool call payload, arguments, raw reasoning, response latency (ms), and PGN FEN state.

### 🛡️ Anti-Early-Forfeit System & Recovery Assist
- **Dynamic Legal Move Prompts**: Every turn prompt dynamically injects the complete list of valid legal moves in the position.
- **Fuzzy Move Sanitization**:
  - Strips move prefixes (`1. `, `1... `, `move 1: `)
  - Normalizes trailing punctuation (`!`, `?`, `#`, `.`)
  - Converts UCI coordinates (`b8c6` $\rightarrow$ `Nc6`, `e2e4` $\rightarrow$ `e4`)
  - Case-insensitive SAN fallback matching.
- **Auto-Recovery Assist**: If an LLM exhausts all retry attempts due to syntax errors, the orchestrator automatically executes a top legal move with a logged penalty flag (`⚠️ [RECOVERY ASSIST]`), ensuring matches never abort prematurely and always reach checkmate, stalemate, or clock flag.

### 🏆 Tournament Championship Mode
- **Knockout Brackets**: Single-elimination tournament with bracket progression, seedings, and match history.
- **Round-Robin League**: Every model plays every other model in a complete round-robin series with a live points & standings leaderboard.
- **Auto-Run Mode**: Hands-free match queue execution with victory podium and confetti celebrations.

### 💾 Export & Benchmark Telemetry
- **PGN Export**: One-click download of the complete standard Portable Game Notation file with headers, move annotations, and clock timestamps.
- **Live Material Balance**: Visual display of captured piece trays with material point advantage differential.

---

## 🛠️ Architecture & Tool-Calling Protocol

Each model acts as an autonomous agent in a structured conversational loop. Agents make decisions through native function calling:

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `make_move` | `move` (string, required)<br>`reasoning` (string, required) | Executes a move in Standard Algebraic Notation (SAN) or UCI, supplying tactical reasoning. |
| `get_board_state` | *None* | Fetches current FEN, move history, captured pieces, and clock time remaining. |
| `get_legal_moves` | *None* | Returns the array of all valid SAN moves in the current position. |
| `resign` | `reason` (string, optional) | Concedes the game if in an untenable position. |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v18.0.0` or higher
- **npm** or **pnpm** / **yarn**

### Installation

```bash
# Clone repository
git clone https://github.com/azmi2409/ai-showdown.git
cd ai-showdown

# Install dependencies
npm install
```

### Running Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

Running `npm run dev` concurrently boots:
- 🌐 **Vite Client**: `http://localhost:5173/`
- ⚡ **Express API Backend**: `http://localhost:3001/` (with `/api` proxy auto-configured)

### Building for Production

```bash
npm run build
npm run preview
```

---

## ⚡ Express Backend & Persistent Match/Tournament API

AI Showdown includes a dedicated Express + TypeScript backend storing match telemetry, tournament brackets, and recalculating chess ELO ratings.

### Endpoints
- `POST /api/matches`: Records a completed duel or tournament match with `matchId`, `tournamentId`, full PGN, FEN, and telemetry. Automatically computes new dynamic ELO ratings.
- `GET /api/matches`: Query match history with optional `?tournamentId=` or `?modelId=` filters.
- `GET /api/matches/:id`: Retrieve single match details and full move records.
- `POST /api/tournaments` & `PUT /api/tournaments/:id`: Save and update tournament progression, brackets, and standings.
- `GET /api/tournaments`: List all historical tournaments.
- `GET /api/models/leaderboard`: Fetch live benchmark standings, win/draw/loss counts, and provisional badges.
- `POST /api/models/recalculate-elo`: Recalculates the entire match history from baseline seeds using the dynamic K-factor engine.

### 🎯 Enhanced ELO Rating Engine
- **Dynamic K-Factor**:
  - **Provisional ($< 10$ matches)**: $K = 40$ for rapid calibration.
  - **Established ($10 - 29$ matches)**: $K = 24$.
  - **Master Bracket ($\ge 30$ matches or rating $> 2400$)**: $K = 16$.
- **White First-Move Tempo Correction**: Incorporates White's standard chess first-move advantage equity ($\Delta_{\text{tempo}} \approx +35$ Elo) into the logistic expectation curve.
- **Recovery Penalties**: Deducts points from models requiring recovery assists after repeated illegal attempts.

---

## ⚙️ Model & Endpoint Configuration

AI Showdown is preconfigured to work with local proxy servers and official APIs:

- **Local Proxy Endpoint**: Defaults to `http://localhost:20128/v1` (no API key required).
- **Supported Models Out of the Box**:
  - `ag/claude-opus-4-6-thinking`
  - `ag/claude-sonnet-4-6`
  - `ag/gpt-oss-120b-medium`
  - `ag/gemini-3.8-flash-medium`
  - `ag/gemini-3.7-flash-medium`
  - `ag/gemini-3.6-flash-medium`
  - `ag/gemini-3.5-flash-medium`
  - `ag/gemini-3.1-pro-low`
  - `ag/gemini-3-flash-medium`
  - `cx/gpt-6-astra`
  - `cx/gpt-5.6-sol`
  - `cx/gpt-5.6-terra`
  - `cx/gpt-5.6-luna`
  - `cx/gpt-5.5`
  - `cx/gpt-5.4`
  - `cx/gpt-5.4-mini`
  - `cx/gpt-5.3-codex-spark`
- **Custom Endpoints & Keys**: Go to the **Settings** tab in the top navigation to add your custom API keys, custom model identifiers, and custom base URLs.

---

## 📁 Project Structure

```
ai-showdown/
├── server/                          # Express Backend Service (:3001)
│   ├── index.ts                     # Express server & route bootstrap
│   ├── types.ts                     # Match, tournament, and DB schemas
│   ├── services/
│   │   ├── eloEngine.ts             # Dynamic K-factor & White tempo ELO engine
│   │   └── dbStore.ts               # Atomic JSON file database store
│   ├── routes/
│   │   ├── matches.ts               # Match recording & history endpoints
│   │   ├── tournaments.ts           # Tournament persistence endpoints
│   │   └── leaderboard.ts           # Benchmark leaderboard & ELO recalculation
│   └── data/
│       └── showdown-db.json         # Persistent database file
├── src/                             # React Frontend (:5173)
│   ├── components/
│   │   ├── ChessBoard.tsx           # Interactive board with SVG pieces & move highlights
│   │   ├── PlayerPanel.tsx          # Player card with clocks, captures & thinking badge
│   │   ├── NeuralFeed.tsx           # Side-by-side split neural reasoning stream
│   │   ├── TournamentView.tsx       # Knockout bracket & Round-robin league
│   │   ├── LeaderboardView.tsx      # Model ELO ratings, win rates & stats
│   │   ├── SettingsView.tsx         # API keys & model registry manager
│   │   └── PromptInspectorModal.tsx # Detailed telemetry & tool call inspector
│   ├── services/
│   │   ├── apiService.ts            # Client API connector with offline fallback
│   │   ├── GameStateStore.ts        # Reactive state store & chess rule engine
│   │   ├── GameOrchestrator.ts      # Agent turn loop, fallback recovery & clock ticks
│   │   ├── tournamentManager.ts     # Tournament bracket generation & advancement
│   │   ├── defaultModels.ts         # Preset registry of benchmark models
│   │   ├── chessTools.ts            # OpenAI-compatible function calling schemas
│   │   └── storageService.ts        # Local storage caching & persistence
│   ├── types.ts                     # TypeScript interfaces & domain models
│   ├── index.css                    # Esports dark theme & design tokens
│   ├── App.tsx                      # Root arena layout, state wiring & routing
│   └── main.tsx                     # React entry point
├── package.json
└── vite.config.ts
```

---

## 📜 License

MIT License. Designed and built for benchmarking the next generation of frontier intelligence.
