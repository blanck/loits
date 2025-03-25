// game/GameManager.js
import * as THREE from "three";

import { Renderer } from "./Renderer.js";
import { Board } from "./Board.js";
import { Player } from "./Player.js";
import { InputManager } from "./InputManager.js";
import { Shape } from "./Shape.js";
import { World } from "./World.js";
import { Bullet } from "./Bullet.js";
import { NetworkManager } from "./NetworkManager.js";

export class GameManager {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.shapes = [];
    this.bullets = [];
    this.spawnInterval = 3000; // Reduced from 15000 to 3000 (3 seconds)
    this.lastSpawnTime = 0;
    this.score = 0;
    this.isGameOver = false;
    this.isPaused = false;
    this.raycaster = new THREE.Raycaster();

    // Initialize network manager
    this.networkManager = new NetworkManager(scene);

    // Initialize player
    this.player = new Player(scene, camera, "Player");

    // Initialize input handling
    this.keys = new Set();
    this.setupInputHandling();

    this.scoreElement = document.getElementById("score");
    this.gameOverElement = document.getElementById("game-over");
    this.playerNameElement = document.getElementById("player-name");

    // Initialize game
    this.init();
  }

  setupInputHandling() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "Escape") {
        this.togglePause();
      }
      if (e.code === "KeyR") {
        this.restart();
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener("mousedown", (e) => {
      if (e.button === 0 && !this.isPaused) {
        // Left click
        this.handleShoot();
      }
    });
  }

  async init() {
    // Initialize network and get player nickname
    const nickname = await this.networkManager.initialize();

    // Update player name display
    if (this.playerNameElement) {
      this.playerNameElement.textContent = nickname;
    }

    // Set current player in network manager
    this.networkManager.setCurrentPlayer(this.player);

    // Update UI with player count
    await this.updatePlayerCount();
  }

  async updatePlayerCount() {
    const playersElement = document.getElementById("players");
    if (playersElement) {
      const count = await this.networkManager.getPlayerCount();
      playersElement.textContent = `Players: ${count}`;
    }
  }

  update(currentTime) {
    if (this.isGameOver || this.isPaused) return;

    // Handle player movement
    if (this.keys.has("KeyW")) this.player.move("forward");
    if (this.keys.has("KeyS")) this.player.move("backward");
    if (this.keys.has("KeyA")) this.player.move("left");
    if (this.keys.has("KeyD")) this.player.move("right");
    if (this.keys.has("Space")) {
      if (this.player.isOnGround) {
        this.player.move("jump");
      } else {
        // Try to rotate shape if in air
        this.rotateShapeInView();
      }
    }

    // Handle shape movement
    if (this.keys.has("KeyQ")) this.moveShapeInView("left");
    if (this.keys.has("KeyE")) this.moveShapeInView("right");

    // Update player
    this.player.update();

    // Update player position in network
    this.networkManager.updatePlayerPosition(this.player.position);

    // Update player visibility based on other players
    const otherPlayers = this.networkManager.getOtherPlayers();
    this.player.setHasOtherPlayers(otherPlayers.length > 0);

    // Update player count
    this.updatePlayerCount();

    // Check if we need to spawn a new shape
    const activeShapes = Array.from(this.networkManager.shapes.values()).filter((shape) => !shape.isLocked && shape.isActive);

    if (activeShapes.length === 0 && currentTime - this.lastSpawnTime > this.spawnInterval) {
      this.spawnShape();
      this.lastSpawnTime = currentTime;
    }

    // Update shapes
    this.updateShapes(currentTime);

    // Update bullets
    this.updateBullets();

    // Update other players
    this.networkManager.updateOtherPlayers();
  }

  spawnShape() {
    // Only create shape in database, NetworkManager will handle rendering
    const types = ["I", "O", "T", "L", "S"];
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];
    const type = types[Math.floor(Math.random() * types.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const gridSize = 10;
    const x = Math.floor(Math.random() * gridSize) - gridSize / 2;
    const position = new THREE.Vector3(x, 15, 0);

    // Add to network, which will trigger database update and re-render
    this.networkManager.addShape(type, color, position);
  }

  updateShapes(currentTime) {
    // Update all shapes from NetworkManager
    for (const shape of this.networkManager.shapes.values()) {
      if (!shape.isLocked && shape.isActive) {
        shape.update(currentTime);

        // Check for collisions with other shapes
        for (const otherShape of this.networkManager.shapes.values()) {
          if (shape !== otherShape && otherShape.isLocked) {
            if (this.checkShapeCollision(shape, otherShape)) {
              shape.snapToGrid();
              // Update shape state in network manager
              const shapeId = Array.from(this.networkManager.shapes.entries()).find(([, s]) => s === shape)?.[0];
              if (shapeId) {
                this.networkManager.updateShapeState(shapeId, {
                  position: shape.position,
                  isLocked: true,
                  isActive: false,
                });
              }
              break;
            }
          }
        }

        // Only update active shape position in database
        const shapeId = Array.from(this.networkManager.shapes.entries()).find(([, s]) => s === shape)?.[0];
        if (shapeId) {
          this.networkManager.updateShapeState(shapeId, {
            position: shape.position,
          });
        }
      }
    }
  }

  checkShapeCollision(shape1, shape2) {
    return shape1.blocks.some((block1) => {
      return shape2.blocks.some((block2) => {
        const dx = Math.abs(block1.position.x - block2.position.x);
        const dy = Math.abs(block1.position.y - block2.position.y);
        const dz = Math.abs(block1.position.z - block2.position.z);
        return dx < 0.9 && dy < 0.9 && dz < 0.9; // Slightly less than 1 to ensure proper stacking
      });
    });
  }

  updateBullets() {
    if (!this.bullets || !this.shapes) return;

    this.bullets.forEach((bullet, index) => {
      if (!bullet || !bullet.userData || !bullet.userData.velocity) {
        this.bullets.splice(index, 1);
        return;
      }

      // Update bullet position
      bullet.position.add(bullet.userData.velocity);

      // Check for collisions with shapes
      this.shapes.forEach((shape) => {
        if (!shape || shape.isLocked) return;

        const hitPoint = this.checkBulletCollision(bullet, shape);
        if (hitPoint) {
          // Handle shape hit
          if (shape.handleShot(bullet, hitPoint)) {
            // Remove bullet if it hit something
            this.scene.remove(bullet);
            this.bullets.splice(index, 1);
          }
        }
      });

      // Remove bullets that have gone too far
      if (bullet.position.length() > 100) {
        this.scene.remove(bullet);
        this.bullets.splice(index, 1);
      }
    });
  }

  checkBulletCollision(bullet, shape) {
    // Simple bounding box collision check
    const bulletPos = bullet.position;
    const shapePos = shape.position;
    const shapeSize = 0.5; // Half size of shape

    return Math.abs(bulletPos.x - shapePos.x) < shapeSize && Math.abs(bulletPos.y - shapePos.y) < shapeSize && Math.abs(bulletPos.z - shapePos.z) < shapeSize;
  }

  handleShoot() {
    if (!this.camera || !this.player) return;

    const bulletSpeed = 1;
    const bulletGeometry = new THREE.SphereGeometry(0.1);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);

    // Set bullet position to player position
    bullet.position.copy(this.player.position);

    // Get camera direction for bullet trajectory
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    bullet.userData.direction = direction;
    bullet.userData.velocity = direction.clone().multiplyScalar(bulletSpeed);

    // Add bullet to scene and bullets array
    this.scene.add(bullet);
    this.bullets.push(bullet);

    // Notify network manager about the new bullet
    if (this.networkManager) {
      this.networkManager.addBullet({
        position: bullet.position.clone(),
        direction: direction.clone(),
        velocity: bullet.userData.velocity.clone(),
        rotation: this.camera.rotation.clone(),
      });
    }

    // Check for shape hit immediately
    const raycaster = new THREE.Raycaster();
    raycaster.set(this.camera.position, direction);
    const blocks = [];
    this.networkManager.shapes.forEach((shape) => {
      if (shape.isActive && !shape.isLocked) {
        blocks.push(...shape.blocks);
      }
    });
    const intersects = raycaster.intersectObjects(blocks);
    if (intersects.length > 0) {
      const hitBlock = intersects[0].object;
      const activeShape = Array.from(this.networkManager.shapes.values()).find((shape) => shape.blocks.includes(hitBlock));
      if (activeShape && !activeShape.isLocked) {
        // Start clockwise rotation
        activeShape.startRotation(true);
        const shapeId = Array.from(this.networkManager.shapes.entries()).find(([, s]) => s === activeShape)?.[0];
        if (shapeId) {
          this.networkManager.updateShapeState(shapeId, {
            isRotating: true,
            currentRotation: activeShape.currentRotation,
          });
        }
      }
    }
  }

  updatePlayerRotation() {
    if (!this.player || !this.camera || !this.networkManager) return;

    // Update player rotation based on camera
    this.player.rotation.copy(this.camera.rotation);

    // Notify network about rotation change
    this.networkManager.updatePlayerPosition({
      position: this.player.position.clone(),
      rotation: this.camera.rotation.clone(),
    });
  }

  handleJump() {
    if (!this.player || !this.networkManager || this.isJumping) return;

    this.isJumping = true;
    const jumpForce = 0.5;
    this.player.userData.velocity.y = jumpForce;

    // Notify network about jump with current position and rotation
    this.networkManager.updatePlayerPosition({
      position: this.player.position.clone(),
      rotation: this.camera.rotation.clone(),
      isJumping: true,
      velocity: this.player.userData.velocity.clone(),
    });

    // Reset jump after a delay
    setTimeout(() => {
      this.isJumping = false;
      // Notify network that jump is complete
      this.networkManager.updatePlayerPosition({
        position: this.player.position.clone(),
        rotation: this.camera.rotation.clone(),
        isJumping: false,
        velocity: this.player.userData.velocity.clone(),
      });
    }, 1000);
  }

  moveShapeInView(direction) {
    // Create raycaster from camera direction
    const raycaster = new THREE.Raycaster();
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    raycaster.set(this.camera.position, cameraDirection);

    // Get all blocks from active shapes
    const blocks = [];
    this.networkManager.shapes.forEach((shape) => {
      if (shape.isActive && !shape.isLocked) {
        blocks.push(...shape.blocks);
      }
    });

    // Check for intersections
    const intersects = raycaster.intersectObjects(blocks);
    if (intersects.length > 0) {
      // Find the shape that owns this block
      const hitBlock = intersects[0].object;
      const activeShape = Array.from(this.networkManager.shapes.values()).find((shape) => shape.blocks.includes(hitBlock));

      if (activeShape && !activeShape.isLocked) {
        // Check if any block in the shape is at or below ground level
        const isOnGround = activeShape.blocks.some((block) => block.position.y <= 0);

        // Only allow movement if the shape is not on the ground
        if (!isOnGround) {
          const moveAmount = direction === "left" ? -1 : 1;

          // Check if movement would keep shape within grid bounds
          const newX = activeShape.position.x + moveAmount;
          if (Math.abs(newX) <= 5) {
            // Half of gridSize (10)
            activeShape.position.x = newX;
            activeShape.updateBlockPositions();

            // Update shape state in network manager
            const shapeId = Array.from(this.networkManager.shapes.entries()).find(([, s]) => s === activeShape)?.[0];

            if (shapeId) {
              this.networkManager.updateShapeState(shapeId, {
                position: activeShape.position,
              });
            }
          }
        }
      }
    }
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      document.exitPointerLock();
    } else {
      document.body.requestPointerLock();
    }
  }

  gameOver() {
    this.isGameOver = true;
    this.gameOverElement.classList.remove("hidden");
    document.exitPointerLock();
  }

  restart() {
    // Clear all shapes
    this.shapes.forEach((shape) => shape.dispose(this.scene));
    this.shapes = [];

    // Clear all bullets
    this.bullets.forEach((bullet) => bullet.dispose(this.scene));
    this.bullets = [];

    // Reset score
    this.score = 0;
    this.updateScore();

    // Reset spawn timer
    this.lastSpawnTime = performance.now();

    // Reset player position
    // this.player.position.set(0, 2, 10);
    // this.player.velocity.set(0, 0, 0);
    // this.player.isOnGround = true;

    // Reset game state in network
    this.networkManager.resetGameState();

    // Reset game state
    this.isGameOver = false;
    this.isPaused = false;
    this.gameOverElement.classList.add("hidden");
    document.body.requestPointerLock();
  }

  dispose() {
    this.networkManager.dispose();
    this.player.dispose();
    this.shapes.forEach((shape) => shape.dispose(this.scene));
    this.bullets.forEach((bullet) => bullet.dispose(this.scene));
  }

  updateScore() {
    this.scoreElement.textContent = `Score: ${this.score}`;
  }

  handleRowCompletion(rowY) {
    // Award points to all players
    this.score += 10;
    this.updateScore();
    this.networkManager.addPoints(10);
  }

  rotateShapeInView() {
    // Create raycaster from camera direction
    const raycaster = new THREE.Raycaster();
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    raycaster.set(this.camera.position, cameraDirection);

    // Get all blocks from active shapes
    const blocks = [];
    this.networkManager.shapes.forEach((shape) => {
      if (shape.isActive && !shape.isLocked) {
        blocks.push(...shape.blocks);
      }
    });

    // Check for intersections
    const intersects = raycaster.intersectObjects(blocks);
    if (intersects.length > 0) {
      // Find the shape that owns this block
      const hitBlock = intersects[0].object;
      const activeShape = Array.from(this.networkManager.shapes.values()).find((shape) => shape.blocks.includes(hitBlock));

      if (activeShape && !activeShape.isLocked) {
        // Start clockwise rotation
        activeShape.startRotation(true);

        // Update shape state in network manager
        const shapeId = Array.from(this.networkManager.shapes.entries()).find(([, s]) => s === activeShape)?.[0];
        if (shapeId) {
          this.networkManager.updateShapeState(shapeId, {
            isRotating: true,
            currentRotation: activeShape.currentRotation,
          });
        }
      }
    }
  }
}
