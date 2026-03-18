/* ══════════════════════════════════════════════
   Itumeleng's Chess Board — chess.js
   Full Chess Engine: Phases 1–4
   ══════════════════════════════════════════════ */

// ── PIECE UNICODE MAP ──
const PIECES = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
};

// Material values (for score diff display)
const PIECE_VALUES = { K: 0, Q: 9, R: 5, B: 3, N: 3, P: 1 };

// ══════════════════════════════════════════════
//  GAME STATE
// ══════════════════════════════════════════════

let board;            // 8x8 array of piece strings or null
let currentTurn;      // 'w' or 'b'
let selectedSq;       // [r, c] or null
let legalMovesCache;  // cached legal moves for current position
let castlingRights;   // { wK, wQ, bK, bQ } booleans
let enPassantTarget;  // [r, c] or null
let halfMoveClock;
let fullMoveNumber;
let capturedByWhite;  // array of piece strings
let capturedByBlack;
let moveHistory;      // array of { w, b } notation pairs
let gameOver;
let stateHistory;     // for undo
let lastMove;         // { from:[r,c], to:[r,c] } for highlighting
let pendingPromotion; // saved state during promotion modal

// ══════════════════════════════════════════════
//  INITIALISATION
// ══════════════════════════════════════════════

function initialBoard() {
  const b = Array(8).fill(null).map(() => Array(8).fill(null));
  const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let c = 0; c < 8; c++) {
    b[0][c] = 'b' + backRank[c];
    b[1][c] = 'bP';
    b[6][c] = 'wP';
    b[7][c] = 'w' + backRank[c];
  }
  return b;
}

function initGame() {
  board           = initialBoard();
  currentTurn     = 'w';
  selectedSq      = null;
  legalMovesCache = null;
  castlingRights  = { wK: true, wQ: true, bK: true, bQ: true };
  enPassantTarget = null;
  halfMoveClock   = 0;
  fullMoveNumber  = 1;
  capturedByWhite = [];
  capturedByBlack = [];
  moveHistory     = [];
  gameOver        = false;
  stateHistory    = [];
  lastMove        = null;
  pendingPromotion = null;
  saveState();
}

// ── SNAPSHOT FOR UNDO ──
function saveState() {
  stateHistory.push({
    board:          board.map(r => [...r]),
    currentTurn,
    castlingRights: { ...castlingRights },
    enPassantTarget,
    halfMoveClock,
    fullMoveNumber,
    capturedByWhite: [...capturedByWhite],
    capturedByBlack: [...capturedByBlack],
    lastMove:        lastMove ? { ...lastMove } : null
  });
}

// ── PIECE HELPERS ──
const color = piece => piece ? piece[0] : null;
const type  = piece => piece ? piece[1] : null;
const enemy = c     => c === 'w' ? 'b' : 'w';

// ══════════════════════════════════════════════
//  MOVE GENERATION
// ══════════════════════════════════════════════

function isOnBoard(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

/**
 * Returns pseudo-legal moves (ignores own-king-in-check) for the
 * piece at (r, c) on board bd.
 */
function getPseudoMoves(bd, r, c, castRights, epTarget) {
  const piece = bd[r][c];
  if (!piece) return [];

  const col  = color(piece);
  const tp   = type(piece);
  const moves = [];

  // Helper: add move if in bounds and not own piece
  const add = (tr, tc, flags = {}) => {
    if (isOnBoard(tr, tc)) {
      const t = bd[tr][tc];
      if (!t || color(t) !== col) {
        moves.push({ r, c, tr, tc, ...flags });
      }
    }
  };

  // Helper: sliding piece ray
  const slide = (dr, dc) => {
    let nr = r + dr, nc = c + dc;
    while (isOnBoard(nr, nc)) {
      const t = bd[nr][nc];
      if (t) {
        if (color(t) !== col) moves.push({ r, c, tr: nr, tc: nc });
        break;
      }
      moves.push({ r, c, tr: nr, tc: nc });
      nr += dr; nc += dc;
    }
  };

  // ── PAWN ──
  if (tp === 'P') {
    const dir   = col === 'w' ? -1 : 1;
    const start = col === 'w' ? 6  : 1;

    // Single push
    if (isOnBoard(r + dir, c) && !bd[r + dir][c]) {
      moves.push({ r, c, tr: r + dir, tc: c });
      // Double push from starting rank
      if (r === start && !bd[r + 2 * dir][c]) {
        moves.push({ r, c, tr: r + 2 * dir, tc: c, doublePush: true });
      }
    }

    // Diagonal captures (including en passant)
    for (const dc of [-1, 1]) {
      const nr = r + dir, nc = c + dc;
      if (!isOnBoard(nr, nc)) continue;
      if (bd[nr][nc] && color(bd[nr][nc]) !== col) {
        moves.push({ r, c, tr: nr, tc: nc });
      }
      if (epTarget && epTarget[0] === nr && epTarget[1] === nc) {
        moves.push({ r, c, tr: nr, tc: nc, enPassant: true });
      }
    }
  }

  // ── KNIGHT ──
  if (tp === 'N') {
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      add(r + dr, c + dc);
    }
  }

  // ── BISHOP / QUEEN ──
  if (tp === 'B' || tp === 'Q') {
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) slide(dr, dc);
  }

  // ── ROOK / QUEEN ──
  if (tp === 'R' || tp === 'Q') {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) slide(dr, dc);
  }

  // ── KING ──
  if (tp === 'K') {
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      add(r + dr, c + dc);
    }

    // Castling
    const rank = col === 'w' ? 7 : 0;
    if (r === rank && c === 4) {
      const kRight = col === 'w' ? castRights.wK : castRights.bK;
      const qRight = col === 'w' ? castRights.wQ : castRights.bQ;
      const opp = enemy(col);

      // Kingside castling
      if (kRight &&
          !bd[rank][5] && !bd[rank][6] &&
          bd[rank][7] === col + 'R' &&
          !isSquareAttacked(bd, rank, 4, opp) &&
          !isSquareAttacked(bd, rank, 5, opp) &&
          !isSquareAttacked(bd, rank, 6, opp)) {
        moves.push({ r, c, tr: rank, tc: 6, castle: 'K' });
      }

      // Queenside castling
      if (qRight &&
          !bd[rank][3] && !bd[rank][2] && !bd[rank][1] &&
          bd[rank][0] === col + 'R' &&
          !isSquareAttacked(bd, rank, 4, opp) &&
          !isSquareAttacked(bd, rank, 3, opp) &&
          !isSquareAttacked(bd, rank, 2, opp)) {
        moves.push({ r, c, tr: rank, tc: 2, castle: 'Q' });
      }
    }
  }

  return moves;
}

/**
 * Returns true if square (r,c) is attacked by byColor on board bd.
 */
function isSquareAttacked(bd, r, c, byColor) {
  // Use empty castling rights to avoid infinite recursion
  const emptyCast = { wK: false, wQ: false, bK: false, bQ: false };
  for (let pr = 0; pr < 8; pr++) {
    for (let pc = 0; pc < 8; pc++) {
      if (color(bd[pr][pc]) !== byColor) continue;
      const moves = getPseudoMoves(bd, pr, pc, emptyCast, null);
      if (moves.some(m => m.tr === r && m.tc === c)) return true;
    }
  }
  return false;
}

/**
 * Returns a new board state after applying move.
 * Also returns the captured piece, new en-passant target, and new castling rights.
 */
function applyMove(bd, move, castRights, epTarget) {
  const nb      = bd.map(row => [...row]);
  const piece   = nb[move.r][move.c];
  const col     = color(piece);
  let captured  = nb[move.tr][move.tc];
  let newEP     = null;
  const newCast = { ...castRights };

  // Move piece
  nb[move.tr][move.tc] = piece;
  nb[move.r][move.c]   = null;

  // En passant capture
  if (move.enPassant) {
    captured = nb[move.r][move.tc];
    nb[move.r][move.tc] = null;
  }

  // Double pawn push sets en passant target
  if (move.doublePush) {
    newEP = [(move.r + move.tr) / 2, move.c];
  }

  // Castling — move the rook
  if (move.castle) {
    const rank = move.r;
    if (move.castle === 'K') {
      nb[rank][5] = nb[rank][7];
      nb[rank][7] = null;
    } else {
      nb[rank][3] = nb[rank][0];
      nb[rank][0] = null;
    }
  }

  // Update castling rights
  if (type(piece) === 'K') {
    newCast[col + 'K'] = false;
    newCast[col + 'Q'] = false;
  }
  if (move.r  === 7 && move.c  === 7 || move.tr === 7 && move.tc === 7) newCast.wK = false;
  if (move.r  === 7 && move.c  === 0 || move.tr === 7 && move.tc === 0) newCast.wQ = false;
  if (move.r  === 0 && move.c  === 7 || move.tr === 0 && move.tc === 7) newCast.bK = false;
  if (move.r  === 0 && move.c  === 0 || move.tr === 0 && move.tc === 0) newCast.bQ = false;

  return { board: nb, captured, newEP, newCast };
}

/**
 * Returns true if col's king is in check on bd.
 */
function isInCheck(bd, col) {
  let kr = -1, kc = -1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (bd[r][c] === col + 'K') { kr = r; kc = c; }
    }
  }
  return isSquareAttacked(bd, kr, kc, enemy(col));
}

/**
 * Returns all fully legal moves for col (moves that don't leave own king in check).
 */
function getLegalMoves(bd, col, castRights, epTarget) {
  const legal = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (color(bd[r][c]) !== col) continue;
      const pseudo = getPseudoMoves(bd, r, c, castRights, epTarget);
      for (const mv of pseudo) {
        const { board: nb } = applyMove(bd, mv, castRights, epTarget);
        if (!isInCheck(nb, col)) legal.push(mv);
      }
    }
  }
  return legal;
}

/**
 * Returns legal moves originating from square (r, c).
 */
function getMovesFrom(r, c) {
  if (!legalMovesCache) {
    legalMovesCache = getLegalMoves(board, currentTurn, castlingRights, enPassantTarget);
  }
  return legalMovesCache.filter(m => m.r === r && m.c === c);
}

// ══════════════════════════════════════════════
//  ALGEBRAIC NOTATION
// ══════════════════════════════════════════════

function toAlgebraic(move, bd) {
  const piece = bd[move.r][move.c];
  const tp    = type(piece);
  const files = 'abcdefgh';
  const toSq  = files[move.tc] + (8 - move.tr);

  if (move.castle === 'K') return 'O-O';
  if (move.castle === 'Q') return 'O-O-O';

  let notation = '';
  if (tp !== 'P') {
    notation += tp;
  } else if (bd[move.tr][move.tc] || move.enPassant) {
    notation += files[move.c]; // pawn file prefix on capture
  }
  if (bd[move.tr][move.tc] || move.enPassant) notation += 'x';
  notation += toSq;
  if (move.promote) notation += '=' + move.promote;
  return notation;
}

// ══════════════════════════════════════════════
//  EXECUTE & FINALIZE MOVES
// ══════════════════════════════════════════════

function executeMove(move) {
  const piece    = board[move.r][move.c];
  const tp       = type(piece);
  const col      = color(piece);
  const notation = toAlgebraic(move, board);

  const { board: nb, captured, newEP, newCast } = applyMove(board, move, castlingRights, enPassantTarget);

  // Pawn promotion — show modal, pause until user chooses
  if (tp === 'P' && (move.tr === 0 || move.tr === 7)) {
    if (!move.promote) {
      pendingPromotion = { move, nb, captured, newEP, newCast, notation };
      showPromotionModal(col);
      return;
    }
    nb[move.tr][move.tc] = col + move.promote;
  }

  finalizeMove(move, nb, captured, newEP, newCast, notation, move.promote || null);
}

function finalizeMove(move, nb, captured, newEP, newCast, notation, promoPiece) {
  const col = color(board[move.r][move.c]);

  if (captured) {
    if (col === 'w') capturedByWhite.push(captured);
    else             capturedByBlack.push(captured);
  }

  lastMove        = { from: [move.r, move.c], to: [move.tr, move.tc] };
  board           = nb;
  castlingRights  = newCast;
  enPassantTarget = newEP;
  legalMovesCache = null;
  currentTurn     = enemy(col);
  selectedSq      = null;

  if (col === 'b') fullMoveNumber++;

  // Record move in history
  const fullNote = notation + (promoPiece ? '=' + promoPiece : '');
  if (col === 'w') {
    moveHistory.push({ w: fullNote, b: null });
  } else if (moveHistory.length) {
    moveHistory[moveHistory.length - 1].b = fullNote;
  }

  saveState();
  renderAll();
  checkGameStatus();
}

// ══════════════════════════════════════════════
//  GAME STATUS CHECKS
// ══════════════════════════════════════════════

function checkGameStatus() {
  legalMovesCache = getLegalMoves(board, currentTurn, castlingRights, enPassantTarget);
  const inCheck = isInCheck(board, currentTurn);
  const noMoves = legalMovesCache.length === 0;

  const statusEl = document.getElementById('status-msg');
  statusEl.className = 'status-msg';

  if (noMoves && inCheck) {
    const winner = enemy(currentTurn) === 'w' ? 'White' : 'Black';
    statusEl.textContent = '♛ Checkmate!';
    statusEl.className   = 'status-msg checkmate';
    showGameOver('Checkmate!', `${winner} wins the crown`);
    gameOver = true;

  } else if (noMoves) {
    statusEl.textContent = '⚖ Stalemate';
    statusEl.className   = 'status-msg stalemate';
    showGameOver('Stalemate', 'The game ends in a draw');
    gameOver = true;

  } else if (inCheck) {
    statusEl.textContent = '⚠ Check!';
    statusEl.className   = 'status-msg check';

  } else {
    statusEl.textContent = 'Game in progress';
  }
}

// ══════════════════════════════════════════════
//  MODALS & BANNERS
// ══════════════════════════════════════════════

function showGameOver(title, sub) {
  const banner = document.getElementById('game-over-banner');
  document.getElementById('banner-title').textContent = title;
  document.getElementById('banner-sub').textContent   = sub;
  banner.classList.add('show');
}

function showPromotionModal(col) {
  const modal       = document.getElementById('promo-modal');
  const choicesEl   = document.getElementById('promo-choices');
  choicesEl.innerHTML = '';

  const promoTypes = ['Q', 'R', 'B', 'N'];
  const whiteSymbols = { Q: '♕', R: '♖', B: '♗', N: '♘' };
  const blackSymbols = { Q: '♛', R: '♜', B: '♝', N: '♞' };
  const symbols = col === 'w' ? whiteSymbols : blackSymbols;

  promoTypes.forEach(tp => {
    const btn = document.createElement('button');
    btn.className   = 'promo-btn';
    btn.textContent = symbols[tp];
    if (col === 'b') btn.style.color = '#1a1008';

    btn.onclick = () => {
      modal.classList.remove('show');
      const { move, nb, captured, newEP, newCast, notation } = pendingPromotion;
      nb[move.tr][move.tc] = col + tp;
      finalizeMove(move, nb, captured, newEP, newCast, notation, tp);
      pendingPromotion = null;
    };

    choicesEl.appendChild(btn);
  });

  modal.classList.add('show');
}

// ══════════════════════════════════════════════
//  RENDERING
// ══════════════════════════════════════════════

function renderAll() {
  renderBoard();
  renderPanels();
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  const inCheck = isInCheck(board, currentTurn);
  let kingCheckSq = null;
  if (inCheck) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c] === currentTurn + 'K') kingCheckSq = [r, c];
      }
    }
  }

  const highlightMoves = selectedSq ? getMovesFrom(selectedSq[0], selectedSq[1]) : [];
  const moveSqs        = new Set(highlightMoves.map(m => `${m.tr},${m.tc}`));
  const captureSqs     = new Set(
    highlightMoves
      .filter(m => board[m.tr][m.tc] || m.enPassant)
      .map(m => `${m.tr},${m.tc}`)
  );

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq      = document.createElement('div');
      const isLight = (r + c) % 2 === 0;
      sq.className  = 'square ' + (isLight ? 'light' : 'dark');
      sq.dataset.r  = r;
      sq.dataset.c  = c;

      // Last move highlight
      if (lastMove) {
        const [fr, fc] = lastMove.from;
        const [tr, tc] = lastMove.to;
        if ((r === fr && c === fc) || (r === tr && c === tc)) {
          sq.classList.add('last-move');
        }
      }

      // Selected square
      if (selectedSq && selectedSq[0] === r && selectedSq[1] === c) {
        sq.classList.add('selected');
      }

      // King in check
      if (kingCheckSq && kingCheckSq[0] === r && kingCheckSq[1] === c) {
        sq.classList.add('in-check');
      }

      // Legal move indicators
      if (moveSqs.has(`${r},${c}`)) {
        const dot = document.createElement('div');
        dot.className = 'move-dot';
        if (captureSqs.has(`${r},${c}`)) {
          sq.classList.add('can-capture');
        }
        sq.appendChild(dot);
      }

      // Piece
      const piece = board[r][c];
      if (piece) {
        const pieceEl       = document.createElement('span');
        pieceEl.className   = 'piece ' + (color(piece) === 'w' ? 'white' : 'black');
        pieceEl.textContent = PIECES[piece];
        sq.appendChild(pieceEl);
      }

      sq.addEventListener('click', () => handleClick(r, c));
      boardEl.appendChild(sq);
    }
  }
}

// ── CLICK HANDLER ──
function handleClick(r, c) {
  if (gameOver) return;
  const piece = board[r][c];

  // If a piece is already selected, try to move to clicked square
  if (selectedSq) {
    const moves = getMovesFrom(selectedSq[0], selectedSq[1]);
    const move  = moves.find(m => m.tr === r && m.tc === c);
    if (move) {
      executeMove(move);
      return;
    }
  }

  // Select own piece
  if (piece && color(piece) === currentTurn) {
    selectedSq = [r, c];
    renderBoard();
  } else {
    selectedSq = null;
    renderBoard();
  }
}

// ── PANEL RENDERING ──
function renderPanels() {
  document.getElementById('turn-name').textContent = currentTurn === 'w' ? 'White' : 'Black';
  document.getElementById('turn-icon').textContent = currentTurn === 'w' ? '♔' : '♚';

  renderCaptured('white-captured', capturedByWhite);
  renderCaptured('black-captured', capturedByBlack);

  // Material advantage
  const ws   = capturedByWhite.reduce((s, p) => s + (PIECE_VALUES[type(p)] || 0), 0);
  const bs   = capturedByBlack.reduce((s, p) => s + (PIECE_VALUES[type(p)] || 0), 0);
  const diff = ws - bs;
  document.getElementById('score-diff').textContent =
    diff > 0  ? `White +${diff}` :
    diff < 0  ? `Black +${-diff}` :
                'Even material';

  renderMoveHistory();
}

function renderCaptured(elId, pieces) {
  const el = document.getElementById(elId);
  el.innerHTML = '';
  pieces
    .slice()
    .sort((a, b) => (PIECE_VALUES[type(b)] || 0) - (PIECE_VALUES[type(a)] || 0))
    .forEach(p => {
      const sp       = document.createElement('span');
      sp.className   = 'cap-piece ' + (color(p) === 'w' ? 'white' : 'black');
      sp.textContent = PIECES[p];
      el.appendChild(sp);
    });
}

function renderMoveHistory() {
  const el = document.getElementById('move-history');
  el.innerHTML = '';
  moveHistory.forEach((pair, i) => {
    const row       = document.createElement('div');
    row.className   = 'move-pair';
    row.innerHTML   = `
      <span class="move-num">${i + 1}.</span>
      <span class="move-notation">${pair.w || ''}</span>
      <span class="move-notation">${pair.b || ''}</span>`;
    el.appendChild(row);
  });
  el.scrollTop = el.scrollHeight;
}

// ── COORDINATE LABELS ──
function renderCoords() {
  const files   = 'abcdefgh';
  const filesEl = document.getElementById('files-top');
  const ranksEl = document.getElementById('ranks-left');
  filesEl.innerHTML = '';
  ranksEl.innerHTML = '';

  for (let i = 0; i < 8; i++) {
    const f       = document.createElement('span');
    f.className   = 'coord-label';
    f.textContent = files[i];
    filesEl.appendChild(f);
  }

  for (let i = 0; i < 8; i++) {
    const r       = document.createElement('span');
    r.className   = 'coord-label';
    r.textContent = 8 - i;
    ranksEl.appendChild(r);
  }
}

// ══════════════════════════════════════════════
//  UNDO & RESTART
// ══════════════════════════════════════════════

function undoMove() {
  if (stateHistory.length <= 1) return;

  stateHistory.pop();
  const prev = stateHistory[stateHistory.length - 1];

  board           = prev.board.map(r => [...r]);
  currentTurn     = prev.currentTurn;
  castlingRights  = { ...prev.castlingRights };
  enPassantTarget = prev.enPassantTarget;
  halfMoveClock   = prev.halfMoveClock;
  fullMoveNumber  = prev.fullMoveNumber;
  capturedByWhite = [...prev.capturedByWhite];
  capturedByBlack = [...prev.capturedByBlack];
  lastMove        = prev.lastMove ? { ...prev.lastMove } : null;

  // Roll back move history
  if (moveHistory.length > 0) {
    const last = moveHistory[moveHistory.length - 1];
    if (last.b) {
      last.b = null;
    } else {
      moveHistory.pop();
    }
  }

  legalMovesCache = null;
  selectedSq      = null;
  gameOver        = false;

  document.getElementById('game-over-banner').classList.remove('show');
  document.getElementById('status-msg').className   = 'status-msg';
  document.getElementById('status-msg').textContent = 'Game in progress';

  renderAll();
  checkGameStatus();
}

function restartGame() {
  document.getElementById('game-over-banner').classList.remove('show');
  initGame();
  renderCoords();
  renderAll();
  checkGameStatus();
}

// ══════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════

initGame();
renderCoords();
renderAll();
checkGameStatus();