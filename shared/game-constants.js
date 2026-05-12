const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

const GAME_CONSTANTS = {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_RADIUS: 12,
  CIPHER_RADIUS: 18,
  SURVIVOR_HP: 2,
  GATE_HALF_W: 8,
  GATE_HALF_H: 40,
  GATE_POSITION: { x: GAME_WIDTH - 16, y: GAME_HEIGHT / 2 },
  WALLS: [
    { x: 250, y: 270, w: 300, h: 30 },
    { x: 80,  y: 80,  w: 120, h: 20 },
    { x: 600, y: 80,  w: 120, h: 20 },
    { x: 80,  y: 500, w: 120, h: 20 },
    { x: 600, y: 500, w: 120, h: 20 },
    { x: 150, y: 200, w: 20,  h: 150 },
    { x: 630, y: 200, w: 20,  h: 150 },
  ],
  SURVIVOR_SPAWNS: [
    { x: 60, y: 60 },
    { x: GAME_WIDTH - 60, y: 60 },
    { x: 60, y: GAME_HEIGHT - 60 },
    { x: GAME_WIDTH - 60, y: GAME_HEIGHT - 60 },
  ],
  // (400, 300) は中央横壁と衝突するため (400, 400) を使う
  HUNTER_SPAWN: { x: GAME_WIDTH / 2, y: 400 },
  CHAIR_POSITIONS: [
    { x: 200, y: 180 },
    { x: 600, y: 180 },
    { x: 200, y: 420 },
    { x: 600, y: 420 },
  ],
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GAME_CONSTANTS;
}

if (typeof window !== 'undefined') {
  window.GAME_CONSTANTS = GAME_CONSTANTS;
}
