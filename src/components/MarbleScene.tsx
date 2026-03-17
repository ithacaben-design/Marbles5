import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { MarbleState, GameMode, BoxMaterial, PinballSubMode } from '../types';
import { BOX_MATERIALS } from '../constants';

interface MarbleSceneProps {
  marbles: MarbleState[];
  onMarbleClick: (id: number) => void;
  isFidgetMode: boolean;
  canSpin: boolean;
  gameMode: GameMode;
  material: BoxMaterial;
  flipperLeft?: boolean;
  flipperRight?: boolean;
  plungerCharge?: number;
  plungerRelease?: { timestamp: number, charge: number };
  updateMarble?: (id: number, updates: Partial<MarbleState>) => void;
  onModeChange?: (mode: GameMode) => void;
}

export const MarbleScene: React.FC<MarbleSceneProps> = ({ 
  marbles, 
  onMarbleClick, 
  isFidgetMode, 
  canSpin, 
  gameMode,
  material,
  flipperLeft = false,
  flipperRight = false,
  plungerCharge = 0,
  plungerRelease = { timestamp: 0, charge: 0 },
  updateMarble,
  onModeChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine>(null);
  const runnerRef = useRef<Matter.Runner>(null);
  const bodiesRef = useRef<Map<number, Matter.Body>>(new Map());
  const marblesRef = useRef(marbles);

  useEffect(() => {
    marblesRef.current = marbles;
  }, [marbles]);

  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const tiltRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    tiltRef.current = tilt;
  }, [tilt]);

  // Three.js Refs
  const sceneRef = useRef<THREE.Scene>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const rendererRef = useRef<THREE.WebGLRenderer>(null);
  const marbleMeshesRef = useRef<Map<number, THREE.Mesh>>(new Map());
  const marbleTrailsRef = useRef<Map<number, THREE.Line>>(new Map());
  const roomRef = useRef<THREE.Group>(null);
  const lightsRef = useRef<THREE.Group>(null);
  const starsRef = useRef<THREE.Group>(null);

  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const [isAudioActive, setIsAudioActive] = useState(false);

  // Orbit State
  const orbitAngleRef = useRef<number[]>(marbles.map(() => Math.random() * Math.PI * 2));
  const orbitTiltRef = useRef<number[]>(marbles.map(() => (Math.random() - 0.5) * 0.5));
  const starTwinkleRef = useRef<number[]>([]); // Indices of stars to twinkle

  // Pinball Refs
  const pinballElementsRef = useRef<THREE.Group>(null);
  const flippersRef = useRef<{ left: Matter.Body; right: Matter.Body; leftMesh: THREE.Mesh; rightMesh: THREE.Mesh } | null>(null);
  const bumpersRef = useRef<{ body: Matter.Body; mesh: THREE.Mesh; color: string }[]>([]);
  const slingshotsRef = useRef<{ body: Matter.Body; mesh: THREE.Mesh }[]>([]);
  const permanentTrailsRef = useRef<Map<number, THREE.Points>>(new Map());
  const pinballStartTimeRef = useRef<number>(0);
  const isPinballActiveRef = useRef<boolean>(false);
  const pinballSubModeRef = useRef<PinballSubMode>('pool');
  const lastPlungerReleaseRef = useRef<number>(0);
  const pinballPocketsRef = useRef<Matter.Body[]>([]);
  const spinningWheelsRef = useRef<{ body: Matter.Body; mesh: THREE.Mesh }[]>([]);
  const gravityWellsRef = useRef<{ body: Matter.Body; mesh: THREE.Mesh }[]>([]);
  const flipperLeftRef = useRef<boolean>(false);
  const flipperRightRef = useRef<boolean>(false);
  const accumulatedBumpersRef = useRef<{ body: Matter.Body; mesh: THREE.Mesh; color: string }[]>([]);
  const plungerRef = useRef<THREE.Mesh | null>(null);
  const particlesRef = useRef<{ mesh: THREE.Points; velocities: Float32Array; lifetimes: Float32Array; startTime: number }[]>([]);
  const mazeRef = useRef<{ grid: number[][], goal: { x: number, y: number }, traps: { x: number, y: number }[] } | null>(null);
  const mazeGroupRef = useRef<THREE.Group | null>(null);

  // Maze Generation (Recursive Backtracker)
  const generateMaze = (size: number) => {
    const grid = Array(size).fill(0).map(() => Array(size).fill(1));
    const walk = (x: number, y: number) => {
      grid[y][x] = 0;
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]].sort(() => Math.random() - 0.5);
      for (const [dx, dy] of dirs) {
        const nx = x + dx * 2, ny = y + dy * 2;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size && grid[ny][nx] === 1) {
          grid[y + dy][x + dx] = 0;
          walk(nx, ny);
        }
      }
    };
    walk(0, 0);
    
    const traps = [];
    for (let i = 0; i < 5; i++) {
      traps.push({ x: Math.floor(Math.random() * size), y: Math.floor(Math.random() * size) });
    }
    
    return { grid, goal: { x: size - 1, y: size - 1 }, traps };
  };

  useEffect(() => {
    flipperLeftRef.current = flipperLeft;
  }, [flipperLeft]);

  useEffect(() => {
    flipperRightRef.current = flipperRight;
  }, [flipperRight]);

  // Constants for coordinate conversion
  const WORLD_WIDTH = 1200;
  const WORLD_HEIGHT = 800;
  const THREE_SCALE = 0.05; // 20px = 1 unit

  // Gyroscope and Shake Detection
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const x = (event.gamma || 0) / 90;
      const y = (event.beta || 0) / 90;
      setTilt({ x, y });
    };

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const threshold = 15;
      if (Math.abs(acc.x || 0) > threshold || Math.abs(acc.y || 0) > threshold || Math.abs(acc.z || 0) > threshold) {
        bodiesRef.current.forEach(body => {
          Matter.Body.applyForce(body, body.position, {
            x: (Math.random() - 0.5) * 0.1,
            y: (Math.random() - 0.5) * 0.1
          });
        });
      }
    };

    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission().then((state: string) => {
        if (state === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation);
          window.addEventListener('devicemotion', handleMotion);
        }
      });
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
      window.addEventListener('devicemotion', handleMotion);
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (gameMode !== 'orbit') {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        setTilt({ x: x * 2, y: y * 2 });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('devicemotion', handleMotion);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Initialize Matter.js and Three.js
  const [modeOpacity, setModeOpacity] = useState(1);
  const modeElementsRef = useRef<THREE.Group | null>(null);

  const spawnParticles = (x: number, z: number, color: string | number, count: number = 15) => {
    if (!sceneRef.current) return;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color(color);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = x;
      positions[i * 3 + 1] = 0.5;
      positions[i * 3 + 2] = z;

      velocities[i * 3] = (Math.random() - 0.5) * 0.15;
      velocities[i * 3 + 1] = Math.random() * 0.15;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.15;

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    sceneRef.current.add(points);

    particlesRef.current.push({
      mesh: points,
      velocities,
      lifetimes: new Float32Array(count).fill(1.0),
      startTime: Date.now()
    });
  };

  useEffect(() => {
    // Fade in/out mode elements
    setModeOpacity(0);
    const timeout = setTimeout(() => setModeOpacity(1), 100);

    // Audio setup for Orbit
    if (gameMode === 'orbit') {
      (sceneRef.current as any).orbitStartTime = Date.now();
      if (!audioContextRef.current) {
        const initAudio = async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 256;
            
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
            setIsAudioActive(true);
          } catch (err) {
            console.error('Microphone access denied for Orbit mode', err);
          }
        };
        initAudio();
      }
    }

    if (gameMode === 'pinball') {
      pinballStartTimeRef.current = Date.now();
      isPinballActiveRef.current = false;
      pinballSubModeRef.current = 'pool';
    }

    return () => clearTimeout(timeout);
  }, [gameMode]);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      if (width > 0 && height > 0) {
        console.log(`MarbleScene container size: ${width}x${height}`);
      }
    };

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(containerRef.current);
    updateSize();

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;
    
    console.log(`Initializing MarbleScene: ${width}x${height}, Marbles: ${marbles.length}`);

    // Matter.js Setup
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0 } // Gravity handled by tilt
    });
    engineRef.current = engine;

    const runner = Matter.Runner.create();
    runnerRef.current = runner;

    const wallThickness = 100;
    const walls = [
      Matter.Bodies.rectangle(width / 2, -wallThickness / 2, width, wallThickness, { isStatic: true, label: 'wall' }),
      Matter.Bodies.rectangle(width / 2, height + wallThickness / 2, width, wallThickness, { isStatic: true, label: 'wall' }),
      Matter.Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height, { isStatic: true, label: 'wall' }),
      Matter.Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height, { isStatic: true, label: 'wall' })
    ];
    Matter.World.add(engine.world, walls);

    // Three.js Setup
    const scene = new THREE.Scene();
    (sceneRef as any).current = scene;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 45, 0); // True top-down view from higher up
    camera.lookAt(0, 0, 0);
    (cameraRef as any).current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    (rendererRef as any).current = renderer;

    // Open Box Architecture (No Top)
    const roomGroup = new THREE.Group();
    const roomMat = new THREE.MeshStandardMaterial({ 
      color: (BOX_MATERIALS[material] as any).color || 0xf4f4f4, 
      roughness: 0.8,
      metalness: 0.2,
      transparent: true,
      opacity: 1
    });

    const boxW = width * THREE_SCALE;
    const boxH = 20;
    const boxD = height * THREE_SCALE;

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(boxW, boxD), roomMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    roomGroup.add(floor);

    // Walls
    const wallGeoW = new THREE.PlaneGeometry(boxW, boxH);
    const wallGeoD = new THREE.PlaneGeometry(boxD, boxH);

    const backWall = new THREE.Mesh(wallGeoW, roomMat);
    backWall.position.z = -boxD / 2;
    backWall.position.y = boxH / 2;
    roomGroup.add(backWall);

    const frontWall = new THREE.Mesh(wallGeoW, roomMat);
    frontWall.position.z = boxD / 2;
    frontWall.position.y = boxH / 2;
    frontWall.rotation.y = Math.PI;
    roomGroup.add(frontWall);

    const leftWall = new THREE.Mesh(wallGeoD, roomMat);
    leftWall.position.x = -boxW / 2;
    leftWall.position.y = boxH / 2;
    leftWall.rotation.y = Math.PI / 2;
    roomGroup.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeoD, roomMat);
    rightWall.position.x = boxW / 2;
    rightWall.position.y = boxH / 2;
    rightWall.rotation.y = -Math.PI / 2;
    roomGroup.add(rightWall);

    scene.add(roomGroup);
    (roomRef as any).current = roomGroup;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const lights = new THREE.Group();
    const spotLight = new THREE.SpotLight(0xffffff, 2.5);
    spotLight.position.set(0, 30, 10);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    lights.add(spotLight);
    scene.add(lights);
    (lightsRef as any).current = lights;

    // Star Field
    const starsGroup = new THREE.Group();
    const createStars = (count: number, size: number, color: number, depth: number, seed: number) => {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const random = (s: number) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
      };
      
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (random(seed + i * 3) - 0.5) * 40;
        positions[i * 3 + 1] = (random(seed + i * 3 + 1) - 0.5) * 40;
        positions[i * 3 + 2] = (random(seed + i * 3 + 2) - 0.5) * 40;
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({ 
        size, 
        color, 
        transparent: true, 
        opacity: 0,
        sizeAttenuation: true 
      });
      const points = new THREE.Points(geometry, material);
      (points as any).depthFactor = depth;
      return points;
    };

    const bgStars = createStars(400, 0.02, 0xffffff, 0.1, 123);
    const midStars = createStars(150, 0.05, 0xccddee, 0.3, 456);
    const fgStars = createStars(30, 0.1, 0xffffff, 0.8, 789);
    
    starsGroup.add(bgStars, midStars, fgStars);
    scene.add(starsGroup);
    (starsRef as any).current = starsGroup;

    // Create Marbles
    const marbleBodies: Matter.Body[] = [];
    marbles.forEach((m, i) => {
      const radius = gameMode === 'pinball' ? 15 : 25;
      let x = (width / 6) * (i + 1);
      let y = height / 2;

      if (gameMode === 'pinball') {
        // Start one marble in plunger lane, others at top
        if (i === 0) {
          x = width - 35;
          y = height - 100;
        } else {
          x = width / 2 + (i - 2) * 40;
          y = 100;
        }
      }

      const body = Matter.Bodies.circle(x, y, radius, {
        restitution: 0.8,
        friction: 0.005,
        frictionAir: isFidgetMode ? 0.01 : 0.02,
        label: `marble-${m.id}`
      });
      bodiesRef.current.set(m.id, body);
      marbleBodies.push(body);

      // Three.js Marble
      const marbleGeo = new THREE.SphereGeometry(radius * THREE_SCALE, 32, 32);
      const marbleMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(m.color || 0xffffff),
        roughness: m.status === 'frosted' ? 0.8 : 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.9,
        transmission: m.status === 'identified' ? 0.6 : 0.1,
        thickness: 0.5,
        emissive: new THREE.Color(m.color || 0xffffff),
        emissiveIntensity: m.status === 'identified' ? 0.5 * (m.resonance || 0.5) : 0.2
      });
      const mesh = new THREE.Mesh(marbleGeo, marbleMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      marbleMeshesRef.current.set(m.id, mesh);

      // Inner Liquid with Clipping
      const liquidGeo = new THREE.SphereGeometry(radius * THREE_SCALE * 0.98, 32, 32);
      const clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
      const liquidMat = new THREE.MeshStandardMaterial({
        color: m.color || 0xcccccc,
        roughness: 0.2,
        metalness: 0.3,
        transparent: true,
        opacity: 0.8,
        clippingPlanes: [clippingPlane],
        clipShadows: true
      });
      const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
      mesh.add(liquidMesh);
      (mesh as any).liquidPlane = clippingPlane;
      (mesh as any).liquidMat = liquidMat;

      // Comet Trail for Orbit Mode
      const trailPoints = 50;
      const trailGeo = new THREE.BufferGeometry();
      const trailPos = new Float32Array(trailPoints * 3);
      const trailColors = new Float32Array(trailPoints * 3);
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
      trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
      const trailMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        linewidth: 2
      });
      const trail = new THREE.Line(trailGeo, trailMat);
      scene.add(trail);
      marbleTrailsRef.current.set(m.id, trail);
    });
    Matter.World.add(engine.world, marbleBodies);

    // Game Mode Specific Elements
    const modeGroup = new THREE.Group();
    scene.add(modeGroup);
    modeElementsRef.current = modeGroup;

    if (gameMode === 'run') {
      const ramps = [
        Matter.Bodies.rectangle(width * 0.3, height * 0.3, width * 0.5, 10, { isStatic: true, angle: 0.2 }),
        Matter.Bodies.rectangle(width * 0.7, height * 0.6, width * 0.5, 10, { isStatic: true, angle: -0.2 }),
        Matter.Bodies.rectangle(width * 0.3, height * 0.8, width * 0.5, 10, { isStatic: true, angle: 0.2 })
      ];
      Matter.World.add(engine.world, ramps);

      ramps.forEach(r => {
        const rampGeo = new THREE.BoxGeometry(width * 0.5 * THREE_SCALE, 0.2, 2);
        const rampMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.9, transparent: true, opacity: 0 });
        const mesh = new THREE.Mesh(rampGeo, rampMat);
        mesh.position.x = (r.position.x - width / 2) * THREE_SCALE;
        mesh.position.z = (r.position.y - height / 2) * THREE_SCALE;
        mesh.rotation.y = -r.angle;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        modeGroup.add(mesh);
      });
    } else    if (gameMode === 'pinball') {
      // Clear refs
      bumpersRef.current = [];
      slingshotsRef.current = [];
      pinballPocketsRef.current = [];
      spinningWheelsRef.current = [];
      gravityWellsRef.current = [];
      accumulatedBumpersRef.current = [];

      const pinballGroup = new THREE.Group();
      scene.add(pinballGroup);
      pinballElementsRef.current = pinballGroup;

      // Flippers
      const flipperWidth = 100;
      const flipperHeight = 20;
      const leftPivot = { x: width * 0.35, y: height - 80 };
      const rightPivot = { x: width * 0.65, y: height - 80 };

      const leftFlipper = Matter.Bodies.rectangle(leftPivot.x + flipperWidth / 2 - 10, leftPivot.y, flipperWidth, flipperHeight, { 
        label: 'flipper-left',
        chamfer: { radius: 10 },
        mass: 5,
        restitution: 0.5,
        friction: 0.01,
        isSensor: true // Start as sensor (pool mode)
      });
      const rightFlipper = Matter.Bodies.rectangle(rightPivot.x - flipperWidth / 2 + 10, rightPivot.y, flipperWidth, flipperHeight, { 
        label: 'flipper-right',
        chamfer: { radius: 10 },
        mass: 5,
        restitution: 0.5,
        friction: 0.01,
        isSensor: true // Start as sensor
      });

      const leftConstraint = Matter.Constraint.create({
        pointA: leftPivot,
        bodyB: leftFlipper,
        pointB: { x: -flipperWidth / 2 + 10, y: 0 },
        stiffness: 1,
        length: 0
      });
      const rightConstraint = Matter.Constraint.create({
        pointA: rightPivot,
        bodyB: rightFlipper,
        pointB: { x: flipperWidth / 2 - 10, y: 0 },
        stiffness: 1,
        length: 0
      });

      Matter.World.add(engine.world, [leftFlipper, rightFlipper, leftConstraint, rightConstraint]);

      const flipperGeo = new THREE.BoxGeometry(flipperWidth * THREE_SCALE, 0.5, flipperHeight * THREE_SCALE);
      const flipperMat = new THREE.MeshStandardMaterial({ color: 0xcd7f32, metalness: 0.8, roughness: 0.2, transparent: true, opacity: 0 });
      const leftMesh = new THREE.Mesh(flipperGeo, flipperMat);
      const rightMesh = new THREE.Mesh(flipperGeo, flipperMat);
      pinballGroup.add(leftMesh, rightMesh);
      
      flippersRef.current = { left: leftFlipper, right: rightFlipper, leftMesh, rightMesh };

      // Bumpers
      const bumperPositions = [
        { x: width * 0.5, y: height * 0.3 },
        { x: width * 0.35, y: height * 0.2 },
        { x: width * 0.65, y: height * 0.2 },
        { x: width * 0.4, y: height * 0.45 },
        { x: width * 0.6, y: height * 0.45 }
      ];
      bumperPositions.forEach((pos, i) => {
        const body = Matter.Bodies.circle(pos.x, pos.y, 30, { isStatic: true, restitution: 1.5, label: 'bumper', isSensor: true });
        Matter.World.add(engine.world, body);
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(30 * THREE_SCALE, 30 * THREE_SCALE, 1, 32),
          new THREE.MeshStandardMaterial({ color: marbles[i % 5].color || 0xffffff, emissive: marbles[i % 5].color || 0xffffff, emissiveIntensity: 0.5, transparent: true, opacity: 0 })
        );
        mesh.position.set((pos.x - width / 2) * THREE_SCALE, 0.5, (pos.y - height / 2) * THREE_SCALE);
        pinballGroup.add(mesh);
        bumpersRef.current.push({ body, mesh, color: marbles[i % 5].color || '#ffffff' });
      });

      // Slingshots
      const slingshotPositions = [
        { x: width * 0.22, y: height - 180, angle: 0.6 },
        { x: width * 0.78 - 60, y: height - 180, angle: -0.6 }
      ];
      slingshotPositions.forEach(pos => {
        const body = Matter.Bodies.rectangle(pos.x, pos.y, 80, 20, { 
          isStatic: true, 
          angle: pos.angle, 
          label: 'slingshot',
          restitution: 1.2,
          friction: 0.01,
          isSensor: true
        });
        Matter.World.add(engine.world, body);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(80 * THREE_SCALE, 1, 20 * THREE_SCALE),
          new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.2, transparent: true, opacity: 0 })
        );
        mesh.position.set((pos.x - width / 2) * THREE_SCALE, 0.5, (pos.y - height / 2) * THREE_SCALE);
        mesh.rotation.y = -pos.angle;
        pinballGroup.add(mesh);
        slingshotsRef.current.push({ body, mesh });
      });

      // Pockets
      const pocketRadius = 35;
      const pockets = [
        { x: pocketRadius, y: pocketRadius, id: 'tl' },
        { x: width - pocketRadius, y: pocketRadius, id: 'tr' },
        { x: pocketRadius, y: height / 2, id: 'ml' },
        { x: width - pocketRadius, y: height / 2, id: 'mr' },
        { x: pocketRadius, y: height - pocketRadius, id: 'bl' },
        { x: width - pocketRadius, y: height - pocketRadius, id: 'br' }
      ];
      pockets.forEach(pos => {
        const body = Matter.Bodies.circle(pos.x, pos.y, pocketRadius, { isStatic: true, isSensor: true, label: `pocket-${pos.id}` });
        Matter.World.add(engine.world, body);
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(pocketRadius * THREE_SCALE, pocketRadius * THREE_SCALE, 0.1, 32),
          new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 })
        );
        mesh.position.set((pos.x - width / 2) * THREE_SCALE, 0.01, (pos.y - height / 2) * THREE_SCALE);
        pinballGroup.add(mesh);
        pinballPocketsRef.current.push(body);
      });

      // Plunger Lane Wall
      const plungerWall = Matter.Bodies.rectangle(width - 60, height / 2 + 100, 10, height - 200, { isStatic: true, label: 'wall' });
      Matter.World.add(engine.world, plungerWall);
      const plungerWallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(10 * THREE_SCALE, 1, (height - 200) * THREE_SCALE),
        new THREE.MeshStandardMaterial({ color: 0x555555 })
      );
      plungerWallMesh.position.set((width - 60 - width / 2) * THREE_SCALE, 0.5, (height / 2 + 100 - height / 2) * THREE_SCALE);
      pinballGroup.add(plungerWallMesh);

      // Plunger Lane Top Guide (Curve)
      const plungerGuide = Matter.Bodies.rectangle(width - 100, 80, 150, 10, { 
        isStatic: true, 
        angle: -Math.PI / 6,
        label: 'wall'
      });
      Matter.World.add(engine.world, plungerGuide);
      const plungerGuideMesh = new THREE.Mesh(
        new THREE.BoxGeometry(150 * THREE_SCALE, 1, 10 * THREE_SCALE),
        new THREE.MeshStandardMaterial({ color: 0x555555 })
      );
      plungerGuideMesh.position.set((width - 100 - width / 2) * THREE_SCALE, 0.5, (80 - height / 2) * THREE_SCALE);
      plungerGuideMesh.rotation.y = Math.PI / 6;
      pinballGroup.add(plungerGuideMesh);

      // Side Rails
      const leftRail = Matter.Bodies.rectangle(60, height / 2, 10, height, { isStatic: true, label: 'wall' });
      const rightRail = Matter.Bodies.rectangle(width - 10, height / 2, 10, height, { isStatic: true, label: 'wall' });
      
      // Slanted Bottom for Pinball (Guiding to flippers)
      const bottomSlantLeft = Matter.Bodies.rectangle(width * 0.15, height - 150, width * 0.4, 20, { 
        isStatic: true, 
        angle: 0.6,
        label: 'wall'
      });
      const bottomSlantRight = Matter.Bodies.rectangle(width * 0.85 - 60, height - 150, width * 0.4, 20, { 
        isStatic: true, 
        angle: -0.6,
        label: 'wall'
      });

      // Drain Sensor
      const drainSensor = Matter.Bodies.rectangle(width / 2, height + 50, width, 100, { isStatic: true, isSensor: true, label: 'drain' });

      Matter.World.add(engine.world, [leftRail, rightRail, bottomSlantLeft, bottomSlantRight, drainSensor]);
      
      // Drain Visual
      const drainMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width * THREE_SCALE, 5),
        new THREE.MeshStandardMaterial({ color: 0x111111, transparent: true, opacity: 0.5 })
      );
      drainMesh.position.set(0, 0.05, (height / 2) * THREE_SCALE);
      drainMesh.rotation.x = -Math.PI / 2;
      pinballGroup.add(drainMesh);
      
      const railGeo = new THREE.BoxGeometry(10 * THREE_SCALE, 1, height * THREE_SCALE);
      const railMat = new THREE.MeshStandardMaterial({ color: 0xcd7f32, metalness: 0.8, roughness: 0.2 }); // Brass rails
      const leftRailMesh = new THREE.Mesh(railGeo, railMat);
      leftRailMesh.position.set((60 - width / 2) * THREE_SCALE, 0.5, 0);
      const rightRailMesh = new THREE.Mesh(railGeo, railMat);
      rightRailMesh.position.set((width - 10 - width / 2) * THREE_SCALE, 0.5, 0);
      pinballGroup.add(leftRailMesh, rightRailMesh);

      const slantGeo = new THREE.BoxGeometry(width * 0.4 * THREE_SCALE, 1, 20 * THREE_SCALE);
      const slantMeshLeft = new THREE.Mesh(slantGeo, railMat);
      slantMeshLeft.position.set((width * 0.15 - width / 2) * THREE_SCALE, 0.5, (height - 150 - height / 2) * THREE_SCALE);
      slantMeshLeft.rotation.y = -0.6;
      const slantMeshRight = new THREE.Mesh(slantGeo, railMat);
      slantMeshRight.position.set((width * 0.85 - 60 - width / 2) * THREE_SCALE, 0.5, (height - 150 - height / 2) * THREE_SCALE);
      slantMeshRight.rotation.y = 0.6;
      pinballGroup.add(slantMeshLeft, slantMeshRight);

      // Central Ramp
      const rampWidth = 150;
      const rampHeight = 200;
      const rampBody = Matter.Bodies.rectangle(width / 2, height * 0.4, rampWidth, rampHeight, { 
        isStatic: true, 
        isSensor: true, 
        label: 'ramp' 
      });
      Matter.World.add(engine.world, rampBody);
      const rampMesh = new THREE.Mesh(
        new THREE.BoxGeometry(rampWidth * THREE_SCALE, 0.2, rampHeight * THREE_SCALE),
        new THREE.MeshStandardMaterial({ color: 0x4444ff, transparent: true, opacity: 0 })
      );
      rampMesh.position.set(0, 1, (height * 0.4 - height / 2) * THREE_SCALE);
      rampMesh.rotation.x = -0.1;
      pinballGroup.add(rampMesh);

      // Side Rail (Left)
      const sideRailBody = Matter.Bodies.rectangle(100, height * 0.2, 10, 300, { isStatic: true, isSensor: true, label: 'side-rail' });
      Matter.World.add(engine.world, sideRailBody);
      const sideRailMesh = new THREE.Mesh(
        new THREE.BoxGeometry(10 * THREE_SCALE, 0.2, 300 * THREE_SCALE),
        new THREE.MeshStandardMaterial({ color: 0xcd7f32, metalness: 0.8, transparent: true, opacity: 0 })
      );
      sideRailMesh.position.set((100 - width / 2) * THREE_SCALE, 1, (height * 0.2 - height / 2) * THREE_SCALE);
      pinballGroup.add(sideRailMesh);

      // Maze Mode
      if (gameMode === 'maze') {
        const mazeSize = 15;
        const maze = generateMaze(mazeSize);
        mazeRef.current = maze;
        const cellSize = width / mazeSize;
        const mazeGroup = new THREE.Group();
        
        maze.grid.forEach((row, y) => {
          row.forEach((cell, x) => {
            if (cell === 1) {
              const wallBody = Matter.Bodies.rectangle(
                x * cellSize + cellSize / 2,
                y * cellSize + cellSize / 2,
                cellSize,
                cellSize,
                { isStatic: true, label: 'maze-wall' }
              );
              Matter.World.add(engine.world, wallBody);
              const wallMesh = new THREE.Mesh(
                new THREE.BoxGeometry(cellSize * THREE_SCALE, 2, cellSize * THREE_SCALE),
                new THREE.MeshStandardMaterial({ color: 0x444444 })
              );
              wallMesh.position.set(
                (x * cellSize + cellSize / 2 - width / 2) * THREE_SCALE,
                1,
                (y * cellSize + cellSize / 2 - height / 2) * THREE_SCALE
              );
              mazeGroup.add(wallMesh);
            }
          });
        });

        // Goal
        const goalBody = Matter.Bodies.rectangle(
          maze.goal.x * cellSize + cellSize / 2,
          maze.goal.y * cellSize + cellSize / 2,
          cellSize,
          cellSize,
          { isStatic: true, isSensor: true, label: 'maze-goal' }
        );
        Matter.World.add(engine.world, goalBody);
        const goalMesh = new THREE.Mesh(
          new THREE.BoxGeometry(cellSize * THREE_SCALE, 0.1, cellSize * THREE_SCALE),
          new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.5 })
        );
        goalMesh.position.set(
          (maze.goal.x * cellSize + cellSize / 2 - width / 2) * THREE_SCALE,
          0.05,
          (maze.goal.y * cellSize + cellSize / 2 - height / 2) * THREE_SCALE
        );
        mazeGroup.add(goalMesh);

        // Traps
        maze.traps.forEach(trap => {
          const trapBody = Matter.Bodies.rectangle(
            trap.x * cellSize + cellSize / 2,
            trap.y * cellSize + cellSize / 2,
            cellSize,
            cellSize,
            { isStatic: true, isSensor: true, label: 'maze-trap' }
          );
          Matter.World.add(engine.world, trapBody);
          const trapMesh = new THREE.Mesh(
            new THREE.BoxGeometry(cellSize * THREE_SCALE, 0.1, cellSize * THREE_SCALE),
            new THREE.MeshStandardMaterial({ color: 0x000000 })
          );
          trapMesh.position.set(
            (trap.x * cellSize + cellSize / 2 - width / 2) * THREE_SCALE,
            0.05,
            (trap.y * cellSize + cellSize / 2 - height / 2) * THREE_SCALE
          );
          mazeGroup.add(trapMesh);
        });

        scene.add(mazeGroup);
        mazeGroupRef.current = mazeGroup;
      }

      // Spinning Wheels
      const wheelPositions = [
        { x: width * 0.25, y: height * 0.15 },
        { x: width * 0.75, y: height * 0.15 }
      ];
      wheelPositions.forEach(pos => {
        const body = Matter.Bodies.circle(pos.x, pos.y, 40, { isStatic: true, label: 'wheel', isSensor: true });
        Matter.World.add(engine.world, body);
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(40 * THREE_SCALE, 40 * THREE_SCALE, 0.5, 32),
          new THREE.MeshStandardMaterial({ color: 0xffff00, metalness: 0.5, transparent: true, opacity: 0 })
        );
        mesh.position.set((pos.x - width / 2) * THREE_SCALE, 0.25, (pos.y - height / 2) * THREE_SCALE);
        pinballGroup.add(mesh);
        spinningWheelsRef.current.push({ body, mesh });
      });

      // Gravity Wells
      const wellPositions = [
        { x: width * 0.3, y: height * 0.6 },
        { x: width * 0.7, y: height * 0.6 }
      ];
      wellPositions.forEach(pos => {
        const body = Matter.Bodies.circle(pos.x, pos.y, 60, { isStatic: true, isSensor: true, label: 'well' });
        Matter.World.add(engine.world, body);
        const mesh = new THREE.Mesh(
          new THREE.TorusGeometry(50 * THREE_SCALE, 5 * THREE_SCALE, 16, 100),
          new THREE.MeshStandardMaterial({ color: 0x8800ff, emissive: 0x8800ff, emissiveIntensity: 0.5, transparent: true, opacity: 0 })
        );
        mesh.position.set((pos.x - width / 2) * THREE_SCALE, 0.1, (pos.y - height / 2) * THREE_SCALE);
        mesh.rotation.x = Math.PI / 2;
        pinballGroup.add(mesh);
        gravityWellsRef.current.push({ body, mesh });
      });

      // Plunger Visual
      const plungerGeo = new THREE.CylinderGeometry(20 * THREE_SCALE, 20 * THREE_SCALE, 1, 32);
      const plungerMat = new THREE.MeshStandardMaterial({ color: 0xcd7f32, metalness: 0.8 });
      const plungerMesh = new THREE.Mesh(plungerGeo, plungerMat);
      plungerMesh.position.set((width - 35 - width / 2) * THREE_SCALE, 0.5, (height - 30 - height / 2) * THREE_SCALE);
      pinballGroup.add(plungerMesh);
      plungerRef.current = plungerMesh;
    }

    // Collision detection
    const collisionHandler = (event: Matter.IEventCollision<Matter.Engine>) => {
      event.pairs.forEach(pair => {
        const labels = [pair.bodyA.label, pair.bodyB.label];
        const marbleBody = pair.bodyA.label.startsWith('marble') ? pair.bodyA : (pair.bodyB.label.startsWith('marble') ? pair.bodyB : null);
        if (!marbleBody) return;
        const marbleId = parseInt(marbleBody.label.split('-')[1]);
        const marble = marbles.find(m => m.id === marbleId);
        if (!marble) return;

        if (labels.some(l => l === 'drain') && gameMode === 'pinball') {
          // Reset marble to plunger lane
          Matter.Body.setPosition(marbleBody, { x: width - 35, y: height - 100 });
          Matter.Body.setVelocity(marbleBody, { x: 0, y: 0 });
          return;
        }

        if (labels.some(l => l.startsWith('pocket')) && gameMode === 'pinball') {
          const pocketLabel = labels.find(l => l.startsWith('pocket'))!;
          const pocketId = pocketLabel.split('-')[1];
          const pocketBody = pair.bodyA.label === pocketLabel ? pair.bodyA : pair.bodyB;
          const pockets = pinballPocketsRef.current;
          const otherPockets = pockets.filter(p => p !== pocketBody);
          const exitPocket = otherPockets[Math.floor(Math.random() * otherPockets.length)];
          
          // Pool -> Pinball Transition on first pocket
          if (pinballSubModeRef.current === 'pool') {
            pinballSubModeRef.current = 'pinball';
            // Enable physics for pinball elements
            if (flippersRef.current) {
              flippersRef.current.left.isSensor = false;
              flippersRef.current.right.isSensor = false;
            }
            bumpersRef.current.forEach(b => b.body.isSensor = false);
            slingshotsRef.current.forEach(s => s.body.isSensor = false);
            spinningWheelsRef.current.forEach(w => w.body.isSensor = false);
          }

          // Special bottom left pocket logic
          if (pocketId === 'bl') {
            // Transform to bumper
            const pos = { x: width / 2 + (Math.random() - 0.5) * 200, y: height / 2 + (Math.random() - 0.5) * 200 };
            const body = Matter.Bodies.circle(pos.x, pos.y, 30, { isStatic: true, restitution: 1.5, label: 'bumper' });
            Matter.World.add(engineRef.current!.world, body);
            const mesh = new THREE.Mesh(
              new THREE.CylinderGeometry(30 * THREE_SCALE, 30 * THREE_SCALE, 1, 32),
              new THREE.MeshStandardMaterial({ color: marble.color || 0xffffff, emissive: marble.color || 0xffffff, emissiveIntensity: 0.5 })
            );
            mesh.position.set((pos.x - width / 2) * THREE_SCALE, 0.5, (pos.y - height / 2) * THREE_SCALE);
            pinballElementsRef.current?.add(mesh);
            accumulatedBumpersRef.current.push({ body, mesh, color: marble.color || '#ffffff' });
          }

          Matter.Body.setPosition(marbleBody, { x: exitPocket.position.x, y: exitPocket.position.y });
          const angle = Math.random() * Math.PI * 2;
          Matter.Body.setVelocity(marbleBody, { x: Math.cos(angle) * 10, y: Math.sin(angle) * 10 });
          
          // Scoring
          if (updateMarble) {
            const multiplier = marble.fillLevel >= 90 ? 3 : 1;
            const bonus = marble.identity === 'The Echo' ? 2 : 1; // Relationships -> Echo
            updateMarble(marbleId, { 
              score: (marble.score || 0) + 500 * multiplier * bonus,
              exp: (marble.exp || 0) + 50
            });
          }
        } else if (labels.includes('bumper')) {
          // Bumper hit
          const multiplier = marble.fillLevel >= 90 ? 3 : 1;
          const bonus = marble.identity === 'The Prism' ? 2 : 1; // Nutrition -> Prism
          if (updateMarble) {
            updateMarble(marbleId, { 
              score: (marble.score || 0) + 100 * multiplier * bonus,
              exp: (marble.exp || 0) + 10
            });
          }
          // Apply extra impulse for bumper feel
          const bumperBody = pair.bodyA.label === 'bumper' ? pair.bodyA : pair.bodyB;
          const bumperObj = bumpersRef.current.find(b => b.body === bumperBody);
          if (bumperObj) {
            bumperObj.mesh.material.emissiveIntensity = 4; // Brighter Flash
            spawnParticles(bumperObj.mesh.position.x, bumperObj.mesh.position.z, bumperObj.color, 20);
          }
          
          // Flash the marble
          const marbleMesh = marbleMeshesRef.current.get(marbleId);
          if (marbleMesh) {
            (marbleMesh.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 2;
          }
          
          const forceDir = Matter.Vector.normalise(Matter.Vector.sub(marbleBody.position, bumperBody.position));
          Matter.Body.applyForce(marbleBody, marbleBody.position, Matter.Vector.mult(forceDir, 0.05));
        } else if (labels.includes('slingshot')) {
          // Slingshot hit
          const slingshotBody = pair.bodyA.label === 'slingshot' ? pair.bodyA : pair.bodyB;
          const slingshotObj = slingshotsRef.current.find(s => s.body === slingshotBody);
          if (slingshotObj) {
            slingshotObj.mesh.material.emissiveIntensity = 2; // Flash
            spawnParticles(slingshotObj.mesh.position.x, slingshotObj.mesh.position.z, 0xffffff, 15);
          }

          // Flash the marble
          const marbleMesh = marbleMeshesRef.current.get(marbleId);
          if (marbleMesh) {
            (marbleMesh.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 2;
          }

          const forceDir = Matter.Vector.normalise(Matter.Vector.sub(marbleBody.position, slingshotBody.position));
          Matter.Body.applyForce(marbleBody, marbleBody.position, Matter.Vector.mult(forceDir, 0.1));
          
          if (updateMarble) {
            updateMarble(marbleId, { 
              score: (marble.score || 0) + 50,
              exp: (marble.exp || 0) + 5
            });
          }
        } else if (labels.includes('flipper-left') || labels.includes('flipper-right')) {
          // Flipper hit
          const marbleMesh = marbleMeshesRef.current.get(marbleId);
          if (marbleMesh) {
            (marbleMesh.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 1.5;
            const contactPoint = pair.activeContacts[0]?.vertex || marbleBody.position;
            spawnParticles(
              (contactPoint.x - width / 2) * THREE_SCALE,
              (contactPoint.y - height / 2) * THREE_SCALE,
              marble.color || 0xffffff,
              8
            );
          }
        } else if (labels.includes('ramp')) {
          const multiplier = marble.fillLevel >= 90 ? 3 : 1;
          const bonus = marble.identity === 'The Anchor' ? 2 : 1; // Movement -> Anchor
          if (updateMarble) {
            updateMarble(marbleId, { 
              score: (marble.score || 0) + 200 * multiplier * bonus,
              exp: (marble.exp || 0) + 20
            });
          }
        } else if (labels.includes('side-rail')) {
          const multiplier = marble.fillLevel >= 90 ? 3 : 1;
          const bonus = marble.identity === 'The Anchor' ? 2 : 1;
          if (updateMarble) {
            updateMarble(marbleId, { 
              score: (marble.score || 0) + 300 * multiplier * bonus,
              exp: (marble.exp || 0) + 30
            });
          }
        } else if (labels.includes('flipper-left') || labels.includes('flipper-right')) {
          const isLeft = labels.includes('flipper-left');
          const isActive = isLeft ? flipperLeftRef.current : flipperRightRef.current;
          if (isActive) {
            // Kick the marble up and slightly outward
            const kickDir = { x: isLeft ? 0.05 : -0.05, y: -0.2 };
            Matter.Body.applyForce(marbleBody, marbleBody.position, kickDir);
          }
        } else if (labels.includes('maze-goal')) {
          // Maze Victory
          if (onModeChange) {
            console.log('MAZE VICTORY');
            // Reset maze or change mode
          }
        } else if (labels.includes('maze-trap')) {
          // Reset marble to start
          Matter.Body.setPosition(marbleBody, { x: 50, y: 50 });
          Matter.Body.setVelocity(marbleBody, { x: 0, y: 0 });
        }
      });
    };
    Matter.Events.on(engine, 'collisionStart', collisionHandler);

    // Mouse constraint for interaction
    const mouse = Matter.Mouse.create(renderer.domElement);
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: {
        stiffness: 0.1,
        render: { visible: false }
      }
    });
    Matter.World.add(engine.world, mouseConstraint);

    // Enable clipping in renderer
    renderer.localClippingEnabled = true;

    // Animation Loop
    let frameCount = 0;
    const animate = () => {
      if (!engineRef.current || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;
      
      frameCount++;
      if (frameCount === 1) {
        console.log('Animation loop started. Scene has', sceneRef.current.children.length, 'objects.');
      }

      // Update Physics
      Matter.Engine.update(engineRef.current, 16.666);

      // Update Gravity and Physics based on Mode
      const currentTilt = tiltRef.current;
      const currentMarbles = marblesRef.current;
      if (gameMode === 'pinball') {
        const elapsed = (Date.now() - pinballStartTimeRef.current) / 1000;
        
        // Pool -> Pinball Transition
        if (elapsed > 2 && pinballSubModeRef.current === 'pool') {
          pinballSubModeRef.current = 'pinball';
          // Enable physics for pinball elements
          if (flippersRef.current) {
            flippersRef.current.left.isSensor = false;
            flippersRef.current.right.isSensor = false;
          }
          bumpersRef.current.forEach(b => b.body.isSensor = false);
          slingshotsRef.current.forEach(s => s.body.isSensor = false);
          spinningWheelsRef.current.forEach(w => w.body.isSensor = false);
        }

        if (elapsed > 3 && !isPinballActiveRef.current) {
          isPinballActiveRef.current = true;
        }

        // Camera Transition
        const targetCamPos = new THREE.Vector3(0, 40, 5);
        cameraRef.current.position.lerp(targetCamPos, 0.02);
        cameraRef.current.lookAt(0, 0, 0);

        // Gravity (Tilted Table Simulation)
        engineRef.current.gravity.x = currentTilt.x * 0.5;
        engineRef.current.gravity.y = 1.5 + currentTilt.y * 0.5;

        // Flipper Physics
        if (flippersRef.current) {
          const { left, right, leftMesh, rightMesh } = flippersRef.current;
          
          // Left Flipper
          const leftTargetAngle = flipperLeft ? -0.5 : 0.5;
          const leftAngleDiff = leftTargetAngle - left.angle;
          Matter.Body.setAngularVelocity(left, leftAngleDiff * 0.5);
          
          // Right Flipper
          const rightTargetAngle = flipperRight ? 0.5 : -0.5;
          const rightAngleDiff = rightTargetAngle - right.angle;
          Matter.Body.setAngularVelocity(right, rightAngleDiff * 0.5);
          
          leftMesh.position.x = (left.position.x - width / 2) * THREE_SCALE;
          leftMesh.position.z = (left.position.y - height / 2) * THREE_SCALE;
          leftMesh.rotation.y = -left.angle;
          leftMesh.material.opacity = THREE.MathUtils.lerp(leftMesh.material.opacity, pinballSubModeRef.current === 'pinball' ? 1 : 0, 0.05);

          rightMesh.position.x = (right.position.x - width / 2) * THREE_SCALE;
          rightMesh.position.z = (right.position.y - height / 2) * THREE_SCALE;
          rightMesh.rotation.y = -right.angle;
          rightMesh.material.opacity = THREE.MathUtils.lerp(rightMesh.material.opacity, pinballSubModeRef.current === 'pinball' ? 1 : 0, 0.05);
        }

        // Update Bumpers Opacity and Flash Decay
        bumpersRef.current.forEach(b => {
          b.mesh.material.opacity = THREE.MathUtils.lerp(b.mesh.material.opacity, pinballSubModeRef.current === 'pinball' ? 1 : 0, 0.05);
          b.mesh.material.emissiveIntensity = THREE.MathUtils.lerp(b.mesh.material.emissiveIntensity, 0.5, 0.1);
        });
        slingshotsRef.current.forEach(s => {
          s.mesh.material.opacity = THREE.MathUtils.lerp(s.mesh.material.opacity, pinballSubModeRef.current === 'pinball' ? 1 : 0, 0.05);
          s.mesh.material.emissiveIntensity = THREE.MathUtils.lerp(s.mesh.material.emissiveIntensity, 0.2, 0.1);
        });

        // Update Accumulated Bumpers
        accumulatedBumpersRef.current.forEach(b => {
          b.mesh.material.emissiveIntensity = THREE.MathUtils.lerp(b.mesh.material.emissiveIntensity, 0.5, 0.1);
        });

        // Update Spinning Wheels
        spinningWheelsRef.current.forEach(wheel => {
          const direction = Math.floor(elapsed / 30) % 2 === 0 ? 1 : -1;
          wheel.mesh.rotation.y += 0.1 * direction;
          wheel.mesh.material.opacity = THREE.MathUtils.lerp(wheel.mesh.material.opacity, pinballSubModeRef.current === 'pinball' ? 1 : 0, 0.05);
          
          // Deflection logic
          currentMarbles.forEach(m => {
            const body = bodiesRef.current.get(m.id);
            if (body) {
              const dist = Matter.Vector.magnitude(Matter.Vector.sub(body.position, wheel.body.position));
              if (dist < 50) {
                const tangent = Matter.Vector.normalise({ x: -(body.position.y - wheel.body.position.y), y: body.position.x - wheel.body.position.x });
                Matter.Body.applyForce(body, body.position, Matter.Vector.mult(tangent, 0.002 * direction));
              }
            }
          });
        });

        // Update Gravity Wells
        gravityWellsRef.current.forEach(well => {
          well.mesh.rotation.z += 0.05;
          well.mesh.material.opacity = THREE.MathUtils.lerp(well.mesh.material.opacity, pinballSubModeRef.current === 'pinball' ? 1 : 0, 0.05);
          currentMarbles.forEach(m => {
            const body = bodiesRef.current.get(m.id);
            if (body) {
              const dist = Matter.Vector.magnitude(Matter.Vector.sub(body.position, well.body.position));
              if (dist < 150) {
                const multiplier = m.identity === 'The Observer' ? 2 : 1; // Sleep -> Observer
                const force = Matter.Vector.mult(
                  Matter.Vector.normalise(Matter.Vector.sub(well.body.position, body.position)),
                  0.0005 * (1 - dist / 150) * multiplier
                );
                Matter.Body.applyForce(body, body.position, force);
              }
            }
          });
        });

        // Plunger Logic
        if (plungerRelease.timestamp !== lastPlungerReleaseRef.current) {
          lastPlungerReleaseRef.current = plungerRelease.timestamp;
          // Find marble in plunger lane
          currentMarbles.forEach(m => {
            const body = bodiesRef.current.get(m.id);
            if (body && body.position.x > width - 60 && body.position.y > height - 100) {
              Matter.Body.applyForce(body, body.position, { x: 0, y: -0.005 * plungerRelease.charge });
            }
          });
        }

        if (plungerRef.current) {
          const targetZ = (height - 30 - height / 2) * THREE_SCALE + (plungerCharge / 100) * 2;
          plungerRef.current.position.z = THREE.MathUtils.lerp(plungerRef.current.position.z, targetZ, 0.1);
        }
      } else {
        // Default Gravity for other modes
        engineRef.current.gravity.x = currentTilt.x * 2;
        engineRef.current.gravity.y = currentTilt.y * 2;

        if (gameMode === 'maze') {
          // Isometric Top-Down for Maze
          cameraRef.current.position.lerp(new THREE.Vector3(0, 35, 0), 0.05);
          cameraRef.current.lookAt(0, 0, 0);
        } else {
          cameraRef.current.position.lerp(new THREE.Vector3(0, 45, 0), 0.05);
          cameraRef.current.lookAt(0, 0, 0);
        }
      }

      if (gameMode === 'orbit') {
        engineRef.current.gravity.x = 0;
        engineRef.current.gravity.y = 0;

        // Audio Analysis
        let bass = 0, mid = 0, high = 0;
        if (analyserRef.current && dataArrayRef.current) {
          analyserRef.current.getByteFrequencyData(dataArrayRef.current);
          const data = dataArrayRef.current;
          
          // Bass: 0-200Hz (approx first 10 bins for 256 fft)
          for (let i = 0; i < 10; i++) bass += data[i];
          bass /= 10 * 255;

          // Mid: 200-2000Hz (approx bins 10-100)
          for (let i = 10; i < 100; i++) mid += data[i];
          mid /= 90 * 255;

          // High: 2000Hz+ (approx bins 100+)
          for (let i = 100; i < data.length; i++) high += data[i];
          high /= (data.length - 100) * 255;
        }

        // Star Twinkles from High Freq
        if (high > 0.3 && Math.random() > 0.8) {
          const fgStars = starsRef.current?.children[2] as THREE.Points;
          if (fgStars) {
            starTwinkleRef.current = Array.from({ length: 5 }, () => Math.floor(Math.random() * 30));
          }
        }

        // Orbit Logic
        currentMarbles.forEach((m, i) => {
          const body = bodiesRef.current.get(m.id);
          const mesh = marbleMeshesRef.current.get(m.id);
          const trail = marbleTrailsRef.current.get(m.id);
          if (body && mesh) {
            // Orbit parameters
            const baseRadius = (m.fillLevel / 100) * 4 + 1; // 1 to 5 units
            const orbitRadius = baseRadius * (1 + bass * 0.5); // Pulse with bass
            const speed = (0.005 + (m.fillLevel / 100) * 0.02) * (1 + mid * 2); // Speed with mid
            
            orbitAngleRef.current[i] += speed;
            const angle = orbitAngleRef.current[i];
            const tiltAngle = orbitTiltRef.current[i];

            // Elliptical position
            const x = Math.cos(angle) * orbitRadius;
            const z = Math.sin(angle) * orbitRadius * 0.7; // Elliptical
            
            // Apply tilt
            let finalX = x;
            let finalY = Math.sin(angle) * orbitRadius * tiltAngle;
            let finalZ = z;

            // Gravitational effect from permanently glowing marbles
            currentMarbles.forEach((other, otherIdx) => {
              if (other.isPermanentlyGlowing && other.id !== m.id) {
                const otherAngle = orbitAngleRef.current[otherIdx];
                const otherBaseRadius = (other.fillLevel / 100) * 4 + 1;
                const otherOrbitRadius = otherBaseRadius * (1 + bass * 0.5);
                
                const ox = Math.cos(otherAngle) * otherOrbitRadius;
                const oz = Math.sin(otherAngle) * otherOrbitRadius * 0.7;
                const oy = Math.sin(otherAngle) * otherOrbitRadius * orbitTiltRef.current[otherIdx];

                const dx = ox - finalX;
                const dy = oy - finalY;
                const dz = oz - finalZ;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                
                if (dist < 2) {
                  const pull = (2 - dist) * 0.05;
                  finalX += dx * pull;
                  finalY += dy * pull;
                  finalZ += dz * pull;
                }
              }
            });

            // Sync Matter.js body
            Matter.Body.setPosition(body, {
              x: (finalX / THREE_SCALE) + width / 2,
              y: (finalZ / THREE_SCALE) + height / 2
            });
            Matter.Body.setVelocity(body, { x: 0, y: 0 });

            // Sync Three.js mesh
            mesh.position.set(finalX, finalY, finalZ);

            // Update Liquid Level and Color
            const plane = (mesh as any).liquidPlane;
            const liquidMat = (mesh as any).liquidMat;
            const outerMat = mesh.material as THREE.MeshPhysicalMaterial;
            
            if (plane) {
              const radius = (gameMode === 'pinball' ? 15 : 25) * mesh.scale.x;
              const fillHeight = (m.fillLevel / 100) * 2 * radius * THREE_SCALE;
              plane.constant = mesh.position.y - radius * THREE_SCALE + fillHeight;
            }
            if (liquidMat && m.color) {
              liquidMat.color.set(m.color);
              liquidMat.emissive.set(m.color);
              liquidMat.emissiveIntensity = 0.2 + (m.resonance || 0.5) * 0.3;
            }
            if (outerMat) {
              outerMat.roughness = THREE.MathUtils.lerp(outerMat.roughness, m.status === 'frosted' ? 0.8 : 0.1, 0.05);
              outerMat.transmission = THREE.MathUtils.lerp(outerMat.transmission, m.status === 'identified' ? 0.9 : 0.2, 0.05);
              outerMat.emissiveIntensity = THREE.MathUtils.lerp(outerMat.emissiveIntensity, m.status === 'identified' ? 0.5 * (m.resonance || 0.5) : 0.1, 0.05);
            }

            // Comet Trail
            if (trail && (m.isGlowActive || m.isPermanentlyGlowing)) {
              trail.visible = true;
              const trailMat = trail.material as THREE.LineBasicMaterial;
              trailMat.opacity = THREE.MathUtils.lerp(trailMat.opacity, 0.6, 0.05);
              
              const positions = trail.geometry.attributes.position.array as Float32Array;
              const colors = trail.geometry.attributes.color.array as Float32Array;
              const trailPoints = 50;
              const arcLength = Math.PI * 0.4; // 20% of circumference (2pi * 0.2)
              const baseColor = new THREE.Color(m.color || 0xffffff);
              
              for (let j = 0; j < trailPoints; j++) {
                const trailAngle = angle - (j / trailPoints) * arcLength;
                const tx = Math.cos(trailAngle) * orbitRadius;
                const tz = Math.sin(trailAngle) * orbitRadius * 0.7;
                const ty = Math.sin(trailAngle) * orbitRadius * tiltAngle;
                
                positions[j * 3] = tx;
                positions[j * 3 + 1] = ty;
                positions[j * 3 + 2] = tz;

                const alpha = 1 - (j / trailPoints);
                colors[j * 3] = baseColor.r * alpha;
                colors[j * 3 + 1] = baseColor.g * alpha;
                colors[j * 3 + 2] = baseColor.b * alpha;
              }
              trail.geometry.attributes.position.needsUpdate = true;
              trail.geometry.attributes.color.needsUpdate = true;
            } else if (trail) {
              (trail.material as THREE.LineBasicMaterial).opacity *= 0.9;
            }
          }
        });

        // Room and Stars Transition
        if (roomRef.current) {
          roomRef.current.children.forEach(child => {
            const mesh = child as THREE.Mesh;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0, 0.01);
            mat.transparent = true;
          });
        }
        if (starsRef.current) {
          starsRef.current.children.forEach((layer, i) => {
            const points = layer as THREE.Points;
            const mat = points.material as THREE.PointsMaterial;
            
            // Staggered fade in for stars
            // Background stars first, then mid, then foreground
            const layerDelay = i * 0.5; // 0s, 0.5s, 1s
            const elapsed = (Date.now() - (sceneRef.current as any).orbitStartTime) / 1000;
            
            if (elapsed > layerDelay) {
              const targetOpacity = 1;
              const fadeSpeed = 0.005 + i * 0.005; 
              mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, fadeSpeed);
            }
            
            // Parallax
            const factor = (points as any).depthFactor;
            points.position.x = tilt.x * factor * 2;
            points.position.y = tilt.y * factor * 2;

            // Twinkle
            if (i === 2) { // Foreground layer
              mat.size = 0.1 + high * 0.2;
            }
          });
        }
      } else if (isFidgetMode) {
        engineRef.current.gravity.x = 0;
        engineRef.current.gravity.y = 0;
        
        // Gentle floating force towards home positions
        marblesRef.current.forEach((m, i) => {
          const body = bodiesRef.current.get(m.id);
          if (body) {
            const targetX = (width / 6) * (i + 1);
            const targetY = height / 2 + Math.sin(Date.now() * 0.001 + i) * 20; // Slight bobbing
            const forceX = (targetX - body.position.x) * 0.00005;
            const forceY = (targetY - body.position.y) * 0.00005;
            Matter.Body.applyForce(body, body.position, { x: forceX, y: forceY });
            
            // Damping to keep them calm
            Matter.Body.setVelocity(body, { 
              x: body.velocity.x * 0.95, 
              y: body.velocity.y * 0.95 
            });
          }
        });
      } else {
        engineRef.current.gravity.x = currentTilt.x;
        engineRef.current.gravity.y = currentTilt.y;
      }

      // Room Material and Stars Update
      if (roomRef.current) {
        const targetMat = gameMode === 'pinball' ? 'pinball' : material;
        const targetColor = new THREE.Color((BOX_MATERIALS[targetMat] as any).color || 0xf4f4f4);
        roomRef.current.children.forEach(child => {
          const mesh = child as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          
          if (gameMode === 'orbit') {
            mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0, 0.01);
            mat.transparent = true;
          } else {
            mat.color.lerp(targetColor, 0.05);
            mat.opacity = THREE.MathUtils.lerp(mat.opacity, 1, 0.05);
            if (mat.opacity > 0.99) mat.transparent = false;
            
            if (gameMode === 'mood') {
              const hue = (Date.now() * 0.0001) % 1;
              mat.color.setHSL(hue, 0.5, 0.5);
            }
          }
        });
      }

      if (starsRef.current) {
        starsRef.current.children.forEach((layer) => {
          const points = layer as THREE.Points;
          const mat = points.material as THREE.PointsMaterial;
          const targetOpacity = gameMode === 'orbit' ? 1 : 0;
          mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.05);
        });
      }

      if (gameMode !== 'orbit') {
        marblesRef.current.forEach(m => {
          const body = bodiesRef.current.get(m.id);
          const mesh = marbleMeshesRef.current.get(m.id);
          if (body && mesh) {
            // Shrink marbles to 65% in pinball and maze mode
            const targetScale = (gameMode === 'pinball' || gameMode === 'maze') ? 0.65 : 1;
            const currentScale = mesh.scale.x;
            const newScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.02);
            
            if (Math.abs(newScale - currentScale) > 0.001) {
              const scaleFactor = newScale / currentScale;
              Matter.Body.scale(body, scaleFactor, scaleFactor);
              mesh.scale.set(newScale, newScale, newScale);
            }
            
            // Update physics radius
            const radius = (gameMode === 'pinball' || gameMode === 'maze' ? 15 : 25);
            
            mesh.position.x = (body.position.x - width / 2) * THREE_SCALE;
            mesh.position.z = (body.position.y - height / 2) * THREE_SCALE;
            mesh.position.y = radius * newScale * THREE_SCALE;
            
            // Update Liquid Level and Color
            const plane = (mesh as any).liquidPlane;
            const liquidMat = (mesh as any).liquidMat;
            const outerMat = mesh.material as THREE.MeshPhysicalMaterial;

            if (plane) {
              const currentRadius = radius * THREE_SCALE;
              const fillHeight = (m.fillLevel / 100) * 2 * currentRadius;
              plane.constant = mesh.position.y - currentRadius + fillHeight;
            }
            if (liquidMat && m.color) {
              liquidMat.color.set(m.color);
              liquidMat.emissive.set(m.color);
              liquidMat.emissiveIntensity = 0.2 + (m.resonance || 0.5) * 0.3;
            }
            if (outerMat) {
              outerMat.roughness = THREE.MathUtils.lerp(outerMat.roughness, m.status === 'frosted' ? 0.8 : 0.1, 0.05);
              outerMat.transmission = THREE.MathUtils.lerp(outerMat.transmission, m.status === 'identified' ? 0.9 : 0.2, 0.05);
              outerMat.emissiveIntensity = THREE.MathUtils.lerp(outerMat.emissiveIntensity, m.status === 'identified' ? 0.5 * (m.resonance || 0.5) : 0.1, 0.05);
            }

            // Permanent Trails for Glowing Marbles (Pinball Mode)
            if (gameMode === 'pinball' && m.isPermanentlyGlowing) {
              if (!permanentTrailsRef.current.has(m.id)) {
                const trailGeo = new THREE.BufferGeometry();
                const trailPos = new Float32Array(1000 * 3);
                trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
                const trailMat = new THREE.PointsMaterial({ color: m.color, size: 0.1, transparent: true, opacity: 0.5 });
                const trail = new THREE.Points(trailGeo, trailMat);
                sceneRef.current?.add(trail);
                permanentTrailsRef.current.set(m.id, trail);
                (trail as any).pointIndex = 0;
              }
              const trail = permanentTrailsRef.current.get(m.id)!;
              const posAttr = trail.geometry.getAttribute('position') as THREE.BufferAttribute;
              const idx = (trail as any).pointIndex;
              posAttr.setXYZ(idx, mesh.position.x, mesh.position.y, mesh.position.z);
              (trail as any).pointIndex = (idx + 1) % 1000;
              posAttr.needsUpdate = true;
            }
          }
        });
      }

      // Handle Kaleidoscope Spin and Tipping
      if (gameMode === 'spin') {
        sceneRef.current.rotation.y += 0.01;
        sceneRef.current.rotation.x = 0;
      } else if (gameMode === 'run') {
        // Tip the box for marble run
        sceneRef.current.rotation.x = THREE.MathUtils.lerp(sceneRef.current.rotation.x, Math.PI / 2.2, 0.05);
        sceneRef.current.rotation.y = 0;
      } else {
        sceneRef.current.rotation.y *= 0.95;
        sceneRef.current.rotation.x = THREE.MathUtils.lerp(sceneRef.current.rotation.x, 0, 0.05);
      }

      if (modeElementsRef.current) {
        modeElementsRef.current.children.forEach(child => {
          if ((child as any).material) {
            (child as any).material.opacity = THREE.MathUtils.lerp((child as any).material.opacity, modeOpacity, 0.05);
          }
        });
      }

      // Update Particles
      particlesRef.current = particlesRef.current.filter(p => {
        const elapsed = (Date.now() - p.startTime) / 1000;
        if (elapsed > 1) {
          sceneRef.current?.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
          return false;
        }

        const positions = p.mesh.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < p.lifetimes.length; i++) {
          positions[i * 3] += p.velocities[i * 3];
          positions[i * 3 + 1] += p.velocities[i * 3 + 1];
          positions[i * 3 + 2] += p.velocities[i * 3 + 2];
          p.velocities[i * 3 + 1] -= 0.005; // Gravity
        }
        p.mesh.geometry.attributes.position.needsUpdate = true;
        (p.mesh.material as THREE.PointsMaterial).opacity = 1 - elapsed;
        return true;
      });

      rendererRef.current.render(sceneRef.current, cameraRef.current);
      requestAnimationFrame(animate);
    };

    const animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      Matter.Engine.clear(engine);
      Matter.Runner.stop(runner);
      Matter.World.clear(engine.world, false);
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, [marbles.length, isFidgetMode, canSpin, gameMode]);

  // Update Material
  useEffect(() => {
    if (!roomRef.current) return;
    const color = material === 'wood' ? 0x3d2b1f : 
                  material === 'leather' ? 0x4a2c1d :
                  material === 'felt' ? 0x1a4d2e : 0xf4f4f4;
    
    roomRef.current.children.forEach(child => {
      const mesh = child as THREE.Mesh;
      (mesh.material as THREE.MeshStandardMaterial).color.set(color);
    });
  }, [material]);

  // Handle clicks
  useEffect(() => {
    if (!rendererRef.current || !cameraRef.current || !sceneRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (e: MouseEvent) => {
      const rect = rendererRef.current!.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current!);
      const intersects = raycaster.intersectObjects(Array.from(marbleMeshesRef.current.values()));

      if (intersects.length > 0) {
        const mesh = intersects[0].object as THREE.Mesh;
        // Find ID from mesh
        for (const [id, m] of marbleMeshesRef.current.entries()) {
          if (m === mesh) {
            onMarbleClick(id);
            // Visual feedback for click
            (m.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 3;
            const marble = marblesRef.current.find(mb => mb.id === id);
            spawnParticles(m.position.x, m.position.z, marble?.color || 0xffffff, 25);
            break;
          }
        }
      }
    };

    rendererRef.current.domElement.addEventListener('click', handleClick);
    return () => rendererRef.current?.domElement.removeEventListener('click', handleClick);
  }, [onMarbleClick]);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full overflow-hidden" />
  );
};
