const {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_RADIUS,
  SURVIVOR_HP,
  GATE_POSITION,
  WALLS,
  SURVIVOR_SPAWNS,
  HUNTER_SPAWN,
  CHAIR_POSITIONS,
  HUNTER_HP,
  CIPHER_TOTAL,
  CHAIR_COUNTDOWN_TICKS,
  ELIMINATE_TARGET,
  SPOTTED_RANGE,
  COLLISION_RADIUS,
  RANDOM_SPAWN_MARGIN,
  RANDOM_SPAWN_ATTEMPTS,
  CIPHER_SPAWN_MARGIN,
  CIPHER_SPAWN_ATTEMPTS,
  CIPHER_MIN_DISTANCE,
  RESULT_STATUSES,
} = require('./constants');

function createInputState() {
  return { up: false, down: false, left: false, right: false, action: false, click: null };
}

function hpForRole(role) {
  return role === 'survivor' ? SURVIVOR_HP : HUNTER_HP;
}

function createRoundReadyState(role, spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    hp: hpForRole(role),
    state: 'normal',
    input: createInputState(),
    decoding: null,
    rescuing: null,
    carrying: null,
    carriedBy: null,
    attackCooldown: 0,
  };
}

function countPlayers(game, predicate) {
  let count = 0;
  for (const player of game.players.values()) {
    if (predicate(player)) count++;
  }
  return count;
}

function countPlayersByRole(game, role) {
  return countPlayers(game, (player) => player.role === role);
}

function canStartRound(game) {
  return countPlayersByRole(game, 'hunter') >= 1 && countPlayersByRole(game, 'survivor') >= 1;
}

function isSurvivorAlive(player) {
  return player.role === 'survivor'
    && (player.state === 'normal' || player.state === 'down' || player.state === 'on_chair');
}

function clearChairState(chair) {
  chair.occupant = null;
  chair.countdown = 0;
  chair.rescueProgress = 0;
}

function collidesWithWall(x, y, radius) {
  for (const wall of WALLS) {
    if (x + radius > wall.x &&
        x - radius < wall.x + wall.w &&
        y + radius > wall.y &&
        y - radius < wall.y + wall.h) {
      return true;
    }
  }
  return false;
}

function randomSpawn({ random = Math.random } = {}) {
  for (let i = 0; i < RANDOM_SPAWN_ATTEMPTS; i++) {
    const x = RANDOM_SPAWN_MARGIN + random() * (GAME_WIDTH - 2 * RANDOM_SPAWN_MARGIN);
    const y = RANDOM_SPAWN_MARGIN + random() * (GAME_HEIGHT - 2 * RANDOM_SPAWN_MARGIN);
    if (!collidesWithWall(x, y, COLLISION_RADIUS + 4)) {
      return { x, y };
    }
  }
  return { x: HUNTER_SPAWN.x, y: HUNTER_SPAWN.y };
}

function isCipherPositionValid(ciphers, x, y) {
  if (collidesWithWall(x, y, COLLISION_RADIUS + 8)) {
    return false;
  }

  return ciphers.every((cipher) => Math.hypot(cipher.x - x, cipher.y - y) > CIPHER_MIN_DISTANCE);
}

function spawnCiphers({ random = Math.random } = {}) {
  const ciphers = [];
  let attempts = 0;

  while (ciphers.length < CIPHER_TOTAL && attempts < CIPHER_SPAWN_ATTEMPTS) {
    attempts++;
    const x = CIPHER_SPAWN_MARGIN + random() * (GAME_WIDTH - 2 * CIPHER_SPAWN_MARGIN);
    const y = CIPHER_SPAWN_MARGIN + random() * (GAME_HEIGHT - 2 * CIPHER_SPAWN_MARGIN);

    if (isCipherPositionValid(ciphers, x, y)) {
      ciphers.push({ id: ciphers.length, x, y, progress: 0, done: false });
    }
  }

  return ciphers;
}

function spawnChairs() {
  return CHAIR_POSITIONS.map((position, index) => ({
    id: index,
    x: position.x,
    y: position.y,
    occupant: null,
    countdown: 0,
    rescueProgress: 0,
  }));
}

function createGame(options = {}) {
  return {
    status: 'lobby',
    players: new Map(),
    ciphers: spawnCiphers(options),
    chairs: spawnChairs(),
    gate: { x: GATE_POSITION.x, y: GATE_POSITION.y, open: false },
    decodedCount: 0,
    eliminatedCount: 0,
    escapedCount: 0,
  };
}

function createNewPlayer(game, id, role) {
  const survivorIndex = countPlayersByRole(game, 'survivor');
  const spawn = role === 'hunter'
    ? HUNTER_SPAWN
    : SURVIVOR_SPAWNS[survivorIndex % SURVIVOR_SPAWNS.length];

  return {
    id,
    role,
    ...createRoundReadyState(role, spawn),
  };
}

function reconcileRoundStatus(game) {
  if (RESULT_STATUSES.has(game.status)) {
    return game.status;
  }

  if (game.players.size === 0) {
    game.status = 'lobby';
    return game.status;
  }

  if (canStartRound(game)) {
    game.status = 'playing';
    return game.status;
  }

  game.status = game.status === 'lobby' ? 'lobby' : 'waiting';
  return game.status;
}

function resetGameRound(game, { spawnPlayer = () => randomSpawn() } = {}) {
  for (const cipher of game.ciphers) {
    cipher.progress = 0;
    cipher.done = false;
  }

  for (const chair of game.chairs) {
    clearChairState(chair);
  }

  game.gate.open = false;
  game.decodedCount = 0;
  game.eliminatedCount = 0;
  game.escapedCount = 0;

  for (const player of game.players.values()) {
    Object.assign(player, createRoundReadyState(player.role, spawnPlayer(player)));
  }

  game.status = 'waiting';
  reconcileRoundStatus(game);
  return game;
}

function isPlayerSpotted(player, hunters) {
  if (player.role !== 'survivor' || player.state !== 'normal') return false;

  for (const hunter of hunters) {
    if (Math.hypot(player.x - hunter.x, player.y - hunter.y) < SPOTTED_RANGE) {
      return true;
    }
  }

  return false;
}

function buildBroadcastState(game) {
  const hunters = [...game.players.values()].filter(
    (player) => player.role === 'hunter' && player.state === 'normal'
  );

  return {
    status: game.status,
    chairCountdownMax: CHAIR_COUNTDOWN_TICKS,
    eliminateTarget: ELIMINATE_TARGET,
    cipherTotal: CIPHER_TOTAL,
    players: [...game.players.values()].map((player) => ({
      id: player.id,
      role: player.role,
      x: Math.round(player.x),
      y: Math.round(player.y),
      hp: player.hp,
      state: player.state,
      decoding: player.decoding,
      rescuing: player.rescuing,
      carrying: player.carrying,
      carriedBy: player.carriedBy,
      attackCooldown: player.attackCooldown,
      spotted: isPlayerSpotted(player, hunters),
    })),
    ciphers: game.ciphers.map((cipher) => ({
      id: cipher.id,
      x: cipher.x,
      y: cipher.y,
      progress: Math.round(cipher.progress),
      done: cipher.done,
    })),
    chairs: game.chairs.map((chair) => ({
      id: chair.id,
      x: chair.x,
      y: chair.y,
      occupant: chair.occupant,
      countdown: chair.countdown,
      rescueProgress: Math.round(chair.rescueProgress),
    })),
    gate: game.gate,
    decodedCount: game.decodedCount,
    eliminatedCount: game.eliminatedCount,
    escapedCount: game.escapedCount,
  };
}

module.exports = {
  buildBroadcastState,
  canStartRound,
  clearChairState,
  collidesWithWall,
  countPlayers,
  countPlayersByRole,
  createGame,
  createInputState,
  createNewPlayer,
  createRoundReadyState,
  hpForRole,
  isSurvivorAlive,
  isCipherPositionValid,
  randomSpawn,
  reconcileRoundStatus,
  resetGameRound,
  spawnCiphers,
};
