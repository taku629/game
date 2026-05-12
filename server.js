const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const { createGameServer } = require('./src/server/game-server');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

createGameServer(io).start();

httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
