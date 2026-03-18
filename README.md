#  Itumeleng's Chess Board

A fully-featured, browser-based chess game built from scratch using vanilla HTML, CSS, and JavaScript — no libraries, no frameworks, no shortcuts.*

---

##  Project Overview

This project is a complete chess game I built step by step, treating it like a real dev project with defined phases. The goal was not just to make pieces move on a screen, but to implement a true chess engine that understands and enforces every rule of the game — including the tricky ones like castling, en passant, and checkmate detection.

Everything runs in a single browser tab. Just open `index.html` and play.

---

## 🗂️ File Structure

```
chess/
├── index.html   → Page structure and markup
├── style.css    → All visual styling, animations, and responsive layout
├── chess.js     → Complete chess engine, game logic, and DOM rendering
└── README.md    → This file
```

---

## 🏗️ How I Tackled It — Phase by Phase

### ✅ Phase 1 — The Board & Pieces

**Goal:** Get an 8×8 board on screen with pieces displayed correctly.

The first decision was how to represent the board in memory. I chose the simplest possible structure: a 2D JavaScript array where each cell holds either `null` (empty) or a 2-character string like `'wQ'` (white Queen) or `'bP'` (black Pawn).

```js
board[row][col] = 'wQ' // white Queen
board[row][col] = 'bP' // black Pawn
board[row][col] = null // empty square
```

The first character encodes the **color** (`w` / `b`) and the second encodes the **piece type** (`K Q R B N P`). This makes every check dead simple:

```js
const color = piece => piece[0];  // 'w' or 'b'
const type  = piece => piece[1];  // 'K', 'Q', 'R', etc.
```

For rendering I used **Unicode chess symbols** (♔♕♖♗♘♙ for white, ♚♛♜♝♞♟ for black) — no image files needed, infinitely scalable, and they look great with CSS text-shadow styling.

The board is drawn using CSS Grid (8 columns × 8 rows). Square colors are determined by `(row + col) % 2 === 0`.

---

### ✅ Phase 2 — Legal Moves & Turn Enforcement

**Goal:** Click a piece, see where it can go, click a destination, and move — with turns alternating correctly.

This was the most architecturally important phase. I split move generation into two distinct stages:

#### Stage 1: Pseudo-Legal Moves

`getPseudoMoves(board, row, col)` generates every square a piece *could physically reach* based on how it moves — without caring whether the move leaves the king in check.

- **Pawns** move forward (direction depends on color), can double-push from the starting rank, and only capture diagonally.
- **Knights** use a hardcoded list of 8 L-shaped offsets.
- **Sliding pieces** (Bishop, Rook, Queen) use a ray-casting loop that steps in a direction until it hits a piece or the board edge.
- **Kings** step one square in any of 8 directions.

#### Stage 2: Legal Move Filtering

`getLegalMoves(board, color)` takes every pseudo-legal move, **applies it to a temporary copy of the board**, and then checks if the moving player's king is now in check. If it is — that move is illegal and gets filtered out.

```js
for each pseudo-legal move:
    tempBoard = applyMove(board, move)   // copy, never mutate
    if (!isInCheck(tempBoard, myColor))  // king safe?
        legalMoves.push(move)            // only then it's legal
```

This single principle — *you cannot make a move that leaves your own king in check* — handles pins, discovered checks, and king safety all at once.

**Click handling** follows this flow:
1. Click a friendly piece → select it, highlight legal moves with green dots
2. Click a highlighted square → execute the move
3. Click anywhere else → deselect

---

### ✅ Phase 3 — Special Rules

**Goal:** Implement castling, en passant, and pawn promotion.

#### Castling

Checked inside `getPseudoMoves` for the King. Three conditions must all pass:

1. Neither the king nor the relevant rook has moved (tracked via `castlingRights` flags)
2. All squares between king and rook are empty
3. The king does not pass through or land on any attacked square

When castling is executed, `applyMove` moves both the king and the rook in a single operation.

#### En Passant

When a pawn double-pushes, I store the square it "skipped over" in `enPassantTarget`. On the very next move only, an adjacent enemy pawn can capture to that square. The tricky part: the captured pawn is **not on the destination square** — it's on the same row as the moving pawn. `applyMove` handles this with a special `enPassant: true` flag that removes the pawn from its actual position.

```js
if (move.enPassant) {
    captured = board[move.r][move.tc];  // same row, target column
    board[move.r][move.tc] = null;      // remove the captured pawn
}
```

#### Pawn Promotion

When a pawn reaches the opposite back rank, I **pause execution** and show a modal asking the player to choose a promotion piece (Queen, Rook, Bishop, or Knight). The pending move is saved in a `pendingPromotion` object. When the player clicks a piece, `finalizeMove` resumes with the chosen type. This avoids any async complexity while keeping the UI responsive.

---

###  Phase 4 — Check, Checkmate, Stalemate & Game Features

**Goal:** Detect endgame conditions, track moves, and allow undo and restart.

#### Check Detection

`isInCheck(board, color)` finds the king's position, then checks whether any enemy piece can attack that square. It works by generating pseudo-legal moves for every enemy piece and seeing if any of them land on the king's square.

#### Checkmate & Stalemate

After every move, `checkGameStatus()` runs:

```js
const inCheck = isInCheck(board, currentTurn)
const noMoves = getLegalMoves(board, currentTurn).length === 0

if (noMoves && inCheck)  → Checkmate  (in check, can't escape)
if (noMoves && !inCheck) → Stalemate  (not in check, but no legal moves)
if (!noMoves && inCheck) → Check      (in check, but can escape)
```

#### Move History

Every move is recorded in algebraic notation (e.g., `e4`, `Nf3`, `O-O`, `exd5`) and displayed in a scrollable side panel, paired by turn number.

#### Undo

Before every move, `saveState()` deep-copies the entire game state into a `stateHistory` stack. Undo pops the last entry and restores from the one before it — board array, castling rights, en passant target, captured pieces, everything.

---

## Key Technical Decisions

| Decision | Reasoning |
|---|---|
| Immutable board updates | `applyMove` always returns a new board copy — never mutates. Essential for the legal-move filter (needs throwaway boards) and Undo (needs snapshots). |
| Two-phase move generation | Separating pseudo-legal from legal moves keeps each function simple and focused. The filter step automatically handles pins, skewers, and discovered checks. |
| Cache legal moves | `legalMovesCache` is computed once per position and reused on every click. Cleared whenever the board changes. |
| Separate castling rights flags | Tracking `wK`, `wQ`, `bK`, `bQ` independently means a queenside rook moving doesn't revoke kingside castling rights, and vice versa. |
| En passant target reset | `enPassantTarget` is reset to `null` after every move — en passant is only valid for exactly one turn. |

---

## Design Approach

The visual theme is **dark royal** — deep blacks with gold accents, inspired by the gravitas of a tournament chess set. Key choices:

- **Fonts:** `Cinzel Decorative` for the title (ornate, regal), `Cinzel` for UI elements (clean serif), `EB Garamond` for italic flavour text
- **Colors:** Warm brown board squares (`#d4b896` / `#7a4f2e`), gold UI accents (`#c9a84c`), glowing animated crown in the header
- **Move indicators:** Translucent dark dot for empty squares, hollow ring for captures — same visual language as most modern chess apps
- **Responsive layout:** Three-column layout on desktop (left panel → board → right panel), collapses to single column on mobile

---

## 🚀 Bonus Phase (Coming)

- **AI Opponent** — Minimax algorithm with alpha-beta pruning. The engine can already evaluate any position; adding AI means giving it a scoring function (material + position tables) and searching ahead several moves.
- **Online Multiplayer** — Node.js server + WebSockets. Each game gets a room ID; moves are broadcast to both players in real time.

---

## 🛠️ How to Run

No build step. No dependencies. No server required.

```bash
# Just open the file
open index.html

# Or serve locally if you prefer
npx serve .
python -m http.server 8080
```

Works in any modern browser (Chrome, Firefox, Safari, Edge).

---

## 📚 What I Learned

- **Chess rules are deceptively complex.** The basic moves are simple; the edge cases (castling through check, en passant timing, promotion mid-check) require careful sequencing.
- **Immutability is your friend.** Writing `applyMove` to always return a new board (never mutate) made the legal-move filter, undo, and future AI search trivially straightforward.
- **Separate concerns early.** Keeping the engine (pure functions operating on arrays) completely separate from the renderer (DOM manipulation) made both easier to reason about and debug.
- **Attack detection is the engine's backbone.** `isSquareAttacked` is called from castling validation, legal move filtering, and checkmate detection — getting it right once meant everything else just worked.

---

*Built with  by Itumeleng — vanilla JS, no libraries, all logic from scratch with the help of AI here and there .*
