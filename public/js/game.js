const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const PLAYER_SPEED = 160;
const PLAYER_SIZE = 20;

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.createMap();
    this.createPlayer();
    this.cursors = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
  }

  createMap() {
    // 背景（暗い石畳風）
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1a1a2e);

    // グリッド線（マップ感を演出）
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x2a2a4e, 0.5);
    for (let x = 0; x <= GAME_WIDTH; x += 40) {
      graphics.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += 40) {
      graphics.lineBetween(0, y, GAME_WIDTH, y);
    }

    // 外壁
    graphics.lineStyle(2, 0x4a4a8a, 1);
    graphics.strokeRect(2, 2, GAME_WIDTH - 4, GAME_HEIGHT - 4);

    // WASDヒント
    this.add.text(16, 16, 'WASD: 移動', {
      font: '14px monospace',
      color: '#888888',
    });
  }

  createPlayer() {
    // プレイヤー（白い円）
    const gfx = this.add.graphics();
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(0, 0, PLAYER_SIZE / 2);
    gfx.generateTexture('player', PLAYER_SIZE, PLAYER_SIZE);
    gfx.destroy();

    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'player');
    this.player.setCollideWorldBounds(true);
  }

  update() {
    const { up, down, left, right } = this.cursors;
    let vx = 0;
    let vy = 0;

    if (left.isDown) vx = -PLAYER_SPEED;
    else if (right.isDown) vx = PLAYER_SPEED;

    if (up.isDown) vy = -PLAYER_SPEED;
    else if (down.isDown) vy = PLAYER_SPEED;

    // 斜め移動を正規化
    if (vx !== 0 && vy !== 0) {
      const norm = 1 / Math.SQRT2;
      vx *= norm;
      vy *= norm;
    }

    this.player.setVelocity(vx, vy);
  }
}

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1a1a2e',
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: GameScene,
};

new Phaser.Game(config);
