const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const SERVER_URL = process.env.SMOKE_URL || 'http://172.21.103.137:3000';
const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';

async function waitForScene(page) {
  await page.goto(SERVER_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__gameScene);
  const debug = await page.evaluate(() => {
    return {
      hasScene: !!window.__gameScene,
      hasGame: !!window.__phaserGame,
      sceneKey: window.__gameScene && window.__gameScene.sys && window.__gameScene.sys.settings
        ? window.__gameScene.sys.settings.key
        : null,
    };
  });
  console.log(`scene-debug ${JSON.stringify(debug)}`);
  await page.waitForFunction(() => {
    return !!window.__gameScene;
  });
  await page.waitForFunction(() => {
    const scene = window.__gameScene;
    return !!(scene.socket && scene.socket.connected);
  });
  await page.waitForFunction(() => {
    const scene = window.__gameScene;
    return !!scene.currState;
  });
}

async function getSnapshot(page) {
  return page.evaluate(() => {
    const scene = window.__gameScene;
    const players = scene.currState.players.map((player) => ({
      id: player.id,
      role: player.role,
      x: player.x,
      y: player.y,
      state: player.state,
    }));
    const self = players.find((player) => player.id === scene.myId) || null;
    return {
      myId: scene.myId,
      myRole: scene.myRole,
      status: scene.currState.status,
      players,
      self,
    };
  });
}

async function waitForPlayerCount(page, count) {
  await page.waitForFunction((expectedCount) => {
    const scene = window.__gameScene;
    return scene.currState && scene.currState.players.length >= expectedCount;
  }, count);
}

async function main() {
  console.log(`connecting to ${CDP_URL}`);
  const browser = await chromium.connectOverCDP(CDP_URL);
  console.log('connected');
  const context = browser.contexts()[0];
  const existingPages = context.pages();
  const pageA = existingPages[0] || await context.newPage();
  for (const page of existingPages.slice(1)) {
    await page.close();
  }
  console.log('prepared pageA');
  const pageB = await context.newPage();
  pageA.on('console', (message) => console.log(`[pageA:${message.type()}] ${message.text()}`));
  pageB.on('console', (message) => console.log(`[pageB:${message.type()}] ${message.text()}`));
  pageA.on('pageerror', (error) => console.log(`[pageA:error] ${error.message}`));
  pageB.on('pageerror', (error) => console.log(`[pageB:error] ${error.message}`));
  console.log('opened two pages');

  await waitForScene(pageA);
  console.log('pageA ready');
  let snapshotA = await getSnapshot(pageA);
  assert.equal(snapshotA.myRole, 'hunter');
  assert.equal(snapshotA.status, 'lobby');

  await waitForScene(pageB);
  console.log('pageB ready');
  await waitForPlayerCount(pageA, 2);
  await waitForPlayerCount(pageB, 2);
  await pageA.waitForFunction(() => {
    const scene = window.__gameScene;
    return scene.currState.status === 'playing';
  });
  await pageB.waitForFunction(() => {
    const scene = window.__gameScene;
    return scene.currState.status === 'playing';
  });
  console.log('both pages in playing state');

  snapshotA = await getSnapshot(pageA);
  const snapshotB = await getSnapshot(pageB);

  assert.equal(snapshotB.myRole, 'survivor');
  assert.equal(snapshotA.players.length, 2);
  assert.equal(snapshotB.players.length, 2);

  const survivorOnHunterViewBefore = snapshotA.players.find((player) => player.id === snapshotB.myId);
  const survivorBefore = snapshotB.self;

  await pageB.locator('canvas').click({ position: { x: 100, y: 100 } });
  await pageB.keyboard.down('d');
  await pageB.waitForTimeout(800);
  await pageB.keyboard.up('d');
  await pageB.waitForTimeout(400);
  console.log('movement input sent');

  const snapshotBAfter = await getSnapshot(pageB);
  const snapshotAAfter = await getSnapshot(pageA);
  const survivorAfter = snapshotBAfter.self;
  const survivorOnHunterViewAfter = snapshotAAfter.players.find((player) => player.id === snapshotB.myId);

  assert.ok(survivorAfter.x > survivorBefore.x, 'survivor should move to the right on local view');
  assert.ok(
    survivorOnHunterViewAfter.x > survivorOnHunterViewBefore.x,
    'survivor movement should propagate to the other client'
  );

  console.log(JSON.stringify({
    ok: true,
    url: SERVER_URL,
    roles: [snapshotA.myRole, snapshotB.myRole],
    status: snapshotBAfter.status,
    survivorMove: {
      localBefore: survivorBefore.x,
      localAfter: survivorAfter.x,
      remoteBefore: survivorOnHunterViewBefore.x,
      remoteAfter: survivorOnHunterViewAfter.x,
    },
  }, null, 2));

  await pageA.close();
  await pageB.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
