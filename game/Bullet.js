import * as THREE from "three";

export class Bullet {
  constructor(position, direction) {
    this.position = position.clone();
    this.velocity = direction.clone().multiplyScalar(1.2); // Increased velocity
    this.gravity = 0.003; // Reduced gravity
    this.bounceDamping = 0.7;
    this.airResistance = 0.998; // Reduced air resistance
    this.groundLevel = 0;
    this.isDead = false;
    this.lifetime = 0;
    this.maxLifetime = 8000; // Increased from 5000 to 8000

    // Create bullet mesh
    const geometry = new THREE.SphereGeometry(0.2, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(this.position);
  }

  update() {
    // Apply gravity
    this.velocity.y -= this.gravity;

    // Apply air resistance (less to horizontal movement)
    this.velocity.x *= this.airResistance;
    this.velocity.z *= this.airResistance;
    this.velocity.y *= this.airResistance;

    // Update position
    this.position.add(this.velocity);

    // Update mesh position
    this.mesh.position.copy(this.position);

    // Check for ground collision
    if (this.position.y <= this.groundLevel) {
      this.position.y = this.groundLevel;
      this.velocity.y = -this.velocity.y * this.bounceDamping;
      this.mesh.position.y = this.groundLevel;
    }

    // Update lifetime
    this.lifetime += 16; // Assuming 60fps

    // Mark as dead if velocity is very small or lifetime exceeded
    if ((Math.abs(this.velocity.y) < 0.01 && this.position.y <= this.groundLevel) || this.lifetime > this.maxLifetime) {
      this.isDead = true;
    }
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
