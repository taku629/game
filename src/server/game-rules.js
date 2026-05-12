const {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_RADIUS,
  GATE_HALF_W,
  GATE_HALF_H,
  TICK_RATE,
  SURVIVOR_SPEED,
  HUNTER_SPEED,
  CARRY_SPEED_MULT,
  INTERACTION_RANGE,
  ATTACK_RANGE,
  ATTACK_COOLDOWN_TICKS,
  SURVIVOR_HP,
  CIPHER_TOTAL,
  CIPHER_DECODE_PER_TICK_PER_DECODER,
  RESCUE_PER_TICK_PER_RESCUER,
  CHAIR_COUNTDOWN_TICKS,
  ELIMINATE_TARGET,
  COLLISION_RADIUS,
} = require('./constants');
const {
  clearChairState,
  collidesWithWall,
  countPlayers,
  countPlayersByRole,
  isSurvivorAlive,
} = require('./game-state');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildGameOverPayload(game) {
  return {
    winner: game.status === 'survivors_won' ? 'survivors' : 'hunter',
    decodedCount: game.decodedCount,
    eliminatedCount: game.eliminatedCount,
    escapedCount: game.escapedCount,
  };
}

function stepMovement(game) {
  for (const player of game.players.values()) {
    if (player.state !== 'normal') continue;

    let speed = player.role === 'hunter' ? HUNTER_SPEED : SURVIVOR_SPEED;
    if (player.carrying) speed *= CARRY_SPEED_MULT;

    let vx = 0;
    let vy = 0;
    if (player.input.left) vx -= 1;
    if (player.input.right) vx += 1;
    if (player.input.up) vy -= 1;
    if (player.input.down) vy += 1;

    if (vx !== 0 || vy !== 0) {
      const length = Math.hypot(vx, vy);
      vx /= length;
      vy /= length;

      const nextX = clamp(player.x + vx * speed / TICK_RATE, PLAYER_RADIUS, GAME_WIDTH - PLAYER_RADIUS);
      const nextY = clamp(player.y + vy * speed / TICK_RATE, PLAYER_RADIUS, GAME_HEIGHT - PLAYER_RADIUS);

      if (!collidesWithWall(nextX, nextY, COLLISION_RADIUS)) {
        player.x = nextX;
        player.y = nextY;
      }

      player.decoding = null;
      player.rescuing = null;
    }

    if (player.carrying) {
      const carried = game.players.get(player.carrying);
      if (carried && carried.state === 'down') {
        carried.x = player.x;
        carried.y = player.y - 6;
      }
    }
  }
}

function updateActionEdges(game, lastActionState) {
  for (const player of game.players.values()) {
    const wasPressed = lastActionState.get(player.id) || false;
    const isPressed = !!player.input.action;
    player.actionJustPressed = isPressed && !wasPressed;
    lastActionState.set(player.id, isPressed);
  }
}

function stepHunterActions(game) {
  for (const player of game.players.values()) {
    if (player.role !== 'hunter' || player.state !== 'normal') continue;

    if (player.attackCooldown > 0) player.attackCooldown--;

    if (player.input.click && player.attackCooldown === 0 && !player.carrying) {
      let nearest = null;
      let nearestDist = ATTACK_RANGE;

      for (const survivor of game.players.values()) {
        if (survivor.role !== 'survivor' || survivor.state !== 'normal') continue;
        const distance = Math.hypot(survivor.x - player.x, survivor.y - player.y);
        if (distance < nearestDist) {
          nearest = survivor;
          nearestDist = distance;
        }
      }

      if (nearest) {
        nearest.hp -= 1;
        player.attackCooldown = ATTACK_COOLDOWN_TICKS;

        if (nearest.hp <= 0) {
          nearest.state = 'down';
          nearest.decoding = null;
          nearest.rescuing = null;
        }
      }
    }

    player.input.click = null;

    if (!player.actionJustPressed) continue;

    if (player.carrying) {
      const chair = game.chairs.find(
        (entry) => !entry.occupant && Math.hypot(entry.x - player.x, entry.y - player.y) < INTERACTION_RANGE
      );

      if (!chair) continue;

      const carried = game.players.get(player.carrying);
      if (carried) {
        chair.occupant = carried.id;
        chair.countdown = CHAIR_COUNTDOWN_TICKS;
        chair.rescueProgress = 0;
        carried.state = 'on_chair';
        carried.x = chair.x;
        carried.y = chair.y;
        carried.carriedBy = null;
      }

      player.carrying = null;
      continue;
    }

    const downed = [...game.players.values()].find(
      (survivor) => survivor.role === 'survivor'
        && survivor.state === 'down'
        && !survivor.carriedBy
        && Math.hypot(survivor.x - player.x, survivor.y - player.y) < INTERACTION_RANGE
    );

    if (downed) {
      downed.carriedBy = player.id;
      player.carrying = downed.id;
    }
  }
}

function stepSurvivorActions(game) {
  for (const player of game.players.values()) {
    if (player.role !== 'survivor' || player.state !== 'normal') continue;

    if (!player.input.action) {
      player.decoding = null;
      player.rescuing = null;
      continue;
    }

    const chair = game.chairs.find(
      (entry) => entry.occupant && Math.hypot(entry.x - player.x, entry.y - player.y) < INTERACTION_RANGE
    );
    if (chair) {
      player.rescuing = chair.id;
      player.decoding = null;
      continue;
    }

    const cipher = game.ciphers.find(
      (entry) => !entry.done && Math.hypot(entry.x - player.x, entry.y - player.y) < INTERACTION_RANGE
    );
    if (cipher) {
      player.decoding = cipher.id;
      player.rescuing = null;
    } else {
      player.decoding = null;
      player.rescuing = null;
    }
  }
}

function stepActions(game, lastActionState) {
  updateActionEdges(game, lastActionState);
  stepHunterActions(game);
  stepSurvivorActions(game);
}

function stepCiphers(game) {
  for (const cipher of game.ciphers) {
    if (cipher.done) continue;

    let decoders = 0;
    for (const player of game.players.values()) {
      if (player.decoding === cipher.id && player.state === 'normal') decoders++;
    }

    if (decoders <= 0) continue;

    cipher.progress += CIPHER_DECODE_PER_TICK_PER_DECODER * decoders;
    if (cipher.progress >= 100) {
      cipher.progress = 100;
      cipher.done = true;
      game.decodedCount++;
      if (game.decodedCount >= CIPHER_TOTAL) {
        game.gate.open = true;
      }
    }
  }
}

function stepChairs(game) {
  for (const chair of game.chairs) {
    if (!chair.occupant) continue;

    const occupant = game.players.get(chair.occupant);
    if (!occupant || occupant.state !== 'on_chair') {
      clearChairState(chair);
      continue;
    }

    let rescuers = 0;
    for (const player of game.players.values()) {
      if (player.rescuing === chair.id && player.state === 'normal') rescuers++;
    }

    if (rescuers > 0) {
      chair.rescueProgress += RESCUE_PER_TICK_PER_RESCUER * rescuers;
      if (chair.rescueProgress >= 100) {
        occupant.state = 'normal';
        occupant.hp = Math.min(1, SURVIVOR_HP);
        clearChairState(chair);
      }
      continue;
    }

    if (chair.rescueProgress > 0) {
      chair.rescueProgress = Math.max(0, chair.rescueProgress - 0.5);
    }

    chair.countdown--;
    if (chair.countdown <= 0) {
      occupant.state = 'eliminated';
      clearChairState(chair);
      game.eliminatedCount++;
    }
  }
}

function stepEscape(game) {
  if (!game.gate.open) return;

  for (const player of game.players.values()) {
    if (player.role !== 'survivor' || player.state !== 'normal') continue;
    if (Math.abs(player.x - game.gate.x) < GATE_HALF_W + PLAYER_RADIUS &&
        Math.abs(player.y - game.gate.y) < GATE_HALF_H) {
      player.state = 'escaped';
      game.escapedCount++;
    }
  }
}

function checkWinConditions(game) {
  if (game.eliminatedCount >= ELIMINATE_TARGET) {
    game.status = 'hunter_won';
    return game.status;
  }

  const survivorsTotal = countPlayersByRole(game, 'survivor');
  const stillAlive = countPlayers(game, isSurvivorAlive);

  if (survivorsTotal > 0 && stillAlive === 0) {
    game.status = game.escapedCount > 0 ? 'survivors_won' : 'hunter_won';
  }

  return game.status;
}

function tickGame(game, lastActionState) {
  stepMovement(game);
  stepActions(game, lastActionState);
  stepCiphers(game);
  stepChairs(game);
  stepEscape(game);
  checkWinConditions(game);
}

module.exports = {
  buildGameOverPayload,
  checkWinConditions,
  tickGame,
};
