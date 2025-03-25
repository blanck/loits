import * as THREE from "three";
import { Shape } from "./Shape.js";

export class World {
  constructor(scene) {
    this.scene = scene;
    this.createSkybox();
    this.createGround();
    this.createWalls();
    this.createCloud();
    this.createGrid();
    this.createLogo();
  }

  createSkybox() {
    const loader = new THREE.CubeTextureLoader();
    loader.setPath("/assets/textures/");

    // Load all six faces of the cube map
    // Assuming sky.png is in the format of a standard skybox with 6 faces
    const skyTexture = loader.load([
      "Sky_Right.png", // right
      "Sky_Left.png", // left
      "Sky_Top.png", // top
      "Sky_Bottom.png", // bottom
      "Sky_Front.png", // front
      "Sky_Back.png", // back
    ]);

    // Set the scene's background to the cube texture
    this.scene.background = skyTexture;
  }

  createGround() {
    // Load grass texture
    const textureLoader = new THREE.TextureLoader();
    const grassTexture = textureLoader.load("/assets/textures/grass.png");
    grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(64, 64); // Make the texture repeat 32x32 times

    // Create a large ground plane
    const geometry = new THREE.PlaneGeometry(200, 200);
    const material = new THREE.MeshStandardMaterial({
      map: grassTexture,
      roughness: 0.5,
      metalness: 0.1,
    });

    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Add some ambient and directional light
    const ambientLight = new THREE.AmbientLight(0x404040, 10.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 100, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    this.scene.add(directionalLight);
  }

  createWalls() {
    // Create invisible walls to contain the play area
    const wallGeometry = new THREE.BoxGeometry(1, 50, 100); // Made walls higher
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x808080,
      transparent: true,
      opacity: 0.2,
    });

    // Left wall
    const leftWall = new THREE.Mesh(wallGeometry, wallMaterial);
    leftWall.position.set(-50, 25, 0);
    this.scene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(wallGeometry, wallMaterial);
    rightWall.position.set(50, 25, 0);
    this.scene.add(rightWall);

    // Back wall
    const backWall = new THREE.Mesh(wallGeometry, wallMaterial);
    backWall.rotation.y = Math.PI / 2;
    backWall.position.set(0, 25, -50);
    this.scene.add(backWall);

    // Front wall
    const frontWall = new THREE.Mesh(wallGeometry, wallMaterial);
    frontWall.rotation.y = Math.PI / 2;
    frontWall.position.set(0, 25, 50);
    this.scene.add(frontWall);
  }

  createCloud() {
    // Create a large, semi-transparent cloud
    const cloudGeometry = new THREE.PlaneGeometry(40, 20);
    const cloudMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        varying vec2 vUv;
        void main() {
          float dist = length(vUv - vec2(0.5));
          float alpha = smoothstep(0.5, 0.0, dist);
          gl_FragColor = vec4(color, alpha * 0.8);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    });

    this.cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
    this.cloud.position.set(0, 25, 0); // Lower position
    this.cloud.rotation.x = -Math.PI / 2; // Make it horizontal
    this.scene.add(this.cloud);
  }

  createGrid() {
    // Create a 10x1 grid on the ground
    const gridSize = 10;
    const cellSize = 1;
    const gridGeometry = new THREE.BufferGeometry();
    const vertices = [];
    const material = new THREE.LineBasicMaterial({ color: 0x444444 });

    // Vertical lines
    for (let x = -gridSize / 2; x <= gridSize / 2; x++) {
      vertices.push(x, 0.01, -0.5);
      vertices.push(x, 0.01, 0.5);
    }

    // Horizontal lines
    for (let z = -0.5; z <= 0.5; z++) {
      vertices.push(-gridSize / 2, 0.01, z);
      vertices.push(gridSize / 2, 0.01, z);
    }

    gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(gridGeometry, material);
    this.scene.add(grid);

    // Add cell numbers
    const loader = new THREE.TextureLoader();
    for (let i = 0; i < gridSize; i++) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = 64;
      canvas.height = 64;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = "white";
      ctx.font = "48px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((i + 1).toString(), 32, 32);

      const texture = new THREE.CanvasTexture(canvas);
      const numberMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const numberGeometry = new THREE.PlaneGeometry(0.8, 0.8);
      const numberMesh = new THREE.Mesh(numberGeometry, numberMaterial);
      numberMesh.position.set(i - gridSize / 2 + 0.5, 0.02, 0);
      numberMesh.rotation.x = -Math.PI / 2;
      this.scene.add(numberMesh);
    }
  }

  createLogo() {
    // Define the LOITS logo using shapes
    const logoShapes = [
      // L - Using L shape
      { type: "L", color: 0xff0000, position: new THREE.Vector3(-12, 15, -49) },
      // O - Using O shape
      { type: "O", color: 0x00ff00, position: new THREE.Vector3(-6, 15, -49) },
      // I - Using I shape
      { type: "I", color: 0x0000ff, position: new THREE.Vector3(0, 15, -49) },
      // T - Using T shape
      { type: "T", color: 0xffff00, position: new THREE.Vector3(6, 15, -49) },
      // S - Using S shape
      { type: "S", color: 0xff00ff, position: new THREE.Vector3(12, 15, -49) },
    ];

    // Create static shapes for the logo on the back wall
    logoShapes.forEach(({ type, color, position }) => {
      const shape = Shape.createWallShape(type, color, position);
      shape.blocks.forEach((block) => this.scene.add(block));
    });

    // Add game instructions text
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = 1024;
    canvas.height = 256;

    // Draw semi-transparent black background
    context.fillStyle = "rgba(0, 0, 0, 0.3)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw text
    context.fillStyle = "white";
    context.font = "bold 32px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";

    // Split text into multiple lines for better readability
    const text =
      "Welcome to LOITS. Play the game by co-operate with other players to finish block lines in a Tetris-style. Navigate with WASD keys, move pieces with Q and E and rotate them by shooting bullets or jumping with Space-bar. Restart the game by pressing R-key.";
    const words = text.split(" ");
    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const width = context.measureText(currentLine + " " + words[i]).width;
      if (width < canvas.width - 50) {
        currentLine += " " + words[i];
      } else {
        lines.push(currentLine);
        currentLine = words[i];
      }
    }
    lines.push(currentLine);

    // Draw each line
    lines.forEach((line, index) => {
      context.fillText(line, canvas.width / 2, canvas.height / 2 + (index - (lines.length - 1) / 2) * 50);
    });

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });

    // Create plane for text
    const geometry = new THREE.PlaneGeometry(40, 10);
    const textPlane = new THREE.Mesh(geometry, material);
    textPlane.position.set(0, 7, -49); // Position just below the logo
    //textPlane.rotation.y = Math.PI; // Face the player
    this.scene.add(textPlane);

    // Create right wall logo (mirrored)
    // logoShapes.forEach(({ type, color, position }) => {
    //   const mirroredPosition = position.clone();
    //   mirroredPosition.x = -mirroredPosition.x;
    //   const shape = Shape.createWallShape(type, color, mirroredPosition);
    //   shape.blocks.forEach((block) => this.scene.add(block));
    // });
  }

  update() {
    // Add any world update logic here (e.g., cloud movement)
  }
}
