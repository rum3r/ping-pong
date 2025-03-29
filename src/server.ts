import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import path from "path";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, "../")));

// Store connected players and their game states
interface Player {
  ws: WebSocket;
  playerNumber: number;
  gameId: string;
}

const players: Player[] = [];
const activeGames: Map<string, Player[]> = new Map();

wss.on("connection", (ws) => {
  console.log("New player connected");

  // Send initial connection message
  ws.send(JSON.stringify({ type: "connected" }));

  // Add player to queue
  const player: Player = {
    ws,
    playerNumber: 0,
    gameId: "",
  };
  players.push(player);
  console.log("Total players in queue:", players.length);

  // Try to start a game if there are enough players
  tryStartGame();

  // Broadcast initial player count
  broadcastPlayerCount();

  ws.on("message", (message: string) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case "paddleMove":
        broadcastToGame(player.gameId, {
          type: "paddleMove",
          playerNumber: player.playerNumber,
          y: data.y,
        });
        break;

      case "ballUpdate":
        broadcastToGame(player.gameId, {
          type: "ballUpdate",
          x: data.x,
          y: data.y,
        });
        break;

      case "scoreUpdate":
        broadcastToGame(player.gameId, {
          type: "scoreUpdate",
          playerNumber: data.playerNumber,
          score: data.score,
        });
        break;

      case "gameOver":
        broadcastToGame(player.gameId, {
          type: "gameOver",
          winner: data.winner,
        });
        break;
    }
  });

  ws.on("close", () => {
    console.log("Player disconnected");
    // Remove player from queue if they're still there
    const index = players.findIndex((p) => p.ws === ws);
    if (index !== -1) {
      players.splice(index, 1);
    }
    // Remove player from active game if they're in one
    for (const [gameId, gamePlayers] of activeGames.entries()) {
      const playerIndex = gamePlayers.findIndex((p) => p.ws === ws);
      if (playerIndex !== -1) {
        gamePlayers.splice(playerIndex, 1);
        if (gamePlayers.length === 0) {
          activeGames.delete(gameId);
        }
        break;
      }
    }
    // Broadcast updated player count
    broadcastPlayerCount();
  });
});

function tryStartGame() {
  // Get all players that are not in a game
  const waitingPlayers = players.filter((p) => !p.gameId);
  console.log("Waiting players:", waitingPlayers.length);

  if (waitingPlayers.length >= 2) {
    // Take the first two waiting players
    const player1 = waitingPlayers[0];
    const player2 = waitingPlayers[1];
    const gameId = Math.random().toString(36).substring(7);

    // Assign player numbers
    player1.gameId = gameId;
    player2.gameId = gameId;
    player1.playerNumber = 1; // First player gets W/S keys
    player2.playerNumber = 2; // Second player gets Arrow keys

    // Add to active games
    activeGames.set(gameId, [player1, player2]);

    console.log("Starting new game:", gameId);
    console.log("Player 1:", player1.playerNumber);
    console.log("Player 2:", player2.playerNumber);

    // Notify players that game has started
    player1.ws.send(
      JSON.stringify({
        type: "gameStart",
        playerNumber: 1,
        gameId,
        controls: "W/S keys",
      })
    );

    player2.ws.send(
      JSON.stringify({
        type: "gameStart",
        playerNumber: 2,
        gameId,
        controls: "Arrow Up/Down keys",
      })
    );

    // Remove these players from the queue
    const player1Index = players.findIndex((p) => p.ws === player1.ws);
    const player2Index = players.findIndex((p) => p.ws === player2.ws);

    // Remove players in reverse order to avoid index shifting issues
    if (player2Index !== -1) {
      players.splice(player2Index, 1);
    }
    if (player1Index !== -1) {
      players.splice(player1Index, 1);
    }

    console.log(
      "Players removed from queue. Remaining players:",
      players.length
    );
  }
}

function broadcastToGame(gameId: string, data: any) {
  const gamePlayers = activeGames.get(gameId);
  if (gamePlayers) {
    gamePlayers.forEach((p) => p.ws.send(JSON.stringify(data)));
  }
}

function broadcastPlayerCount() {
  // Count players in queue
  const queuePlayers = players.length;

  // Count players in active games
  const activeGamePlayers = Array.from(activeGames.values()).flat().length;

  // Total players is the sum of queue players and active game players
  const totalPlayers = queuePlayers + activeGamePlayers;

  const message = JSON.stringify({
    type: "playerCount",
    total: totalPlayers,
    active: activeGamePlayers,
    waiting: queuePlayers,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
