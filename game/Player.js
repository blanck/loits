// game/Player.js
import * as THREE from "three";
import { Figure } from "./Figure.js";

export class Player {
  constructor(scene, camera, nickname) {
    this.scene = scene;
    this.camera = camera;
    this.nickname = nickname;
    this.moveSpeed = 0.1;
    this.rotationSpeed = 0.002;
    this.shootDirection = new THREE.Vector3();

    // Set random initial position
    const angle = Math.random() * Math.PI * 2;
    const distance = 10 + Math.random() * 10; // Random distance between 5 and 15 units from center
    const x = (Math.cos(angle) * distance) / 2;
    const z = Math.sin(angle) * -distance;
    this.position = new THREE.Vector3(x, 0.7, z);

    this.velocity = new THREE.Vector3();
    this.jumpForce = 0.2;
    this.gravity = 0.005;
    this.isOnGround = true;
    this.figure = null;
    this.hasOtherPlayers = false;
    this.mouseSensitivity = 0.002;
    this.euler = new THREE.Euler(0, 0, 0, "YXZ");
    this.radius = 0.5; // Player collision radius
    this.boundaries = { minX: -49, maxX: 49, minZ: -49, maxZ: 49 }; // Match ground plane size

    // Create crosshair only for the main player (with camera)
    if (camera) {
      this.createCrosshair();
      this.setupCamera();
      this.setupControls();
    }

    // Create figure for other players immediately
    if (!camera) {
      this.createFigure();
    }
  }

  createCrosshair() {
    this.crosshair = document.createElement("div");
    this.crosshair.style.position = "fixed";
    this.crosshair.style.top = "50%";
    this.crosshair.style.left = "50%";
    this.crosshair.style.transform = "translate(-50%, -50%)";
    this.crosshair.style.width = "20px";
    this.crosshair.style.height = "20px";
    this.crosshair.style.border = "2px solid white";
    this.crosshair.style.borderRadius = "50%";
    this.crosshair.style.pointerEvents = "none";
    document.body.appendChild(this.crosshair);
  }

  setupCamera() {
    // Set up camera
    this.camera.position.copy(this.position);
    this.camera.position.y += 1.6; // Eye level

    // Lock pointer for FPS controls
    document.addEventListener("click", () => {
      if (!document.pointerLockElement) {
        document.body.requestPointerLock();
      }
    });
  }

  setupControls() {
    // Mouse movement handler
    document.addEventListener("mousemove", (event) => {
      if (document.pointerLockElement) {
        this.euler.y -= event.movementX * this.mouseSensitivity;
        this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x - event.movementY * this.mouseSensitivity));
        this.camera.rotation.copy(this.euler);
      }
    });

    // Handle pointer lock changes
    document.addEventListener("pointerlockchange", () => {
      this.crosshair.style.display = "block";
    });
  }

  createFigure() {
    this.figure = new Figure(this.scene, {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      ry: 0,
      nickname: this.nickname,
    });
    this.figure.init();
  }

  setHasOtherPlayers(hasOtherPlayers, colors) {
    // Always create figure for other players
    if (!this.camera && !this.figure) {
      this.figure = new Figure(this.scene, {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
        ry: 0,
        nickname: this.nickname,
        colors: colors,
      });
      this.figure.init();
    } else if (this.figure && colors) {
      // Update colors if figure exists and colors are provided
      this.figure.updateColors(colors);
    }
  }

  checkCollision(otherPlayer) {
    if (!otherPlayer || otherPlayer === this) return false;
    const dx = this.position.x - otherPlayer.position.x;
    const dz = this.position.z - otherPlayer.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    return distance < this.radius + otherPlayer.radius;
  }

  move(direction) {
    // Get forward and right vectors from camera rotation
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0; // Keep movement horizontal
    forward.normalize();

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    right.normalize();

    // Calculate new position
    const newPosition = this.position.clone();
    switch (direction) {
      case "forward":
        newPosition.addScaledVector(forward, this.moveSpeed);
        break;
      case "backward":
        newPosition.addScaledVector(forward, -this.moveSpeed);
        break;
      case "left":
        newPosition.addScaledVector(right, -this.moveSpeed);
        break;
      case "right":
        newPosition.addScaledVector(right, this.moveSpeed);
        break;
      case "jump":
        if (this.isOnGround) {
          this.velocity.y = this.jumpForce;
          this.isOnGround = false;
        }
        return;
    }

    // Check boundaries
    if (newPosition.x >= this.boundaries.minX && newPosition.x <= this.boundaries.maxX && newPosition.z >= this.boundaries.minZ && newPosition.z <= this.boundaries.maxZ) {
      this.position.copy(newPosition);
    }
  }

  update() {
    // Apply gravity
    if (!this.isOnGround) {
      this.velocity.y -= this.gravity;
    }

    // Update position with velocity
    const newPosition = this.position.clone().add(this.velocity);

    // Check boundaries for vertical movement
    if (newPosition.y < 2) {
      newPosition.y = 2;
      this.velocity.y = 0;
      this.isOnGround = true;
    }

    // Apply air resistance to horizontal movement when jumping
    if (!this.isOnGround) {
      this.velocity.x *= 0.95;
      this.velocity.z *= 0.95;
    }

    // Update position if within boundaries
    if (newPosition.x >= this.boundaries.minX && newPosition.x <= this.boundaries.maxX && newPosition.z >= this.boundaries.minZ && newPosition.z <= this.boundaries.maxZ) {
      this.position.copy(newPosition);
    }

    // Update camera position if this is the current player
    if (this.camera) {
      this.camera.position.copy(this.position);
      this.camera.position.y += 1.6; // Eye level
    }

    // Update figure position and rotation if it exists
    if (this.figure) {
      this.figure.group.position.copy(this.position);

      // Update figure rotation based on camera rotation
      if (this.camera) {
        // Copy the full rotation from the camera, but invert the Y rotation
        this.figure.group.rotation.x = this.camera.rotation.x;
        this.figure.group.rotation.y = -this.camera.rotation.y; // Invert Y rotation
        this.figure.group.rotation.z = this.camera.rotation.z;
      }

      this.figure.update(); // Update nickname rotation
    }
  }

  shoot() {
    // Get the shooting direction from camera rotation
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(this.camera.quaternion);

    // Add a slight upward bias to the shot
    direction.y += 0.1; // Reduced from 0.3 to 0.1
    direction.normalize();

    // Calculate bullet start position at crosshair level
    const bulletStartPos = this.camera.position.clone();
    bulletStartPos.y -= 0.5; // Lower the starting position to match crosshair

    return direction;
  }

  dispose() {
    if (this.crosshair && this.crosshair.parentNode) {
      this.crosshair.parentNode.removeChild(this.crosshair);
    }
  }
}
