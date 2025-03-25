// game/Shape.js
import * as THREE from "three";
import { BoxGeometry } from "three";
import { Balloon } from "./Balloon.js";

export class Shape {
  constructor(type, color, isStatic = false) {
    this.type = type;
    this.color = color;
    this.isStatic = isStatic;
    this.blocks = [];
    this.position = new THREE.Vector3();
    this.isLocked = false;
    this.isActive = !isStatic;
    this.fallSpeed = 1.0; // Units per second
    this.lastFallTime = 0;
    this.gridSize = 10; // Match the ground grid size
    this.groundLevel = 0.0; // Changed from 1.0 to 0.0
    this.rotationSpeed = 0.1; // Rotation speed when hit
    this.isRotating = false;
    this.rotationAxis = new THREE.Vector3(0, 0, 1);
    this.rotationAngle = Math.PI / 2; // 90 degrees
    this.currentRotation = 0;
    this.targetRotation = 0;

    // Generate the shape
    this.generateShape();
  }

  generateShape() {
    try {
      const shapeDefinition = this.getShapeDefinition();
      if (!shapeDefinition || !Array.isArray(shapeDefinition)) {
        console.error("Invalid shape definition");
        return;
      }

      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshStandardMaterial({
        color: this.color || 0x000000,
        metalness: 0.8,
        roughness: 0.2,
      });

      this.blocks = [];

      // Create blocks based on shape definition
      shapeDefinition.forEach((offset) => {
        if (!offset || typeof offset.x !== "number" || typeof offset.y !== "number") {
          console.warn("Invalid offset in shape definition:", offset);
          return;
        }

        try {
          const block = new THREE.Mesh(geometry, material);
          block.castShadow = true;
          block.receiveShadow = true;

          // Store the initial offset relative to shape center
          block.userData.initialOffset = new THREE.Vector3(offset.x, offset.y, 0);

          // Set initial position
          block.position.copy(this.position).add(block.userData.initialOffset);

          this.blocks.push(block);
        } catch (error) {
          console.error("Error creating block:", error);
        }
      });

      // Calculate center
      if (this.blocks.length > 0) {
        this.center = new THREE.Vector3();
        this.blocks.forEach((block) => {
          if (block && block.position) {
            this.center.add(block.position);
          }
        });
        this.center.divideScalar(this.blocks.length);
      } else {
        console.warn("No blocks were created for the shape");
        this.center = this.position.clone();
      }
    } catch (error) {
      console.error("Error generating shape:", error);
      this.blocks = [];
      this.center = this.position.clone();
    }
  }

  addToScene(scene) {
    this.blocks.forEach((block) => {
      scene.add(block);
    });
  }

  handleShot(bullet, hitPoint) {
    if (this.isLocked || !this.isActive) return false;

    // Always rotate when hit
    this.startRotation(true);
    return true;
  }

  startRotation(clockwise = true) {
    if (this.isRotating) return; // Prevent starting new rotation while one is in progress

    this.isRotating = true;
    this.currentRotation = 0;
    this.rotationSpeed = clockwise ? Math.PI / 40 : -Math.PI / 40; // Slower rotation
    this.targetRotation = clockwise ? Math.PI / 2 : -Math.PI / 2; // 90 degrees

    // Calculate new positions after rotation to check if they would be valid
    const newPositions = this.blocks.map((block) => {
      const rotatedOffset = block.userData.initialOffset.clone();
      rotatedOffset.applyAxisAngle(this.rotationAxis, this.targetRotation);
      return {
        block,
        newPos: this.position.clone().add(rotatedOffset),
      };
    });

    // Check if any block would go outside the grid
    const gridSize = 10;
    const halfGrid = gridSize / 2;
    const wouldBeValid = newPositions.every(({ newPos }) => {
      return Math.abs(newPos.x) <= halfGrid;
    });

    if (!wouldBeValid) {
      // If rotation would be invalid, don't rotate
      this.isRotating = false;
      this.currentRotation = 0;
      return false;
    }

    // Update block positions immediately
    this.updateBlockPositions();
    return true;
  }

  moveSideways(direction) {
    // Check if movement would keep shape within grid bounds
    const newX = this.position.x + direction;
    if (Math.abs(newX) <= this.gridSize / 2) {
      this.position.x = newX;
      this.updateBlockPositions();
      return true;
    }
    return false;
  }

  updateBlockPositions() {
    if (!this.blocks || !Array.isArray(this.blocks) || this.blocks.length === 0) {
      console.warn("No blocks to update positions for");
      return;
    }

    try {
      this.blocks.forEach((block) => {
        if (!block || !block.userData || !block.userData.initialOffset) {
          console.warn("Invalid block or missing userData");
          return;
        }

        // Calculate position relative to shape center
        const relativePos = block.userData.initialOffset.clone();

        // Apply rotation if rotating
        if (this.isRotating) {
          relativePos.applyAxisAngle(this.rotationAxis, this.currentRotation);
        }

        // Set final position
        block.position.copy(this.position).add(relativePos);
      });

      // Update center position
      if (this.blocks.length > 0) {
        this.center = new THREE.Vector3();
        this.blocks.forEach((block) => {
          if (block && block.position) {
            this.center.add(block.position);
          }
        });
        this.center.divideScalar(this.blocks.length);
      }
    } catch (error) {
      console.error("Error updating block positions:", error);
    }
  }

  update(currentTime) {
    if (this.isLocked) return;

    // Handle rotation if active
    if (this.isRotating) {
      this.currentRotation += this.rotationSpeed;

      // Check if we've reached the target rotation
      if (Math.abs(this.currentRotation) >= Math.abs(this.targetRotation)) {
        // Snap to exact 90-degree rotation
        const finalRotation = (Math.sign(this.targetRotation) * Math.PI) / 2;

        // Update the initial offsets to maintain the new orientation
        this.blocks.forEach((block) => {
          if (!block || !block.userData || !block.userData.initialOffset) return;

          try {
            const rotatedOffset = block.userData.initialOffset.clone();
            rotatedOffset.applyAxisAngle(this.rotationAxis, finalRotation);
            block.userData.initialOffset.copy(rotatedOffset);
          } catch (error) {
            console.warn("Error updating block rotation:", error);
          }
        });

        // Reset rotation state
        this.isRotating = false;
        this.currentRotation = 0;
        this.snapToGrid();
      }

      this.updateBlockPositions();
    }

    // Handle falling
    if (currentTime - this.lastFallTime >= 1000) {
      const nextY = this.position.y - this.fallSpeed;

      // Check if any block would go below ground level
      let wouldCollide = false;
      this.blocks.forEach((block) => {
        if (!block || !block.userData || !block.userData.initialOffset) return;

        try {
          const relativePos = block.userData.initialOffset.clone();
          if (this.isRotating) {
            relativePos.applyAxisAngle(this.rotationAxis, this.currentRotation);
          }
          const blockNextY = nextY + relativePos.y;
          if (blockNextY <= this.groundLevel) {
            wouldCollide = true;
          }
        } catch (error) {
          console.warn("Error checking block collision:", error);
        }
      });

      if (wouldCollide) {
        this.snapToGrid();
        this.isLocked = true;
        this.isActive = false;
      } else {
        this.position.y = nextY;
        this.lastFallTime = currentTime;
      }

      this.updateBlockPositions();
    }
  }

  snapToGrid() {
    // Round x position to nearest grid cell (grid size is 1)
    this.position.x = Math.round(this.position.x);

    // Find the lowest block in the shape
    let lowestY = Infinity;
    this.blocks.forEach((block) => {
      const blockY = block.position.y;
      if (blockY < lowestY) {
        lowestY = blockY;
      }
    });

    // If any block is at or below ground level, adjust the entire shape up
    if (lowestY <= this.groundLevel) {
      const adjustment = this.groundLevel - lowestY;
      this.position.y += adjustment;
    }

    // Update block positions after adjustment
    this.updateBlockPositions();
  }

  checkCollisionWithOtherShapes() {
    // This will be called from GameManager with other shapes as parameter
    return false;
  }

  getShapeDefinition() {
    switch (this.type) {
      case "I":
        return [
          { x: -0.5, y: -0.5 },
          { x: -0.5, y: 0.5 },
          { x: -0.5, y: 1.5 },
          { x: -0.5, y: 2.5 },
        ];
      case "O":
        return [
          { x: -0.5, y: -0.5 },
          { x: 0.5, y: -0.5 },
          { x: -0.5, y: 0.5 },
          { x: 0.5, y: 0.5 },
        ];
      case "T":
        return [
          { x: -0.5, y: -0.5 },
          { x: -1.5, y: 0.5 },
          { x: -0.5, y: 0.5 },
          { x: 0.5, y: 0.5 },
        ];
      case "L":
        return [
          { x: -0.5, y: -0.5 },
          { x: 0.5, y: -0.5 },
          { x: -0.5, y: 0.5 },
          { x: -0.5, y: 1.5 },
        ];
      case "S":
        return [
          { x: -0.5, y: -0.5 },
          { x: 0.5, y: -0.5 },
          { x: 0.5, y: 0.5 },
          { x: 1.5, y: 0.5 },
        ];
      default:
        return [{ x: 0, y: 0 }];
    }
  }

  checkCollision(otherShape) {
    if (!otherShape || otherShape === this) return false;

    // Check collision between each block of this shape and each block of the other shape
    for (const block1 of this.blocks) {
      for (const block2 of otherShape.blocks) {
        const dx = Math.abs(block1.position.x - block2.position.x);
        const dy = Math.abs(block1.position.y - block2.position.y);
        const dz = Math.abs(block1.position.z - block2.position.z);

        // If any blocks are overlapping (with a small threshold for numerical precision)
        if (dx < 0.9 && dy < 0.9 && dz < 0.9) {
          return true;
        }
      }
    }
    return false;
  }

  dispose(scene) {
    try {
      if (!Array.isArray(this.blocks)) {
        console.warn("Invalid blocks array during disposal");
        return;
      }

      this.blocks.forEach((block) => {
        if (!block) return;

        try {
          scene.remove(block);
          if (block.geometry) block.geometry.dispose();
          if (block.material) block.material.dispose();
        } catch (error) {
          console.warn("Error disposing block:", error);
        }
      });

      // Clear references
      this.blocks = [];
    } catch (error) {
      console.error("Error disposing shape:", error);
    }
  }

  activate() {
    this.isActive = true;
  }

  // Add new method for creating static wall shapes
  static createWallShape(type, color, position) {
    const shape = new Shape(type, color, true);
    shape.position.copy(position);

    // Apply shape definition offsets to each block
    const shapeDefinition = shape.getShapeDefinition();
    shape.blocks.forEach((block, index) => {
      const offset = shapeDefinition[index];
      block.position.set(position.x + offset.x, position.y + offset.y, position.z);
    });

    // Remove the shape from the scene if it was added
    if (shape.group && shape.group.parent) {
      shape.group.parent.remove(shape.group);
    }

    return shape;
  }

  setActive(active) {
    this.isActive = active;
  }

  setLocked(locked) {
    this.isLocked = locked;
    if (locked) {
      this.setActive(false);
    }
  }
}
