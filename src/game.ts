class PingPongGame {
  private paddle1: HTMLElement;
  private paddle2: HTMLElement;
  private ball: HTMLElement;
  private player1Score: HTMLElement;
  private player2Score: HTMLElement;
  private loadingScreen: HTMLElement;
  private totalPlayersDisplay: HTMLElement;

  private ballX: number = 392;
  private ballY: number = 192;
  private ballSpeedX: number = 5;
  private ballSpeedY: number = 5;

  private paddle1Y: number = 150;
  private paddle2Y: number = 150;
  private paddleSpeed: number = 15;

  private score1: number = 0;
  private score2: number = 0;
  private isGameOver: boolean = false;

  private ws: WebSocket | undefined; // Initialize as undefined, will be set in setupWebSocket
  private playerNumber: number = 0;
  private gameId: string = "";
  private isHost: boolean = false;

  // Key state tracking
  private keys: { [key: string]: boolean } = {};

  private lastTime: number = 0;
  private readonly FPS: number = 60;
  private readonly frameInterval: number = 1000 / this.FPS;

  constructor() {
    this.paddle1 = document.getElementById("paddle1")!;
    this.paddle2 = document.getElementById("paddle2")!;
    this.ball = document.getElementById("ball")!;
    this.player1Score = document.getElementById("player1-score")!;
    this.player2Score = document.getElementById("player2-score")!;
    this.loadingScreen = document.getElementById("loading-screen")!;
    this.totalPlayersDisplay = document.getElementById("total-players")!;

    this.setupWebSocket();
    this.setupEventListeners();
    this.gameLoop();
  }

  private setupWebSocket(): void {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("Received message:", data);

      switch (data.type) {
        case "connected":
          console.log("Connected to server");
          break;

        case "gameStart":
          console.log("Game starting with data:", data);
          this.playerNumber = data.playerNumber;
          this.gameId = data.gameId;
          this.isHost = this.playerNumber === 1;
          console.log(`Game started! You are player ${this.playerNumber}`);
          this.loadingScreen.style.display = "none";

          // Show controls information
          const controlsInfo = document.createElement("div");
          controlsInfo.className = "controls-info";
          controlsInfo.textContent = `You are Player ${this.playerNumber} - ${data.controls}`;
          document.querySelector(".game-container")?.appendChild(controlsInfo);
          break;

        case "playerCount":
          this.totalPlayersDisplay.textContent = data.total.toString();
          break;

        case "paddleMove":
          if (data.playerNumber === 1) {
            this.paddle1Y = data.y;
            this.paddle1.style.top = `${this.paddle1Y}px`;
          } else {
            this.paddle2Y = data.y;
            this.paddle2.style.top = `${this.paddle2Y}px`;
          }
          break;

        case "ballUpdate":
          this.ballX = data.x;
          this.ballY = data.y;
          this.ball.style.left = `${this.ballX}px`;
          this.ball.style.top = `${this.ballY}px`;
          break;

        case "scoreUpdate":
          if (data.playerNumber === 1) {
            this.score1 = data.score;
            this.player1Score.textContent = this.score1.toString();
          } else {
            this.score2 = data.score;
            this.player2Score.textContent = this.score2.toString();
          }
          break;

        case "playerDisconnected":
          this.handlePlayerDisconnect();
          break;

        case "gameOver":
          this.isGameOver = true;
          this.showWinner(data.winner);
          break;
      }
    };

    this.ws.onclose = () => {
      console.log("Disconnected from server");
      this.handlePlayerDisconnect();
    };
  }

  private handlePlayerDisconnect(): void {
    this.isGameOver = true;
    const disconnectMessage = document.createElement("div");
    disconnectMessage.className = "winner-message";
    disconnectMessage.textContent = "Opponent disconnected!";
    document.querySelector(".game-container")?.appendChild(disconnectMessage);
  }

  private setupEventListeners(): void {
    // Key down event
    document.addEventListener("keydown", (e: KeyboardEvent) => {
      this.keys[e.key.toLowerCase()] = true;
    });

    // Key up event
    document.addEventListener("keyup", (e: KeyboardEvent) => {
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  private movePaddle1(delta: number): void {
    if (this.isGameOver || this.playerNumber !== 1) return;
    // Add smoothing to paddle movement
    const targetY = Math.max(0, Math.min(300, this.paddle1Y + delta));
    this.paddle1Y += (targetY - this.paddle1Y) * 0.2; // Smoothing factor
    this.paddle1.style.top = `${this.paddle1Y}px`;

    // Send paddle position to server
    this.ws?.send(
      JSON.stringify({
        type: "paddleMove",
        playerNumber: 1,
        y: this.paddle1Y,
      })
    );
  }

  private movePaddle2(delta: number): void {
    if (this.isGameOver || this.playerNumber !== 2) return;
    // Add smoothing to paddle movement
    const targetY = Math.max(0, Math.min(300, this.paddle2Y + delta));
    this.paddle2Y += (targetY - this.paddle2Y) * 0.2; // Smoothing factor
    this.paddle2.style.top = `${this.paddle2Y}px`;

    // Send paddle position to server
    this.ws?.send(
      JSON.stringify({
        type: "paddleMove",
        playerNumber: 2,
        y: this.paddle2Y,
      })
    );
  }

  private updatePaddles(): void {
    if (this.isGameOver) return;

    // Player 1 movement (W/S keys)
    if (this.playerNumber === 1) {
      if (this.keys["w"]) {
        this.movePaddle1(-this.paddleSpeed);
      }
      if (this.keys["s"]) {
        this.movePaddle1(this.paddleSpeed);
      }
    }

    // Player 2 movement (Arrow Up/Down)
    if (this.playerNumber === 2) {
      if (this.keys["arrowup"]) {
        this.movePaddle2(-this.paddleSpeed);
      }
      if (this.keys["arrowdown"]) {
        this.movePaddle2(this.paddleSpeed);
      }
    }
  }

  private updateBall(): void {
    if (this.isGameOver || !this.isHost) return;

    this.ballX += this.ballSpeedX;
    this.ballY += this.ballSpeedY;

    // Ball collision with top and bottom
    if (this.ballY <= 0 || this.ballY >= 385) {
      this.ballSpeedY *= -1;
    }

    // Ball collision with paddles
    if (
      this.ballX <= 10 &&
      this.ballY >= this.paddle1Y &&
      this.ballY <= this.paddle1Y + 100
    ) {
      this.ballSpeedX *= -1;
      // Add slight randomness to vertical speed on paddle hit
      this.ballSpeedY += (Math.random() - 0.5) * 0.5;
    }

    if (
      this.ballX >= 775 &&
      this.ballY >= this.paddle2Y &&
      this.ballY <= this.paddle2Y + 100
    ) {
      this.ballSpeedX *= -1;
      // Add slight randomness to vertical speed on paddle hit
      this.ballSpeedY += (Math.random() - 0.5) * 0.5;
    }

    // Score points
    if (this.ballX <= 0) {
      this.score2++;
      this.player2Score.textContent = this.score2.toString();
      this.checkGameOver(2);
      this.resetBall();

      // Send score update to server
      this.ws?.send(
        JSON.stringify({
          type: "scoreUpdate",
          playerNumber: 2,
          score: this.score2,
        })
      );
    }

    if (this.ballX >= 785) {
      this.score1++;
      this.player1Score.textContent = this.score1.toString();
      this.checkGameOver(1);
      this.resetBall();

      // Send score update to server
      this.ws?.send(
        JSON.stringify({
          type: "scoreUpdate",
          playerNumber: 1,
          score: this.score1,
        })
      );
    }

    this.ball.style.left = `${this.ballX}px`;
    this.ball.style.top = `${this.ballY}px`;

    // Send ball position to server
    this.ws?.send(
      JSON.stringify({
        type: "ballUpdate",
        x: this.ballX,
        y: this.ballY,
      })
    );
  }

  private checkGameOver(winner: number): void {
    if (this.score1 >= 10 || this.score2 >= 10) {
      this.isGameOver = true;
      this.showWinner(winner);

      // Send game over message to server
      this.ws?.send(
        JSON.stringify({
          type: "gameOver",
          winner: winner,
        })
      );
    }
  }

  private showWinner(winner: number): void {
    const winnerMessage = document.createElement("div");
    winnerMessage.className = "winner-message";
    winnerMessage.textContent = `Player ${winner} Wins!`;
    document.querySelector(".game-container")?.appendChild(winnerMessage);
  }

  private resetBall(): void {
    this.ballX = 392;
    this.ballY = 192;
    this.ballSpeedX = (Math.random() > 0.5 ? 1 : -1) * 5;
    this.ballSpeedY = (Math.random() > 0.5 ? 1 : -1) * 5;
  }

  private gameLoop(): void {
    this.updatePaddles();
    this.updateBall();
    requestAnimationFrame(() => this.gameLoop());
  }
}

// Start the game when the page loads
document.addEventListener("DOMContentLoaded", () => {
  new PingPongGame();
});
