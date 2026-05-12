const { test, expect } = require('@playwright/test');

async function waitForScene(page) {
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    return !!(
      window.Phaser &&
      window.Phaser.GAMES &&
      window.Phaser.GAMES[0] &&
      window.Phaser.GAMES[0].scene &&
      window.Phaser.GAMES[0].scene.keys &&
      window.Phaser.GAMES[0].scene.keys.GameScene &&
      window.Phaser.GAMES[0].scene.keys.GameScene.currState
    );
  });
}

async function sceneSnapshot(page) {
  return page.evaluate(() => {
    const scene = window.Phaser.GAMES[0].scene.keys.GameScene;
    const self = scene.currState.players.find((player) => player.id === scene.myId);
    return {
      myId: scene.myId,
      myRole: scene.myRole,
      status: scene.currState.status,
      players: scene.currState.players.map((player) => ({
        id: player.id,
        role: player.role,
        x: player.x,
        y: player.y,
        state: player.state,
      })),
      self: self ? { x: self.x, y: self.y, state: self.state } : null,
    };
  });
}

test('two clients can join and start a round', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await waitForScene(pageA);
  let snapshotA = await sceneSnapshot(pageA);
  expect(snapshotA.myRole).toBe('hunter');
  expect(snapshotA.status).toBe('lobby');

  await waitForScene(pageB);
  await pageA.waitForFunction(() => {
    const scene = window.Phaser.GAMES[0].scene.keys.GameScene;
    return scene.currState && scene.currState.players.length >= 2;
  });
  await pageB.waitForFunction(() => {
    const scene = window.Phaser.GAMES[0].scene.keys.GameScene;
    return scene.currState && scene.currState.players.length >= 2;
  });

  snapshotA = await sceneSnapshot(pageA);
  const snapshotB = await sceneSnapshot(pageB);

  expect(snapshotB.myRole).toBe('survivor');
  expect(snapshotA.status).toBe('playing');
  expect(snapshotB.status).toBe('playing');
  expect(snapshotA.players).toHaveLength(2);
  expect(snapshotB.players).toHaveLength(2);

  const beforeMove = snapshotB.self;
  await pageB.keyboard.down('d');
  await pageB.waitForTimeout(700);
  await pageB.keyboard.up('d');
  await pageB.waitForTimeout(300);

  const afterMove = await sceneSnapshot(pageB);
  expect(afterMove.self.x).toBeGreaterThan(beforeMove.x);
  expect(afterMove.self.state).toBe('normal');

  await contextA.close();
  await contextB.close();
});
