// main.js
import * as THREE from "three";
import { GameManager } from "./game/GameManager.js";
import { Renderer } from "./game/Renderer.js";
import { World } from "./game/World.js";

// Initialize renderer and world
const renderer = new Renderer();
renderer.init();
const world = new World(renderer.scene);

// Initialize game manager
const gameManager = new GameManager(renderer.scene, renderer.camera);

// Game loop
function gameLoop(currentTime) {
  requestAnimationFrame(gameLoop);

  // Update game state
  gameManager.update(currentTime);

  // Render scene
  renderer.render();
}

// Start the game
async function startGame() {
  await gameManager.init();
  gameLoop(0);
}

startGame();
