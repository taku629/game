const {
  TICK_MS,
  BROADCAST_INTERVAL_MS,
  RESULT_STATUSES,
} = require('./constants');
const {
  buildBroadcastState,
  clearChairState,
  createGame,
  createNewPlayer,
  randomSpawn,
  reconcileRoundStatus,
  resetGameRound,
} = require('./game-state');
const {
  buildGameOverPayload,
  tickGame,
} = require('./game-rules');

function createGameServer(io) {
  let game = createGame();
  const lastActionState = new Map();
  const rematchRequests = new Set();
  let prevStatus = 'lobby';

  function resetGameState() {
    game = createGame();
    lastActionState.clear();
    rematchRequests.clear();
    prevStatus = 'lobby';
  }

  function isResultStatus(status) {
    return RESULT_STATUSES.has(status);
  }

  function emitInitToPlayers() {
    for (const player of game.players.values()) {
      io.to(player.id).emit('init', { id: player.id, role: player.role });
    }
  }

  function pruneRematchRequests() {
    for (const id of [...rematchRequests]) {
      if (!game.players.has(id)) rematchRequests.delete(id);
    }
  }

  function broadcastRematchStatus() {
    io.emit('rematch_requested', {
      requested: rematchRequests.size,
      total: game.players.size,
    });
  }

  function performRematch() {
    resetGameRound(game, { spawnPlayer: () => randomSpawn() });
    rematchRequests.clear();
    lastActionState.clear();
    prevStatus = game.status;
    emitInitToPlayers();
    broadcastRematchStatus();
  }

  function applyPlayerInput(player, input) {
    if (!input || typeof input !== 'object') return;

    player.input.up = !!input.up;
    player.input.down = !!input.down;
    player.input.left = !!input.left;
    player.input.right = !!input.right;
    player.input.action = !!input.action;

    if (input.click && typeof input.click.x === 'number') {
      player.input.click = { x: input.click.x, y: input.click.y };
    }
  }

  function disconnectPlayer(socketId) {
    const player = game.players.get(socketId);
    if (player && player.carrying) {
      const carried = game.players.get(player.carrying);
      if (carried) carried.carriedBy = null;
    }

    if (player && player.carriedBy) {
      const hunter = game.players.get(player.carriedBy);
      if (hunter) hunter.carrying = null;
    }

    for (const chair of game.chairs) {
      if (chair.occupant === socketId) {
        clearChairState(chair);
      }
    }

    game.players.delete(socketId);
    lastActionState.delete(socketId);
    rematchRequests.delete(socketId);

    if (game.players.size === 0) {
      resetGameState();
      return;
    }

    if (isResultStatus(game.status) && rematchRequests.size >= game.players.size) {
      performRematch();
      return;
    }

    reconcileRoundStatus(game);
    broadcastRematchStatus();
  }

  function attachSocketHandlers(socket) {
    const hasHunter = [...game.players.values()].some((player) => player.role === 'hunter');
    const role = hasHunter ? 'survivor' : 'hunter';
    const player = createNewPlayer(game, socket.id, role);
    game.players.set(socket.id, player);

    socket.emit('init', { id: socket.id, role });
    broadcastRematchStatus();

    reconcileRoundStatus(game);

    socket.on('request_rematch', () => {
      if (!isResultStatus(game.status)) return;
      if (!game.players.has(socket.id)) return;

      rematchRequests.add(socket.id);
      pruneRematchRequests();

      if (game.players.size > 0 && rematchRequests.size >= game.players.size) {
        performRematch();
      } else {
        broadcastRematchStatus();
      }
    });

    socket.on('input', (input) => {
      const currentPlayer = game.players.get(socket.id);
      if (!currentPlayer) return;
      applyPlayerInput(currentPlayer, input);
    });

    socket.on('disconnect', () => {
      disconnectPlayer(socket.id);
    });
  }

  function tick() {
    if (game.status === 'playing') {
      tickGame(game, lastActionState);
    }

    if (game.status !== prevStatus) {
      if (isResultStatus(game.status)) {
        io.emit('gameover', buildGameOverPayload(game));
      }
      prevStatus = game.status;
    }
  }

  function broadcast() {
    io.emit('state', buildBroadcastState(game));
  }

  function start() {
    io.on('connection', attachSocketHandlers);
    setInterval(tick, TICK_MS);
    setInterval(broadcast, BROADCAST_INTERVAL_MS);
  }

  return { start };
}

module.exports = { createGameServer };
