const test = require('node:test');
const assert = require('node:assert/strict');

const { ELIMINATE_TARGET, SURVIVOR_HP } = require('../src/server/constants');
const {
  createGame,
  createNewPlayer,
  createInputState,
  collidesWithWall,
  reconcileRoundStatus,
  resetGameRound,
  spawnCiphers,
} = require('../src/server/game-state');
const { checkWinConditions } = require('../src/server/game-rules');

function addPlayer(game, id, role) {
  const player = createNewPlayer(game, id, role);
  game.players.set(id, player);
  return player;
}

test('resetGameRound resets board progress and player state for rematch', () => {
  const game = createGame();
  const hunter = addPlayer(game, 'hunter-1', 'hunter');
  const survivor = addPlayer(game, 'survivor-1', 'survivor');

  game.status = 'hunter_won';
  game.decodedCount = 4;
  game.eliminatedCount = 2;
  game.escapedCount = 1;
  game.gate.open = true;
  game.ciphers[0].progress = 88;
  game.ciphers[0].done = true;
  game.chairs[0].occupant = survivor.id;
  game.chairs[0].countdown = 12;
  game.chairs[0].rescueProgress = 45;

  hunter.carrying = survivor.id;
  hunter.input = { ...createInputState(), up: true };
  survivor.carriedBy = hunter.id;
  survivor.state = 'on_chair';
  survivor.hp = 0;

  const spawns = [
    { x: 111, y: 222 },
    { x: 333, y: 444 },
  ];
  let spawnIndex = 0;

  resetGameRound(game, {
    spawnPlayer: () => spawns[spawnIndex++],
  });

  assert.equal(game.status, 'playing');
  assert.equal(game.gate.open, false);
  assert.equal(game.decodedCount, 0);
  assert.equal(game.eliminatedCount, 0);
  assert.equal(game.escapedCount, 0);

  for (const cipher of game.ciphers) {
    assert.equal(cipher.progress, 0);
    assert.equal(cipher.done, false);
  }

  for (const chair of game.chairs) {
    assert.equal(chair.occupant, null);
    assert.equal(chair.countdown, 0);
    assert.equal(chair.rescueProgress, 0);
  }

  assert.deepEqual({ x: hunter.x, y: hunter.y }, spawns[0]);
  assert.deepEqual({ x: survivor.x, y: survivor.y }, spawns[1]);
  assert.equal(hunter.state, 'normal');
  assert.equal(survivor.state, 'normal');
  assert.equal(survivor.hp, SURVIVOR_HP);
  assert.deepEqual(hunter.input, createInputState());
  assert.equal(hunter.carrying, null);
  assert.equal(survivor.carriedBy, null);
});

test('checkWinConditions declares hunter win at eliminate target', () => {
  const game = createGame();

  game.status = 'playing';
  game.eliminatedCount = ELIMINATE_TARGET;

  assert.equal(checkWinConditions(game), 'hunter_won');
  assert.equal(game.status, 'hunter_won');
});

test('checkWinConditions declares survivors win once everyone else is gone after an escape', () => {
  const game = createGame();
  addPlayer(game, 'hunter-1', 'hunter');
  const survivorA = addPlayer(game, 'survivor-1', 'survivor');
  const survivorB = addPlayer(game, 'survivor-2', 'survivor');

  game.status = 'playing';
  game.escapedCount = 1;
  survivorA.state = 'escaped';
  survivorB.state = 'eliminated';

  assert.equal(checkWinConditions(game), 'survivors_won');
  assert.equal(game.status, 'survivors_won');
});

test('reconcileRoundStatus moves between lobby, waiting, and playing based on roster', () => {
  const game = createGame();
  const hunter = addPlayer(game, 'hunter-1', 'hunter');

  assert.equal(reconcileRoundStatus(game), 'lobby');
  assert.equal(game.status, 'lobby');

  const survivor = addPlayer(game, 'survivor-1', 'survivor');
  assert.equal(reconcileRoundStatus(game), 'playing');
  assert.equal(game.status, 'playing');

  game.players.delete(survivor.id);
  assert.equal(reconcileRoundStatus(game), 'waiting');
  assert.equal(game.status, 'waiting');

  game.players.set(survivor.id, survivor);
  assert.equal(reconcileRoundStatus(game), 'playing');
  assert.equal(game.status, 'playing');

  game.status = 'hunter_won';
  game.players.delete(hunter.id);
  assert.equal(reconcileRoundStatus(game), 'hunter_won');
  assert.equal(game.status, 'hunter_won');
});

test('spawnCiphers skips wall-overlapping positions', () => {
  const values = [
    0.3387096774, 0.4523809524,
    0.0161290323, 0.1428571429,
    0.9838709677, 0.1428571429,
    0.0161290323, 0.6428571429,
    0.9838709677, 0.6428571429,
    0.5, 0.9047619048,
  ];
  let index = 0;
  const random = () => {
    const value = values[index];
    index = Math.min(index + 1, values.length - 1);
    return value;
  };

  const ciphers = spawnCiphers({ random });

  assert.equal(ciphers.length, 5);
  assert.ok(ciphers.every((cipher) => !collidesWithWall(cipher.x, cipher.y, 24)));
  assert.deepEqual(
    ciphers.map((cipher) => ({ x: Math.round(cipher.x), y: Math.round(cipher.y) })),
    [
      { x: 100, y: 150 },
      { x: 700, y: 150 },
      { x: 100, y: 360 },
      { x: 700, y: 360 },
      { x: 400, y: 470 },
    ]
  );
});
