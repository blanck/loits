import * as THREE from "three";
import { ref, onValue, set, onDisconnect, get, update } from "firebase/database";
import { database } from "../utils/firebase.js";
import { nicknames } from "../utils/nicknames.js";
import { Player } from "./Player.js";
import { Shape } from "./Shape.js";
import { Bullet } from "./Bullet.js";
import { Peer } from "peerjs";

export class NetworkManager {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map();
    this.shapes = new Map();
    this.bullets = new Map();
    this.playerRef = null;
    this.playerId = null;
    this.nickname = null;
    this.currentPlayer = null;
    this.playgroundSize = { width: 200, depth: 200 }; // Match the ground plane size
    this.scores = new Map(); // Track player scores
    this.gameState = null;
    this.localPlayer = null;

    // PeerJS related properties
    this.peer = null;
    this.connections = new Map(); // Map of peer connections
    this.lastPeerUpdate = 0;
    this.peerUpdateInterval = 16; // ~60fps for position updates

    // Throttling settings
    this.lastPlayerUpdate = 0;
    this.lastShapeUpdate = 0;
    this.playerUpdateInterval = 1000; // Reduced Firebase updates to every second
    this.shapeUpdateInterval = 200; // Update shape positions every 200ms
  }

  getRandomPosition() {
    // Generate a random position in a circular pattern around the center
    const minDistance = 5; // Minimum distance from center
    const maxDistance = 15; // Maximum distance from center
    const angle = Math.random() * Math.PI * 2; // Random angle
    const distance = minDistance + Math.random() * (maxDistance - minDistance); // Random distance between min and max

    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;

    return { x, y: 2, z }; // y is 2 for proper player height
  }

  async initialize() {
    // Generate a random player ID - use this as both Firebase and Peer ID
    this.playerId = `loits-player-${Math.random().toString(36).substring(2, 15)}`;

    try {
      // Initialize PeerJS with Firebase player ID
      this.peer = new Peer(this.playerId);

      // Handle peer connection errors
      this.peer.on("error", (err) => {
        console.warn("PeerJS error:", err);
        // Attempt to reconnect if there's an error
        this.reconnectToPeers();
      });

      // Handle incoming connections
      this.peer.on("connection", (conn) => {
        console.log("Incoming peer connection from:", conn.peer);
        this.handlePeerConnection(conn);
      });

      // Pick a random nickname
      const takenNicknames = await this.getTakenNicknames();
      this.nickname = this.getRandomNickname(takenNicknames);

      // Generate random colors for the player
      const headHue = Math.random() * 360;
      const bodyHue = Math.random() * 360;
      const headLightness = 40 + Math.random() * 25; // Between 40% and 65%

      // Create player reference
      this.playerRef = ref(database, `players/${this.playerId}`);

      // Set up initial player data with colors and nickname
      await set(this.playerRef, {
        nickname: this.nickname,
        lastUpdate: Date.now(),
        peerId: this.playerId,
        online: true,
        lastSeen: Date.now(),
        colors: {
          headHue,
          bodyHue,
          headLightness,
        },
      });

      // Set up cleanup on disconnect
      onDisconnect(this.playerRef).update({
        online: false,
        lastSeen: Date.now(),
      });

      // Listen for other players
      const playersRef = ref(database, "players");
      onValue(playersRef, (snapshot) => {
        const players = snapshot.val() || {};
        this.updatePlayers(players);
        // Always try to connect to online peers when player list updates
        this.connectToOnlinePeers(players);
        // Update player count display immediately after player update
        this.getPlayerCount().then((count) => {
          const playersElement = document.getElementById("players");
          if (playersElement) {
            playersElement.textContent = `Players: ${count}`;
          }
        });
      });

      // Listen for shapes
      const shapesRef = ref(database, "shapes");
      onValue(shapesRef, (snapshot) => {
        const shapes = snapshot.val() || {};
        this.updateShapes(shapes);
      });

      // Listen for scores
      const scoresRef = ref(database, "scores");
      onValue(scoresRef, (snapshot) => {
        const scores = snapshot.val() || {};
        this.updateScores(scores);
      });

      // Listen for game state
      const gameStateRef = ref(database, "gameState");
      onValue(gameStateRef, (snapshot) => {
        this.gameState = snapshot.val() || {};
        this.handleGameStateUpdate();
      });

      // Check if we're the first player
      const playersSnapshot = await get(playersRef);
      const players = playersSnapshot.val() || {};

      if (Object.keys(players).length === 0) {
        // We're the first player, initialize game state
        await set(ref(database, "gameState"), {
          isActive: true,
          currentShapeId: null,
          lastSpawnTime: Date.now(),
          createdBy: this.playerId,
        });
      }

      // Initialize player score
      await set(ref(database, `scores/${this.playerId}`), {
        nickname: this.nickname,
        score: 0,
        lastUpdate: Date.now(),
      });

      // Add periodic connection check
      setInterval(() => {
        this.checkAndReconnectPeers();
      }, 5000);
    } catch (error) {
      console.error("Error during initialization:", error);
    }

    return this.nickname;
  }

  async getTakenNicknames() {
    const playersRef = ref(database, "players");
    const snapshot = await get(playersRef);
    const players = snapshot.val() || {};
    return Object.values(players).map((player) => player.nickname);
  }

  getRandomNickname(takenNicknames) {
    const availableNicknames = nicknames.filter((nickname) => !takenNicknames.includes(nickname));
    if (availableNicknames.length === 0) {
      return `Player${Math.floor(Math.random() * 1000)}`;
    }
    return availableNicknames[Math.floor(Math.random() * availableNicknames.length)];
  }

  async getPlayerCount() {
    try {
      const playersRef = ref(database, "players");
      const snapshot = await get(playersRef);
      const players = snapshot.val() || {};
      // Count only online players, excluding current player
      const count = Object.entries(players).filter(([id, data]) => id !== this.playerId && data.online).length;
      return count;
    } catch (error) {
      console.error("Error getting player count:", error);
      return 0;
    }
  }

  updatePlayers(players) {
    const now = Date.now();

    // Remove disconnected players after timeout
    for (const [id, player] of this.players) {
      if (!players[id]) {
        if (player && player.dispose) {
          player.dispose(this.scene);
        }
        this.players.delete(id);
      } else if (!players[id].online) {
        if (player && player.dispose) {
          player.dispose(this.scene);
        }
        this.players.delete(id);

        // Also remove from database if enough time has passed
        if (now - players[id].lastSeen > 5000) {
          set(ref(database, `players/${id}`), null);
          set(ref(database, `scores/${id}`), null);
        }
      }
    }

    // Update or add players
    for (const [id, data] of Object.entries(players)) {
      if (id === this.playerId) {
        continue;
      }

      try {
        let player = this.players.get(id);
        if (!player) {
          // Create new player with figure and colors from database
          player = new Player(this.scene, null, data.nickname || "Unknown");
          this.players.set(id, player);
          // Create figure immediately with colors from database
          player.setHasOtherPlayers(true, data.colors);
        }

        // Update nickname and colors from Firebase
        if (data.nickname && player.figure) {
          player.nickname = data.nickname;
          player.figure.updateNickname(data.nickname);
        }
        if (data.colors && player.figure) {
          player.figure.updateColors(data.colors);
        }
      } catch (error) {
        console.error("Error updating player:", error);
      }
    }
  }

  updatePlayerPosition(data) {
    if (!data) return;

    try {
      // Create safe position data
      const safeData = {
        type: "position",
        position:
          data instanceof THREE.Vector3
            ? {
                x: data.x,
                y: data.y,
                z: data.z,
              }
            : {
                x: data.x || 0,
                y: data.y || 0,
                z: data.z || 0,
              },
        isJumping: data.isJumping || false,
      };

      // Add camera rotation for player orientation
      if (this.currentPlayer && this.currentPlayer.camera) {
        safeData.rotation = {
          x: this.currentPlayer.camera.rotation.x,
          y: this.currentPlayer.camera.rotation.y,
          z: this.currentPlayer.camera.rotation.z,
        };
      }

      // Broadcast to all connected peers
      this.broadcastToPeers(safeData);

      // Also update our local player's figure position and rotation
      if (this.currentPlayer && this.currentPlayer.figure) {
        this.currentPlayer.figure.group.position.set(safeData.position.x, safeData.position.y, safeData.position.z);
        if (safeData.rotation) {
          // Invert both X and Y rotations for the figure
          this.currentPlayer.figure.group.rotation.set(
            -safeData.rotation.x, // Invert X rotation (up/down)
            -safeData.rotation.y, // Invert Y rotation (left/right)
            safeData.rotation.z // Keep Z rotation as is
          );
        }
      }
    } catch (error) {
      console.error("Error broadcasting player position:", error);
    }
  }

  updateOtherPlayers() {
    // This method is called every frame to update other players' positions
    // The actual position updates are handled by the Firebase listener in updatePlayers
    // This method can be used for any additional per-frame updates needed
    for (const player of this.players.values()) {
      if (player.figure) {
        player.figure.update();
      }
    }
  }

  getOtherPlayers() {
    return Array.from(this.players.values());
  }

  setCurrentPlayer(player) {
    this.currentPlayer = player;
    // Update the position in the database to reflect the player's initial position
    this.updatePlayerPosition(player.position);
  }

  dispose() {
    if (this.playerRef) {
      set(this.playerRef, null);
    }

    // Clean up peer connections
    if (this.peer) {
      this.connections.forEach((conn) => {
        if (conn.open) {
          conn.close();
        }
      });
      this.connections.clear();
      this.peer.destroy();
    }

    // Clean up players
    for (const player of this.players.values()) {
      player.dispose(this.scene);
    }
    this.players.clear();
  }

  addShape(type, color, position) {
    const shapeId = Math.random().toString(36).substring(2, 15);
    const shapeRef = ref(database, `shapes/${shapeId}`);

    // Store shape data in database only
    set(shapeRef, {
      type,
      color,
      position: {
        x: position.x,
        y: position.y,
        z: position.z,
      },
      isLocked: false,
      isActive: true,
      lastUpdate: Date.now(),
      createdBy: this.playerId,
    });

    // Update game state to track this as the current active shape
    update(ref(database, "gameState"), {
      isActive: true,
      currentShapeId: shapeId,
      lastSpawnTime: Date.now(),
    });
  }

  updateScores(scores) {
    this.scores.clear();
    for (const [id, data] of Object.entries(scores)) {
      this.scores.set(id, data);
    }
    this.updateScoreboard();
  }

  updateScoreboard() {
    const scoreboardElement = document.getElementById("scoreboard");
    if (!scoreboardElement) return;

    // Sort players by score
    const sortedPlayers = Array.from(this.scores.entries())
      .sort(([, a], [, b]) => b.score - a.score)
      .slice(0, 5);

    // Update scoreboard HTML
    scoreboardElement.innerHTML = sortedPlayers
      .map(([id, data], index) => {
        const isCurrentPlayer = id === this.playerId;
        return `<div class="score-entry ${isCurrentPlayer ? "current-player" : ""}">
          ${index + 1}. ${data.nickname}: ${data.score}
        </div>`;
      })
      .join("");
  }

  async addPoints(points) {
    if (!this.playerId) return;

    const scoreRef = ref(database, `scores/${this.playerId}`);
    const currentScore = (await get(scoreRef)).val()?.score || 0;

    await set(scoreRef, {
      nickname: this.nickname,
      score: currentScore + points,
      lastUpdate: Date.now(),
    });
  }

  updateShapes(shapes) {
    if (!this.scene) {
      console.error("Scene not initialized");
      return;
    }

    try {
      const currentShapeIds = new Set(Object.keys(shapes || {}));

      // Remove shapes that no longer exist in database
      for (const [id, shape] of this.shapes) {
        if (!currentShapeIds.has(id)) {
          try {
            if (shape && typeof shape.dispose === "function") {
              shape.dispose(this.scene);
            }
            this.shapes.delete(id);
          } catch (error) {
            console.warn("Error disposing shape:", id, error);
            this.shapes.delete(id);
          }
        }
      }

      // Update or add shapes based on database state
      for (const [id, data] of Object.entries(shapes || {})) {
        try {
          if (!data) continue;

          let shape = this.shapes.get(id);

          // Create new shape if it doesn't exist locally
          if (!shape && data.type && data.color && data.position) {
            try {
              shape = new Shape(data.type, data.color, false);
              if (!shape) continue;

              const pos = {
                x: Number(data.position.x) || 0,
                y: Number(data.position.y) || 0,
                z: Number(data.position.z) || 0,
              };

              // Don't create shapes that are too high up
              if (pos.y > 20) continue;

              shape.position.set(pos.x, pos.y, pos.z);
              shape.isLocked = Boolean(data.isLocked);
              shape.isActive = Boolean(data.isActive);
              shape.addToScene(this.scene);
              shape.updateBlockPositions();
              this.shapes.set(id, shape);
            } catch (error) {
              console.error("Error creating new shape:", id, error);
              continue;
            }
          }

          // Update existing shape
          if (shape) {
            try {
              // Update position if valid and shape is active
              if (data.position && !shape.isLocked) {
                const newY = Number(data.position.y);
                // Don't allow shapes to move up
                if (newY <= shape.position.y) {
                  shape.position.set(Number(data.position.x) || shape.position.x, newY, Number(data.position.z) || shape.position.z);
                }
              }

              // Update state properties
              const wasActive = shape.isActive;
              shape.isLocked = Boolean(data.isLocked);
              shape.isActive = Boolean(data.isActive);
              shape.isRotating = Boolean(data.isRotating);

              // If the shape just became locked, update the game state
              if (wasActive && shape.isLocked) {
                update(ref(database, "gameState"), {
                  currentShapeId: null,
                  lastSpawnTime: Date.now(),
                });
              }

              if (typeof data.currentRotation === "number") {
                shape.currentRotation = data.currentRotation;
              }

              // Update blocks if provided
              if (data.blocks && Array.isArray(data.blocks)) {
                shape.blocks = data.blocks.map((blockData) => {
                  const block = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshPhongMaterial({ color: shape.color }));
                  block.position.set(blockData.position.x, blockData.position.y, blockData.position.z);
                  return block;
                });
              }

              // Only update block positions if shape is active
              if (shape.isActive) {
                shape.updateBlockPositions();
              }
            } catch (error) {
              console.error("Error updating shape:", id, error);
            }
          }
        } catch (error) {
          console.error("Error processing shape:", id, error);
        }
      }
    } catch (error) {
      console.error("Error in updateShapes:", error);
    }
  }

  updateShapeState(shapeId, state) {
    if (!shapeId || !state) return;

    try {
      // Only update if the shape is active or we're locking it
      const shape = this.shapes.get(shapeId);
      if (!shape || (!shape.isActive && !state.isLocked)) return;

      const now = Date.now();
      if (now - this.lastShapeUpdate < this.shapeUpdateInterval) return;
      this.lastShapeUpdate = now;

      const shapeRef = ref(database, `shapes/${shapeId}`);

      // Clean and validate state data
      const safeState = {
        position: state.position
          ? {
              x: this.validateNumber(state.position.x),
              y: this.validateNumber(state.position.y),
              z: this.validateNumber(state.position.z),
            }
          : undefined,
        isLocked: typeof state.isLocked === "boolean" ? state.isLocked : undefined,
        isActive: typeof state.isActive === "boolean" ? state.isActive : undefined,
        isRotating: typeof state.isRotating === "boolean" ? state.isRotating : undefined,
        currentRotation: this.validateNumber(state.currentRotation),
        lastUpdate: now,
      };

      // Remove undefined properties
      const cleanState = Object.fromEntries(Object.entries(safeState).filter(([_, v]) => v !== undefined));

      if (Object.keys(cleanState).length > 0) {
        update(shapeRef, cleanState);
      }
    } catch (error) {
      console.error("Error updating shape state:", error);
    }
  }

  validateNumber(value) {
    const num = Number(value);
    return !isNaN(num) && isFinite(num) ? num : null;
  }

  addBullet(data) {
    if (!data || !data.position || !data.direction || !data.velocity) {
      console.warn("Invalid bullet data");
      return;
    }

    try {
      const bulletData = {
        type: "bullet",
        position: {
          x: this.validateNumber(data.position.x) || 0,
          y: this.validateNumber(data.position.y) || 0,
          z: this.validateNumber(data.position.z) || 0,
        },
        direction: {
          x: this.validateNumber(data.direction.x) || 0,
          y: this.validateNumber(data.direction.y) || 0,
          z: this.validateNumber(data.direction.z) || 0,
        },
        velocity: {
          x: this.validateNumber(data.velocity.x) || 0,
          y: this.validateNumber(data.velocity.y) || 0,
          z: this.validateNumber(data.velocity.z) || 0,
        },
        timestamp: Date.now(),
        playerId: this.playerId,
      };

      // Add rotation if provided
      if (data.rotation) {
        bulletData.rotation = {
          x: this.validateNumber(data.rotation.x) || 0,
          y: this.validateNumber(data.rotation.y) || 0,
          z: this.validateNumber(data.rotation.z) || 0,
        };
      }

      // Broadcast to peers instead of adding to Firebase
      this.broadcastToPeers(bulletData);

      // Create local bullet
      const bullet = new Bullet(
        new THREE.Vector3(bulletData.position.x, bulletData.position.y, bulletData.position.z),
        new THREE.Vector3(bulletData.direction.x, bulletData.direction.y, bulletData.direction.z)
      );
      //this.scene.add(bullet.mesh);
      this.bullets.set(this.playerId + "_" + bulletData.timestamp, bullet);
    } catch (error) {
      console.error("Error adding bullet:", error);
    }
  }

  updateBullets() {
    const now = Date.now();
    for (const [id, bullet] of this.bullets) {
      if (!bullet || !bullet.mesh) {
        this.bullets.delete(id);
        continue;
      }

      // Update bullet position
      bullet.update();

      // Broadcast bullet position update to other players
      const bulletData = {
        type: "bullet",
        position: {
          x: bullet.mesh.position.x,
          y: bullet.mesh.position.y,
          z: bullet.mesh.position.z,
        },
        direction: {
          x: bullet.velocity.x,
          y: bullet.velocity.y,
          z: bullet.velocity.z,
        },
        velocity: {
          x: bullet.velocity.x,
          y: bullet.velocity.y,
          z: bullet.velocity.z,
        },
        timestamp: parseInt(id.split("_")[1]),
        playerId: id.split("_")[0],
      };
      //this.broadcastToPeers(bulletData);

      // Check for collisions with shapes
      for (const shape of this.shapes.values()) {
        if (!shape.isLocked && shape.isActive) {
          const hitPoint = this.checkBulletCollision(bullet, shape);
          if (hitPoint) {
            shape.startRotation(true); // Start clockwise rotation
            bullet.dispose(this.scene);
            this.bullets.delete(id);
            break;
          }
        }
      }

      // Remove old bullets
      if (now - parseInt(id.split("_")[1]) > 5000) {
        bullet.dispose(this.scene);
        this.bullets.delete(id);
      }
    }
  }

  handlePeerBullet(data) {
    if (!data || !data.position || !data.direction || !data.velocity || !data.playerId) return;

    try {
      const bulletId = data.playerId + "_" + data.timestamp;
      let bullet = this.bullets.get(bulletId);

      if (!bullet) {
        // Create new bullet if it doesn't exist
        bullet = new Bullet(new THREE.Vector3(data.position.x, data.position.y, data.position.z), new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z));
        //this.scene.add(bullet.mesh);
        this.bullets.set(bulletId, bullet);
      }

      // Update bullet position and velocity
      bullet.mesh.position.set(data.position.x, data.position.y, data.position.z);
      bullet.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);

      // Check for shape collisions
      for (const shape of this.shapes.values()) {
        if (!shape.isLocked && shape.isActive) {
          const hitPoint = this.checkBulletCollision(bullet, shape);
          if (hitPoint) {
            shape.startRotation(true); // Start clockwise rotation
            bullet.dispose(this.scene);
            this.bullets.delete(bulletId);
            break;
          }
        }
      }
    } catch (error) {
      console.error("Error handling peer bullet:", error);
    }
  }

  checkBulletCollision(bullet, shape) {
    // Simple bounding box collision check for each block in the shape
    const bulletPos = bullet.mesh.position;
    const collisionThreshold = 0.5; // Half size of a block

    for (const block of shape.blocks) {
      const blockPos = block.position;
      const dx = Math.abs(bulletPos.x - blockPos.x);
      const dy = Math.abs(bulletPos.y - blockPos.y);
      const dz = Math.abs(bulletPos.z - blockPos.z);

      if (dx < collisionThreshold && dy < collisionThreshold && dz < collisionThreshold) {
        return blockPos.clone(); // Return hit point
      }
    }
    return null;
  }

  handleGameStateUpdate() {
    if (!this.gameState) return;

    // Clean up any floating shapes that shouldn't be there
    this.cleanupFloatingShapes();

    // Check if we need to spawn a new shape
    const currentTime = Date.now();

    // Only spawn a new shape if:
    // 1. There are no active falling shapes
    // 2. At least 1 second has passed since last spawn
    // 3. There is no current shape ID in the game state
    const hasActiveFallingShape = Array.from(this.shapes.values()).some((shape) => shape.isActive && !shape.isLocked);
    const hasCurrentShape = this.gameState.currentShapeId !== null;

    if (!hasActiveFallingShape && !hasCurrentShape && currentTime - this.gameState.lastSpawnTime > 1000) {
      // Only the first player spawns new shapes
      const players = Array.from(this.players.keys());
      const isFirstPlayer = players.length === 0 || players[0] === this.playerId;

      if (isFirstPlayer) {
        // Set a temporary shape ID to prevent multiple spawns
        update(ref(database, "gameState"), {
          currentShapeId: "spawning",
          lastSpawnTime: currentTime,
        }).then(() => {
          this.spawnNewShape();
        });
      }
    }
  }

  cleanupFloatingShapes() {
    // Remove any shapes that are floating and shouldn't be there
    const shapesToRemove = [];

    for (const [id, shape] of this.shapes) {
      // If a shape is not active but is floating (y > 0), or if it's too high up
      if ((!shape.isActive && shape.position.y > 0) || shape.position.y > 20) {
        shapesToRemove.push(id);
      }
    }

    // Remove the invalid shapes from both the scene and database
    shapesToRemove.forEach((id) => {
      const shape = this.shapes.get(id);
      if (shape) {
        shape.dispose(this.scene);
        this.shapes.delete(id);
        set(ref(database, `shapes/${id}`), null);
      }
    });
  }

  spawnNewShape() {
    const types = ["I", "O", "T", "L", "S"];
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];
    const type = types[Math.floor(Math.random() * types.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const gridSize = 10;
    const x = Math.floor(Math.random() * gridSize) - gridSize / 2;
    const position = new THREE.Vector3(x, 15, 0);

    this.addShape(type, color, position);
  }

  handleRowCompletion(y) {
    // When a row is completed, all connected players get points
    const points = 10;
    this.addPoints(points);

    // Remove all blocks at the completed row
    const shapesToUpdate = [];
    for (const [id, shape] of this.shapes) {
      if (shape.isLocked) {
        // Check each block in the shape
        const blocksToRemove = [];
        shape.blocks.forEach((block, index) => {
          if (Math.round(block.position.y) === y) {
            blocksToRemove.push(index);
          }
        });

        if (blocksToRemove.length > 0) {
          // Remove blocks from highest to lowest index to maintain array integrity
          blocksToRemove.sort((a, b) => b - a);
          blocksToRemove.forEach((index) => {
            shape.blocks.splice(index, 1);
          });

          // Update the shape's block positions
          shape.updateBlockPositions();
          shapesToUpdate.push(id);
        }
      }
    }

    // Update shapes in Firebase
    shapesToUpdate.forEach((id) => {
      const shape = this.shapes.get(id);
      if (shape) {
        const shapeRef = ref(database, `shapes/${id}`);
        update(shapeRef, {
          blocks: shape.blocks.map((block) => ({
            position: {
              x: block.position.x,
              y: block.position.y,
              z: block.position.z,
            },
          })),
          lastUpdate: Date.now(),
        });
      }
    });

    // Broadcast row completion to all players
    set(ref(database, "gameState/lastRowCompletion"), {
      y,
      timestamp: Date.now(),
    });
  }

  async resetGameState() {
    // Clear all shapes from database
    await set(ref(database, "shapes"), null);

    // Reset game state
    await set(ref(database, "gameState"), {
      isActive: true,
      currentShapeId: null,
      lastSpawnTime: Date.now(),
      createdBy: this.playerId,
    });

    // Reset scores
    await set(ref(database, "scores"), {
      [this.playerId]: {
        nickname: this.nickname,
        score: 0,
        lastUpdate: Date.now(),
      },
    });

    // Clear local bullets
    for (const [id, bullet] of this.bullets) {
      bullet.dispose(this.scene);
    }
    this.bullets.clear();
  }

  connectToOnlinePeers(players) {
    Object.entries(players).forEach(([playerId, data]) => {
      // Only connect to players that aren't us and are marked as online
      if (playerId !== this.playerId && data.online) {
        // Check if we need to reconnect
        const existingConn = this.connections.get(playerId);
        if (!existingConn || !existingConn.open) {
          try {
            const conn = this.peer.connect(playerId);
            if (conn) {
              conn.on("open", () => {
                this.handlePeerConnection(conn);

                // Update player's online status in Firebase
                set(ref(database, `players/${playerId}`), {
                  ...data,
                  online: true,
                  lastSeen: Date.now(),
                });

                // Send initial position to new peer
                if (this.currentPlayer && this.currentPlayer.camera) {
                  const initialData = {
                    type: "position",
                    position: {
                      x: this.currentPlayer.position.x,
                      y: this.currentPlayer.position.y,
                      z: this.currentPlayer.position.z,
                    },
                    rotation: {
                      x: this.currentPlayer.camera.rotation.x,
                      y: this.currentPlayer.camera.rotation.y,
                      z: this.currentPlayer.camera.rotation.z,
                    },
                  };
                  conn.send(initialData);
                }
              });

              conn.on("error", (err) => {
                this.connections.delete(playerId);
                // Try to reconnect after a delay
                setTimeout(() => this.reconnectToPeers(), 5000);
              });
            }
          } catch (error) {
            console.error("Error connecting to peer:", playerId, error);
            // Try to reconnect after a delay
            setTimeout(() => this.reconnectToPeers(), 5000);
          }
        }
      }
    });
  }

  handlePeerConnection(conn) {
    // Store connection with player ID
    this.connections.set(conn.peer, conn);

    conn.on("data", (data) => {
      if (!data || !data.type) {
        console.warn("Received invalid data from peer:", conn.peer);
        return;
      }

      switch (data.type) {
        case "position":
          this.handlePeerPosition(conn.peer, data);
          break;
        case "bullet":
          this.handlePeerBullet(data);
          break;
        case "shape":
          this.handlePeerShape(data);
          break;
      }
    });

    conn.on("open", () => {
      // Send initial position to new peer
      if (this.currentPlayer && this.currentPlayer.camera) {
        const initialData = {
          type: "position",
          position: {
            x: this.currentPlayer.position.x,
            y: this.currentPlayer.position.y,
            z: this.currentPlayer.position.z,
          },
          rotation: {
            x: this.currentPlayer.camera.rotation.x,
            y: this.currentPlayer.camera.rotation.y,
            z: this.currentPlayer.camera.rotation.z,
          },
        };
        conn.send(initialData);
      }
    });

    conn.on("close", () => {
      this.connections.delete(conn.peer);

      // Update Firebase to mark player as offline
      set(ref(database, `players/${conn.peer}`), {
        online: false,
        lastSeen: Date.now(),
      });

      // Try to reconnect after a delay
      setTimeout(() => this.reconnectToPeers(), 5000);
    });

    conn.on("error", (err) => {
      this.connections.delete(conn.peer);
      // Try to reconnect after a delay
      setTimeout(() => this.reconnectToPeers(), 5000);
    });
  }

  handlePeerPosition(peerId, data) {
    const player = this.players.get(peerId);
    if (!player || !data.position) return;

    try {
      // Update player position
      const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
      player.position.copy(position);

      // Update velocity if provided
      if (data.velocity) {
        player.velocity = new THREE.Vector3(data.velocity.x, data.velocity.y, data.velocity.z);
      }

      // Update figure position and rotation
      if (player.figure) {
        player.figure.group.position.copy(position);

        // Apply rotation using the new setRotation method
        if (data.rotation) {
          player.figure.setRotation(
            data.rotation.x, // Always invert X rotation (up/down)
            data.rotation.y - Math.PI,
            data.rotation.z // Keep Z rotation as is
          );
        }

        // Handle jumping animation
        if (data.isJumping) {
          // Apply jump velocity
          player.velocity = new THREE.Vector3(data.velocity.x, data.velocity.y, data.velocity.z);
          player.isOnGround = false;

          // Add a slight upward offset to the figure during jump
          player.figure.group.position.y += 0.5;
        } else {
          player.isOnGround = true;
          // Reset the figure's Y position when not jumping
          player.figure.group.position.y = position.y;
        }

        player.figure.update();
      } else {
        // Create figure if it doesn't exist
        player.setHasOtherPlayers(true);
      }
    } catch (error) {
      console.error("Error updating peer position:", error);
    }
  }

  handlePeerShape(data) {
    // Implementation needed
  }

  broadcastToPeers(data) {
    // Only broadcast if we have active connections
    if (this.connections.size === 0) return;

    this.connections.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(data);
        } catch (error) {
          console.warn("Error sending data to peer:", error);
        }
      }
    });
  }

  // Add new method to reconnect to peers
  reconnectToPeers() {
    const playersRef = ref(database, "players");
    get(playersRef).then((snapshot) => {
      const players = snapshot.val() || {};
      this.connectToOnlinePeers(players);
    });
  }

  // Add new method to check and reconnect peers
  checkAndReconnectPeers() {
    this.connections.forEach((conn, peerId) => {
      if (!conn.open) {
        this.connections.delete(peerId);
        this.reconnectToPeers();
      }
    });
  }
}
