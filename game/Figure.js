// Figure
import * as THREE from "three";

// Utility functions
function random(min, max, integer = false) {
  const value = Math.random() * (max - min) + min;
  return integer ? Math.round(value) : value;
}

function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

export class Figure {
  constructor(scene, params) {
    this.scene = scene;
    this.params = {
      x: 0,
      y: 0,
      z: 0,
      ry: 0,
      armRotation: 0,
      ...params,
    };

    // Create group and add to scene
    this.group = new THREE.Group();
    scene.add(this.group);

    // Position according to params
    this.group.position.x = this.params.x;
    this.group.position.y = this.params.ys;
    this.group.position.z = this.params.z;

    // Material - use colors from params if provided, otherwise generate random
    if (params.colors) {
      this.headHue = params.colors.headHue;
      this.bodyHue = params.colors.bodyHue;
      this.headLightness = params.colors.headLightness;
    } else {
      this.headHue = random(0, 360);
      this.bodyHue = random(0, 360);
      this.headLightness = random(40, 65);
    }

    this.headMaterial = new THREE.MeshLambertMaterial({ color: `hsl(${this.headHue}, 30%, ${this.headLightness}%)` });
    this.bodyMaterial = new THREE.MeshLambertMaterial({ color: `hsl(${this.bodyHue}, 85%, 50%)` });

    this.arms = [];
  }

  createBody() {
    this.body = new THREE.Group();
    const geometry = new THREE.BoxGeometry(0.5, 0.75, 0.5); // Half size
    const bodyMain = new THREE.Mesh(geometry, this.bodyMaterial);
    bodyMain.castShadow = true;
    this.body.add(bodyMain);
    this.group.add(this.body);

    this.createLegs();
  }

  createHead() {
    // Create a new group for the head
    this.head = new THREE.Group();

    // Create the main cube of the head and add to the group
    const geometry = new THREE.BoxGeometry(0.7, 0.7, 0.7); // Half size
    const headMain = new THREE.Mesh(geometry, this.headMaterial);
    this.head.add(headMain);

    // Add the head group to the figure
    this.group.add(this.head);

    // Position the head group
    this.head.position.y = 0.825; // Half size

    // Add the eyes
    this.createEyes();
  }

  createArms() {
    const height = 0.425; // Half size

    for (let i = 0; i < 2; i++) {
      const armGroup = new THREE.Group();
      const geometry = new THREE.BoxGeometry(0.125, height, 0.125); // Half size
      const arm = new THREE.Mesh(geometry, this.headMaterial);
      const m = i % 2 === 0 ? 1 : -1;

      // Add arm to group
      armGroup.add(arm);

      // Add group to figure
      this.body.add(armGroup);

      // Translate the arm by half the height
      arm.position.y = height * -0.5;

      // Position the arm relative to the figure
      armGroup.position.x = m * 0.4; // Half size
      armGroup.position.y = 0.3; // Half size

      // Rotate the arm
      armGroup.rotation.z = degreesToRadians(30 * m);

      // Push to the array
      this.arms.push(armGroup);
    }
  }

  createEyes() {
    const eyes = new THREE.Group();
    const geometry = new THREE.SphereGeometry(0.075, 12, 8); // Half size
    const material = new THREE.MeshLambertMaterial({ color: 0x44445c });

    for (let i = 0; i < 2; i++) {
      const eye = new THREE.Mesh(geometry, material);
      const m = i % 2 === 0 ? 1 : -1;

      eyes.add(eye);
      eye.position.x = 0.18 * m; // Half size
    }

    this.head.add(eyes);

    eyes.position.y = -0.05; // Half size
    eyes.position.z = 0.35; // Half size
  }

  createLegs() {
    const legs = new THREE.Group();
    const geometry = new THREE.BoxGeometry(0.125, 0.2, 0.125); // Half size

    for (let i = 0; i < 2; i++) {
      const leg = new THREE.Mesh(geometry, this.headMaterial);
      const m = i % 2 === 0 ? 1 : -1;

      legs.add(leg);
      leg.position.x = m * 0.11; // Half size
    }

    this.group.add(legs);
    legs.position.y = -0.575; // Half size
    legs.castShadow = true;
    this.body.add(legs);
  }

  bounce() {
    this.group.position.y = this.params.y;
    this.arms.forEach((arm, index) => {
      const m = index % 2 === 0 ? 1 : -1;
      arm.rotation.z = this.params.armRotation * m;
    });
  }

  setRotation(x, y, z) {
    if (this.group) {
      this.group.rotation.set(x, y, z);
    }
  }

  init() {
    this.createBody();
    this.createHead();
    this.createArms();
    if (this.params && this.params.nickname) {
      this.createNicknameText();
    }
  }

  update() {
    // Add some idle animation
    const time = Date.now() * 0.001;
    this.params.armRotation = Math.sin(time * 2) * 0.2; // Gentle arm movement
    this.bounce();

    // Make nickname always face the camera
    if (this.nicknameMesh) {
      const camera = this.scene.children.find((child) => child instanceof THREE.PerspectiveCamera);
      if (camera) {
        this.nicknameMesh.lookAt(camera.position);
      }
    }
  }

  dispose(scene) {
    scene.remove(this.group);
  }

  createNicknameText() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = 256;
    canvas.height = 64;

    // Draw text
    context.fillStyle = "white";
    context.font = "bold 32px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(this.params.nickname, canvas.width / 2, canvas.height / 2);

    // Create texture
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });

    // Create plane for text
    const geometry = new THREE.PlaneGeometry(2, 0.5);
    this.nicknameMesh = new THREE.Mesh(geometry, material);
    this.nicknameMesh.position.y = 1.5; // Position above the figure
    this.group.add(this.nicknameMesh);
  }

  updateNickname(nickname) {
    if (this.nicknameMesh) {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = 256;
      canvas.height = 64;

      // Draw background
      context.fillStyle = "rgba(0, 0, 0, 0.2)";
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Draw text
      context.fillStyle = "white";
      context.font = "bold 32px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(nickname, canvas.width / 2, canvas.height / 2);

      // Update texture
      this.nicknameMesh.material.map = new THREE.CanvasTexture(canvas);
      this.nicknameMesh.material.needsUpdate = true;
    }
  }

  updateColors(colors) {
    if (!colors) return;

    this.headHue = colors.headHue;
    this.bodyHue = colors.bodyHue;
    this.headLightness = colors.headLightness;

    // Update materials with new colors
    this.headMaterial.color.setHSL(this.headHue / 360, 0.3, this.headLightness / 100);
    this.bodyMaterial.color.setHSL(this.bodyHue / 360, 0.85, 0.5);
  }
}
