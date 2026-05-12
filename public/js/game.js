(() => {
const {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_RADIUS,
  CIPHER_RADIUS,
  SURVIVOR_HP,
  GATE_HALF_W,
  GATE_HALF_H,
  WALLS,
} = window.GAME_CONSTANTS;

const MINIMAP_W = 160;
const MINIMAP_H = 120;
const MINIMAP_PAD = 12;
const MINIMAP_X = GAME_WIDTH - MINIMAP_W - MINIMAP_PAD;
const MINIMAP_Y = GAME_HEIGHT - MINIMAP_H - MINIMAP_PAD;
const MINIMAP_SX = MINIMAP_W / GAME_WIDTH;
const MINIMAP_SY = MINIMAP_H / GAME_HEIGHT;
const LOCAL_PLAYER_OUTLINE_RADIUS = PLAYER_RADIUS + 2;
const CHAIR_HALF_SIZE = 14;

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    if (typeof window !== 'undefined') {
      window.__gameScene = this;
    }
    this.socket = io();
    this.myId = null;
    this.myRole = null;
    this.prevState = null;
    this.currState = null;
    this.stateRecvAt = 0;
    this.gameOver = null;
    this.lastClick = null;
    this.rematchSent = false;
    this.rematchInfo = { requested: 0, total: 0 };
    this.initReceivedOnce = false;

    this.socket.on('init', (d) => {
      this.myId = d.id;
      this.myRole = d.role;
      // 再戦時の init 再受信でリザルト画面を片付ける
      if (this.initReceivedOnce) {
        this.gameOver = null;
        this.rematchSent = false;
      }
      this.initReceivedOnce = true;
    });
    this.socket.on('state', (s) => {
      this.prevState = this.currState;
      this.currState = s;
      this.stateRecvAt = performance.now();
      if (s.status === 'lobby' || s.status === 'playing' || s.status === 'waiting') {
        this.gameOver = null;
        this.rematchSent = false;
      }
    });
    this.socket.on('gameover', (g) => {
      this.gameOver = g;
    });
    this.socket.on('rematch_requested', (info) => {
      this.rematchInfo = info || { requested: 0, total: 0 };
    });

    this.drawStaticBackground();

    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      action: Phaser.Input.Keyboard.KeyCodes.F,
    });

    // 第二引数 currentlyOver にインタラクティブUI要素が入っていたら
    // ワールド座標クリックとして記録しない（ボタンクリックが攻撃判定に流れない）
    this.input.on('pointerdown', (pointer, currentlyOver) => {
      if (currentlyOver && currentlyOver.length > 0) return;
      this.lastClick = { x: pointer.worldX, y: pointer.worldY };
    });

    this.dynamic = this.add.graphics().setDepth(10);

    this.uiText = this.add.text(10, 10, '', {
      font: '12px monospace',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.55)',
      padding: { x: 6, y: 4 },
    }).setDepth(900);

    // Prominent remaining cipher count (top-center)
    this.cipherCountText = this.add.text(GAME_WIDTH / 2, 14, '', {
      font: 'bold 22px monospace',
      color: '#ffe066',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 12, y: 6 },
      align: 'center',
    }).setOrigin(0.5, 0).setDepth(900);

    this.hintText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 16, '', {
      font: '12px monospace',
      color: '#aaaaaa',
    }).setOrigin(0.5, 1).setDepth(900);

    // Spotted warning: pulsing red border + text
    this.warningGfx = this.add.graphics().setDepth(950).setVisible(false);
    this.warningText = this.add.text(GAME_WIDTH / 2, 60, 'WARNING — HUNTER NEARBY', {
      font: 'bold 16px monospace',
      color: '#ff3333',
      backgroundColor: 'rgba(0,0,0,0.65)',
      padding: { x: 10, y: 4 },
    }).setOrigin(0.5, 0).setDepth(951).setVisible(false);

    // Minimap
    this.minimap = this.add.graphics().setDepth(960);

    // Result screen
    this.resultOverlay = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7
    ).setDepth(1000).setVisible(false);
    this.resultTitle = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 70, '', {
      font: 'bold 52px monospace',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5).setDepth(1001).setVisible(false);
    this.resultSubtitle = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, '', {
      font: '18px monospace',
      color: '#cccccc',
      align: 'center',
    }).setOrigin(0.5).setDepth(1001).setVisible(false);
    this.resultStats = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, '', {
      font: '16px monospace',
      color: '#ffffff',
      backgroundColor: 'rgba(255,255,255,0.08)',
      padding: { x: 14, y: 10 },
      align: 'left',
    }).setOrigin(0.5).setDepth(1001).setVisible(false);
    this.rematchBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 130, '', {
      font: 'bold 18px monospace',
      color: '#ffffff',
      backgroundColor: '#226633',
      padding: { x: 26, y: 12 },
      align: 'center',
    }).setOrigin(0.5).setDepth(1002).setVisible(false);
    this.rematchBtn.setInteractive({ useHandCursor: true });
    this.rematchBtn.on('pointerover', () => {
      if (!this.rematchSent) this.rematchBtn.setBackgroundColor('#2e8a44');
    });
    this.rematchBtn.on('pointerout', () => {
      if (!this.rematchSent) this.rematchBtn.setBackgroundColor('#226633');
    });
    this.rematchBtn.on('pointerdown', () => {
      if (this.rematchSent) return;
      const s = this.currState;
      const inResult = !!this.gameOver
        || (s && (s.status === 'survivors_won' || s.status === 'hunter_won'));
      if (!inResult) return;
      this.socket.emit('request_rematch');
      this.rematchSent = true;
    });

    this.resultHint = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 185, 'Or reload (F5)', {
      font: '12px monospace',
      color: '#777777',
    }).setOrigin(0.5).setDepth(1001).setVisible(false);

    // Lobby/waiting overlay (used pre-game)
    this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
      font: 'bold 28px monospace',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setDepth(990).setVisible(false);
  }

  drawStaticBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1a1a2e);
    const g = this.add.graphics();
    g.lineStyle(1, 0x2a2a4e, 0.5);
    for (let x = 0; x <= GAME_WIDTH; x += 40) g.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y <= GAME_HEIGHT; y += 40) g.lineBetween(0, y, GAME_WIDTH, y);
    g.lineStyle(2, 0x4a4a8a, 1);
    g.strokeRect(2, 2, GAME_WIDTH - 4, GAME_HEIGHT - 4);

    // Walls (depth 0, default — below dynamic graphics at depth 10)
    g.fillStyle(0x888888, 1);
    g.lineStyle(1, 0x444444, 1);
    for (const w of WALLS) {
      g.fillRect(w.x, w.y, w.w, w.h);
      g.strokeRect(w.x, w.y, w.w, w.h);
    }
  }

  update(time) {
    const input = {
      up: this.keys.up.isDown,
      down: this.keys.down.isDown,
      left: this.keys.left.isDown,
      right: this.keys.right.isDown,
      action: this.keys.action.isDown,
      click: this.lastClick,
    };
    this.socket.emit('input', input);
    this.lastClick = null;

    if (!this.currState) return;
    this.render(time);
  }

  interpolatedPos(player) {
    if (!this.prevState) return { x: player.x, y: player.y };
    const prev = this.prevState.players.find((pp) => pp.id === player.id);
    if (!prev) return { x: player.x, y: player.y };
    const dt = performance.now() - this.stateRecvAt;
    const t = Math.max(0, Math.min(1, dt / 100));
    return {
      x: prev.x + (player.x - prev.x) * t,
      y: prev.y + (player.y - prev.y) * t,
    };
  }

  render(time) {
    const state = this.currState;
    this.dynamic.clear();

    this.renderGate(state);
    this.renderCiphers(state);
    this.renderChairs(state);
    this.renderPlayers(state);
    this.renderHud(state, time);
  }

  renderGate(state) {
    const gateColor = state.gate.open ? 0x33ff66 : 0x444444;
    this.dynamic.fillStyle(gateColor, 0.85);
    this.dynamic.fillRect(
      state.gate.x - GATE_HALF_W,
      state.gate.y - GATE_HALF_H,
      GATE_HALF_W * 2,
      GATE_HALF_H * 2
    );
    this.dynamic.lineStyle(2, 0xffffff, 0.6);
    this.dynamic.strokeRect(
      state.gate.x - GATE_HALF_W,
      state.gate.y - GATE_HALF_H,
      GATE_HALF_W * 2,
      GATE_HALF_H * 2
    );
  }

  renderCiphers(state) {
    for (const cipher of state.ciphers) {
      const fill = cipher.done ? 0x33ff66 : 0x885533;
      this.dynamic.fillStyle(fill, 1);
      this.dynamic.fillCircle(cipher.x, cipher.y, CIPHER_RADIUS);
      this.dynamic.lineStyle(2, 0xffffff, 0.7);
      this.dynamic.strokeCircle(cipher.x, cipher.y, CIPHER_RADIUS);
      this.dynamic.lineStyle(1, 0xffcc66, 0.9);
      this.dynamic.lineBetween(cipher.x - 8, cipher.y, cipher.x + 8, cipher.y);
      this.dynamic.lineBetween(cipher.x, cipher.y - 8, cipher.x, cipher.y + 8);
      if (!cipher.done && cipher.progress > 0) {
        this.drawBar(cipher.x, cipher.y - (CIPHER_RADIUS + 10), cipher.progress / 100, 0x33ccff);
      }
    }
  }

  renderChairs(state) {
    for (const chair of state.chairs) {
      this.dynamic.fillStyle(0x553322, 1);
      this.dynamic.fillRect(chair.x - CHAIR_HALF_SIZE, chair.y - CHAIR_HALF_SIZE, 28, 28);
      this.dynamic.lineStyle(2, 0x222222, 1);
      this.dynamic.strokeRect(chair.x - CHAIR_HALF_SIZE, chair.y - CHAIR_HALF_SIZE, 28, 28);
      this.dynamic.lineStyle(1, 0xaa6633, 1);
      this.dynamic.lineBetween(chair.x - CHAIR_HALF_SIZE, chair.y - CHAIR_HALF_SIZE, chair.x + CHAIR_HALF_SIZE, chair.y + CHAIR_HALF_SIZE);
      this.dynamic.lineBetween(chair.x + CHAIR_HALF_SIZE, chair.y - CHAIR_HALF_SIZE, chair.x - CHAIR_HALF_SIZE, chair.y + CHAIR_HALF_SIZE);
      if (chair.occupant) {
        this.drawBar(chair.x, chair.y + 26, chair.countdown / state.chairCountdownMax, 0xff4444);
        if (chair.rescueProgress > 0) {
          this.drawBar(chair.x, chair.y + 34, chair.rescueProgress / 100, 0x33ccff);
        }
      }
    }
  }

  renderPlayers(state) {
    for (const player of state.players) {
      if (this.isInactivePlayer(player)) continue;

      const pos = this.getRenderedPlayerPosition(player);
      const isMe = player.id === this.myId;

      this.dynamic.fillStyle(this.getWorldPlayerColor(player), this.getWorldPlayerAlpha(player));
      this.dynamic.fillCircle(pos.x, pos.y, PLAYER_RADIUS);

      if (isMe) {
        this.dynamic.lineStyle(2, 0xffff00, 1);
        this.dynamic.strokeCircle(pos.x, pos.y, LOCAL_PLAYER_OUTLINE_RADIUS);
      } else {
        this.dynamic.lineStyle(1, 0x000000, 0.6);
        this.dynamic.strokeCircle(pos.x, pos.y, PLAYER_RADIUS);
      }

      if (player.role === 'survivor' && player.state === 'normal' && player.hp < SURVIVOR_HP) {
        this.dynamic.fillStyle(0xff3333, 1);
        this.dynamic.fillRect(pos.x - 10, pos.y - 22, 20, 3);
      }
      if (player.state === 'down') {
        this.dynamic.lineStyle(2, 0xff3333, 1);
        this.dynamic.lineBetween(pos.x - 8, pos.y - 8, pos.x + 8, pos.y + 8);
        this.dynamic.lineBetween(pos.x + 8, pos.y - 8, pos.x - 8, pos.y + 8);
      }
    }
  }

  renderHud(state, time) {
    const myPlayer = this.findPlayer(state.players, this.myId);
    this.updatePlayerHud(state, myPlayer);
    this.updateCipherHud(state);
    this.updateHintText();
    this.renderWarning(this.isLocalPlayerSpotted(state, myPlayer), time);
    this.renderMinimap(state);
    this.renderOverlay(state);
  }

  findPlayer(players, playerId) {
    return players.find((player) => player.id === playerId);
  }

  isInactivePlayer(player) {
    return player.state === 'eliminated' || player.state === 'escaped';
  }

  getRenderedPlayerPosition(player) {
    if (player.state === 'on_chair' || player.state === 'down') {
      return { x: player.x, y: player.y };
    }
    return this.interpolatedPos(player);
  }

  getWorldPlayerColor(player) {
    return player.role === 'hunter' ? 0xff3344 : 0xffffff;
  }

  getWorldPlayerAlpha(player) {
    if (player.state === 'down') return 0.5;
    if (player.state === 'on_chair') return 0.6;
    return 1;
  }

  updatePlayerHud(state, myPlayer) {
    const myStateLabel = myPlayer ? myPlayer.state : '-';
    const myHp = myPlayer && myPlayer.role === 'survivor' ? `${myPlayer.hp}/${SURVIVOR_HP}` : '-';
    this.uiText.setText(
      `Role: ${this.myRole || '...'}   State: ${myStateLabel}   HP: ${myHp}\n` +
      `Eliminated: ${state.eliminatedCount}/${state.eliminateTarget}   Escaped: ${state.escapedCount}   Players: ${state.players.length}`
    );
  }

  updateCipherHud(state) {
    const remaining = state.cipherTotal - state.decodedCount;
    const gateLabel = state.gate.open ? '   GATE OPEN' : '';
    this.cipherCountText.setText(`残り暗号機  ${remaining} / ${state.cipherTotal}${gateLabel}`);
    this.cipherCountText.setColor(state.gate.open ? '#33ff66' : '#ffe066');
  }

  updateHintText() {
    const hint = this.myRole === 'hunter'
      ? 'WASD: move   Click: attack   F: pickup/drop downed survivor'
      : 'WASD: move   F (hold): decode cipher / rescue from chair   Reach gate to escape';
    this.hintText.setText(hint);
  }

  isLocalPlayerSpotted(state, myPlayer) {
    return !!(
      myPlayer
      && myPlayer.role === 'survivor'
      && myPlayer.spotted
      && state.status === 'playing'
    );
  }

  renderWarning(spotted, time) {
    if (!spotted) {
      this.warningGfx.setVisible(false);
      this.warningText.setVisible(false);
      return;
    }
    const pulse = 0.45 + 0.45 * Math.sin(time * 0.012);
    this.warningGfx.clear();
    this.warningGfx.lineStyle(8, 0xff0000, pulse);
    this.warningGfx.strokeRect(4, 4, GAME_WIDTH - 8, GAME_HEIGHT - 8);
    this.warningGfx.setVisible(true);
    this.warningText.setVisible(true);
    this.warningText.setAlpha(0.5 + 0.5 * Math.sin(time * 0.012));
  }

  renderMinimap(s) {
    const m = this.minimap;
    m.clear();

    // Background
    m.fillStyle(0x000000, 0.65);
    m.fillRect(MINIMAP_X - 2, MINIMAP_Y - 2, MINIMAP_W + 4, MINIMAP_H + 4);
    m.lineStyle(1, 0xaaaaaa, 0.8);
    m.strokeRect(MINIMAP_X - 2, MINIMAP_Y - 2, MINIMAP_W + 4, MINIMAP_H + 4);

    // Map area
    m.fillStyle(0x1a1a2e, 0.95);
    m.fillRect(MINIMAP_X, MINIMAP_Y, MINIMAP_W, MINIMAP_H);

    // Gate
    const gateColor = s.gate.open ? 0x33ff66 : 0x666666;
    m.fillStyle(gateColor, 1);
    m.fillRect(this.minimapX(s.gate.x) - 1, this.minimapY(s.gate.y) - 8, 3, 16);

    // Ciphers
    for (const c of s.ciphers) {
      m.fillStyle(c.done ? 0x33ff66 : 0xddaa44, 1);
      m.fillCircle(this.minimapX(c.x), this.minimapY(c.y), 3);
    }

    // Chairs (only show occupied ones to reduce clutter; all show as small squares)
    for (const ch of s.chairs) {
      m.fillStyle(ch.occupant ? 0xff8855 : 0x553322, 1);
      m.fillRect(this.minimapX(ch.x) - 2, this.minimapY(ch.y) - 2, 4, 4);
    }

    // Players
    for (const p of s.players) {
      if (this.isInactivePlayer(p)) continue;
      const isMe = p.id === this.myId;
      // Hunters are visible to survivors only on minimap if you want fog-of-war.
      // Current spec: full minimap visibility (no fog) — survivors see hunter.
      m.fillStyle(this.getMinimapPlayerColor(p, isMe), 1);
      m.fillCircle(this.minimapX(p.x), this.minimapY(p.y), isMe ? 3.5 : 2.5);
      if (isMe) {
        m.lineStyle(1, 0x000000, 1);
        m.strokeCircle(this.minimapX(p.x), this.minimapY(p.y), 3.5);
      }
    }
  }

  minimapX(x) {
    return MINIMAP_X + x * MINIMAP_SX;
  }

  minimapY(y) {
    return MINIMAP_Y + y * MINIMAP_SY;
  }

  getMinimapPlayerColor(player, isMe) {
    if (player.state === 'down') return 0x884444;
    if (player.role === 'hunter') return 0xff3344;
    return isMe ? 0xffff00 : 0xffffff;
  }

  renderOverlay(s) {
    if (this.shouldShowResultOverlay(s)) {
      this.renderResultOverlay(s);
      return;
    }

    this.setResultUiVisible(false);
    this.minimap.setVisible(true);

    if (s.status === 'lobby' || s.status === 'waiting') {
      this.statusText.setText('Waiting for players...').setVisible(true);
    } else {
      this.statusText.setVisible(false);
    }
  }

  shouldShowResultOverlay(state) {
    return !!this.gameOver || state.status === 'survivors_won' || state.status === 'hunter_won';
  }

  renderResultOverlay(state) {
    this.statusText.setVisible(false);

    const winner = (this.gameOver && this.gameOver.winner)
      || (state.status === 'survivors_won' ? 'survivors' : 'hunter');
    const decoded = (this.gameOver && this.gameOver.decodedCount) || state.decodedCount;
    const escaped = (this.gameOver && this.gameOver.escapedCount) || state.escapedCount;
    const eliminated = (this.gameOver && this.gameOver.eliminatedCount) || state.eliminatedCount;
    const isWin = (winner === 'survivors' && this.myRole === 'survivor')
      || (winner === 'hunter' && this.myRole === 'hunter');
    const titleText = winner === 'survivors' ? 'SURVIVORS WIN' : 'HUNTER WINS';
    const titleColor = winner === 'survivors' ? '#66ddff' : '#ff5555';
    const subtitle = isWin ? 'You Win!' : (this.myRole ? 'You Lose...' : 'Game Over');
    const stats =
      `暗号機解読     ${decoded} / ${state.cipherTotal}\n` +
      `脱出           ${escaped}\n` +
      `脱落           ${eliminated} / ${state.eliminateTarget}`;

    this.setResultUiVisible(true);
    this.resultTitle.setText(titleText).setColor(titleColor);
    this.resultSubtitle.setText(subtitle).setColor(isWin ? '#ffe066' : '#aaaaaa');
    this.resultStats.setText(stats);
    this.updateRematchButton(state);
    this.minimap.setVisible(false);
  }

  setResultUiVisible(visible) {
    this.resultOverlay.setVisible(visible);
    this.resultTitle.setVisible(visible);
    this.resultSubtitle.setVisible(visible);
    this.resultStats.setVisible(visible);
    this.resultHint.setVisible(visible);
    this.rematchBtn.setVisible(visible);
  }

  updateRematchButton(state) {
    const total = (this.rematchInfo && this.rematchInfo.total) || state.players.length;
    const requested = (this.rematchInfo && this.rematchInfo.requested) || 0;

    if (this.rematchSent) {
      this.rematchBtn.setText(`待機中... (${requested}/${total}人)`);
      this.rematchBtn.setBackgroundColor('#444444');
      this.rematchBtn.disableInteractive();
      return;
    }

    this.rematchBtn.setText('再戦する (Rematch)');
    this.rematchBtn.setBackgroundColor('#226633');
    if (!this.rematchBtn.input || !this.rematchBtn.input.enabled) {
      this.rematchBtn.setInteractive({ useHandCursor: true });
    }
  }

  drawBar(cx, cy, fraction, color) {
    const w = 44, h = 5;
    const f = Math.max(0, Math.min(1, fraction));
    this.dynamic.fillStyle(0x000000, 0.7);
    this.dynamic.fillRect(cx - w / 2 - 1, cy - h / 2 - 1, w + 2, h + 2);
    this.dynamic.fillStyle(color, 1);
    this.dynamic.fillRect(cx - w / 2, cy - h / 2, w * f, h);
  }
}

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1a1a2e',
  scene: GameScene,
};

window.__phaserGame = new Phaser.Game(config);
})();
