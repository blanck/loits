// game/Board.js
import * as THREE from "three";

export class Board {
  constructor(width, height, depth) {
    this.width = width; // 10 units wide
    this.height = 1; // Lower walls to 1 unit
    this.depth = depth; // 20 units deep
    this.scene = new THREE.Scene();
    this.grid = this.createEmptyGrid();
    this.createRoom();
  }

  createEmptyGrid() {
    const grid = [];
    for (let x = 0; x < this.width; x++) {
      grid[x] = [];
      for (let y = 0; y < this.height; y++) {
        grid[x][y] = [];
        for (let z = 0; z < this.depth; z++) {
          grid[x][y][z] = null;
        }
      }
    }
    return grid;
  }

  isValidPosition(x, y, z) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height && z >= 0 && z < this.depth;
  }

  worldToGrid(worldPos) {
    return {
      x: Math.round(worldPos.x + this.width / 2),
      y: Math.round(worldPos.y),
      z: Math.round(worldPos.z + this.depth / 2),
    };
  }

  isPositionOccupied(x, y, z) {
    if (!this.isValidPosition(x, y, z)) return true;
    return this.grid[x][y][z] !== null;
  }

  addShape(shape) {
    shape.blocks.forEach((block) => {
      const gridPos = this.worldToGrid(block.position);

      if (this.isValidPosition(gridPos.x, gridPos.y, gridPos.z)) {
        this.grid[gridPos.x][gridPos.y][gridPos.z] = block;
      }
    });
  }

  checkShapeCollision(shape) {
    return shape.blocks.some((block) => {
      const gridPos = this.worldToGrid(block.position);

      // Check if any block is outside the valid grid space
      if (!this.isValidPosition(gridPos.x, gridPos.y, gridPos.z)) {
        return true;
      }

      // Check if the position is already occupied by another block
      if (this.grid[gridPos.x][gridPos.y][gridPos.z] !== null && !shape.blocks.includes(this.grid[gridPos.x][gridPos.y][gridPos.z])) {
        return true;
      }

      return false;
    });
  }

  createRoom() {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(this.width + 1, this.depth + 1);
    const floorMaterial = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Create custom grid to match exact game dimensions
    const gridGeometry = new THREE.BufferGeometry();
    const vertices = [];
    const material = new THREE.LineBasicMaterial({ color: 0x444444 });

    // Vertical lines (along z-axis)
    for (let x = -this.width / 2; x <= this.width / 2; x++) {
      vertices.push(x, -0.49, -this.depth / 2);
      vertices.push(x, -0.49, this.depth / 2);
    }

    // Horizontal lines (along x-axis)
    for (let z = -this.depth / 2; z <= this.depth / 2; z++) {
      vertices.push(-this.width / 2, -0.49, z);
      vertices.push(this.width / 2, -0.49, z);
    }

    gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(gridGeometry, material);
    this.scene.add(grid);

    // Walls
    const wallMaterial = new THREE.MeshPhongMaterial({ color: 0x888888, side: THREE.DoubleSide });

    // Back wall (top wall, where shapes spawn)
    const backWallGeometry = new THREE.PlaneGeometry(this.width + 1, this.height);
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.z = -this.depth / 2 - 0.5;
    backWall.position.y = this.height / 2 - 0.5;
    backWall.rotation.y = Math.PI;
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    // Front wall
    const frontWall = new THREE.Mesh(backWallGeometry.clone(), wallMaterial);
    frontWall.position.z = this.depth / 2 + 0.5;
    frontWall.position.y = this.height / 2 - 0.5;
    frontWall.receiveShadow = true;
    this.scene.add(frontWall);

    // Left wall
    const leftWallGeometry = new THREE.PlaneGeometry(this.depth + 1, this.height);
    const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    leftWall.position.x = -this.width / 2 - 0.5;
    leftWall.position.y = this.height / 2 - 0.5;
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(leftWallGeometry.clone(), wallMaterial);
    rightWall.position.x = this.width / 2 + 0.5;
    rightWall.position.y = this.height / 2 - 0.5;
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);
  }

  addToScene(scene) {
    scene.add(this.scene);
  }
}
