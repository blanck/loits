// game/InputManager.js
export class InputManager {
  constructor(player, gameManager) {
    this.player = player;
    this.gameManager = gameManager;
    this.keys = new Set();
  }

  init() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);

      // Handle pause
      if (e.code === "Escape") {
        this.gameManager.togglePause();
      }

      // Handle shape movement
      if (e.code === "KeyQ") {
        this.gameManager.moveActiveShape("left");
      }
      if (e.code === "KeyE") {
        this.gameManager.moveActiveShape("right");
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });
  }

  update() {
    // Movement controls
    if (this.keys.has("KeyW")) this.player.move("forward");
    if (this.keys.has("KeyS")) this.player.move("backward");
    if (this.keys.has("KeyA")) this.player.move("left");
    if (this.keys.has("KeyD")) this.player.move("right");
    if (this.keys.has("Space")) this.player.move("jump");
  }
}
