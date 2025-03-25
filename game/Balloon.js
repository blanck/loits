import * as THREE from "three";

export class Balloon {
  constructor(block, size = 1.0) {
    this.block = block;
    this.isPopped = false;
    this.floatForce = 0.01;
    this.swayAmount = 0.02;
    this.swaySpeed = 0.001;
    this.velocity = new THREE.Vector3();

    // Create balloon mesh
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const material = new THREE.MeshPhongMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.8,
      shininess: 50,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(block.position);
    this.mesh.castShadow = true;

    // Create string (line) connecting balloon to block
    const lineGeometry = new THREE.BufferGeometry();
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    this.line = new THREE.Line(lineGeometry, lineMaterial);

    // Position balloon above block
    this.updatePosition();
  }

  updatePosition() {
    // Position balloon above block with slight sway
    const time = performance.now() * this.swaySpeed;
    const sway = Math.sin(time) * this.swayAmount;

    this.mesh.position.set(this.block.position.x + sway, this.block.position.y + 2, this.block.position.z + sway);

    // Update string vertices
    const points = [this.block.position.clone(), this.mesh.position.clone()];
    this.line.geometry.setFromPoints(points);
  }

  pop(scene) {
    this.isPopped = true;
    scene.remove(this.mesh);
    scene.remove(this.line);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.line.geometry.dispose();
    this.line.material.dispose();
  }

  addToScene(scene) {
    scene.add(this.mesh);
    scene.add(this.line);
  }

  update() {
    if (!this.isPopped) {
      this.updatePosition();

      // Apply float force to block
      if (!this.block.userData.isLocked) {
        this.block.position.y += this.floatForce;
      }
    }
  }

  dispose(scene) {
    if (this.mesh) {
      scene.remove(this.mesh);
      if (this.mesh.geometry) {
        this.mesh.geometry.dispose();
      }
      if (this.mesh.material) {
        this.mesh.material.dispose();
      }
    }
  }
}
