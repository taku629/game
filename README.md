# 第五人格風ゲーム

Node.js + Express + Phaser.js で作る 2D トップダウン非対称マルチプレイヤーゲームのプロトタイプ。

## 技術スタック

- **サーバー**: Node.js + Express
- **クライアント**: Phaser.js 3 (2D ゲームエンジン)
- **通信**: 未実装（TODO参照）

## セットアップ

```bash
npm install
npm start
```

ブラウザで http://localhost:3000 を開く。

## 操作方法

| キー | 動作 |
|------|------|
| W    | 上移動 |
| A    | 左移動 |
| S    | 下移動 |
| D    | 右移動 |

## ディレクトリ構成

```
game/
├── server.js          # Express サーバー
├── package.json
├── public/
│   ├── index.html     # エントリーポイント
│   └── js/
│       └── game.js    # Phaser.js ゲームロジック
├── README.md
└── CLAUDE.md          # AI向け開発ガイド・TODO
```
