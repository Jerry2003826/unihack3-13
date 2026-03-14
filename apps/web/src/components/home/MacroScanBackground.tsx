"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const SHAPE_SEQUENCE = ["SUBURBAN", "TOWER"] as const;

function randomBoxSurface(x: number, y: number, z: number, w: number, h: number, d: number) {
  let tx = 0;
  let ty = 0;
  let tz = 0;
  const face = Math.random();

  if (face < 0.16) {
    tx = x + (Math.random() - 0.5) * w;
    ty = y + h / 2;
    tz = z + (Math.random() - 0.5) * d;
  } else if (face < 0.33) {
    tx = x + (Math.random() - 0.5) * w;
    ty = y - h / 2;
    tz = z + (Math.random() - 0.5) * d;
  } else if (face < 0.5) {
    tx = x + w / 2;
    ty = y + (Math.random() - 0.5) * h;
    tz = z + (Math.random() - 0.5) * d;
  } else if (face < 0.66) {
    tx = x - w / 2;
    ty = y + (Math.random() - 0.5) * h;
    tz = z + (Math.random() - 0.5) * d;
  } else if (face < 0.83) {
    tx = x + (Math.random() - 0.5) * w;
    ty = y + (Math.random() - 0.5) * h;
    tz = z + d / 2;
  } else {
    tx = x + (Math.random() - 0.5) * w;
    ty = y + (Math.random() - 0.5) * h;
    tz = z - d / 2;
  }

  return { tx, ty, tz };
}

function randomSphereSurface(x: number, y: number, z: number, radius: number) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random() * 2 - 1);

  return {
    tx: x + radius * Math.sin(phi) * Math.cos(theta),
    ty: y + radius * Math.sin(phi) * Math.sin(theta),
    tz: z + radius * Math.cos(phi),
  };
}

function getShapePositions(type: string, count: number) {
  const positions = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    let point = { tx: 0, ty: 0, tz: 0 };
    const sample = Math.random();

    if (type === "SUBURBAN") {
      const width = 400;
      const depth = 400;
      const height = 220;
      const roofHeight = 180;

      if (sample < 0.6) {
        point = randomBoxSurface(0, height / 2, 0, width, height, depth);
      } else if (sample < 0.9) {
        const t = Math.random();
        point.tx = (Math.random() - 0.5) * (width + 40);
        point.ty = height + t * roofHeight;
        point.tz = (Math.random() > 0.5 ? 1 : -1) * (depth / 2 - t * (depth / 2));
      } else {
        point = randomBoxSurface(0, 50, 0, 1500, 100, 1500);
      }
      point.ty -= 150;
    } else if (type === "TOWER") {
      const width = 200;
      const depth = 200;
      const height = 600;

      if (sample < 0.8) {
        point = randomBoxSurface(0, height / 2, 0, width, height, depth);
      } else {
        point = randomBoxSurface(0, 200, 0, 1000, 400, 1000);
      }

      if (point.ty % 50 < 4) {
        point.tx *= 0.88;
        point.tz *= 0.88;
      }
      point.ty -= 150;
    } else {
      const floorY = -150;

      if (sample < 0.2) {
        point = randomBoxSurface(0, floorY, 0, 800, 2, 800);
        if (Math.abs(point.tx) < 180 && Math.abs(point.tz) < 140) {
          point.ty += 4;
        }
      } else if (sample < 0.35) {
        if (Math.random() > 0.5) {
          point = randomBoxSurface(0, floorY + 150, -400, 800, 300, 10);
        } else {
          point = randomBoxSurface(-400, floorY + 150, 0, 10, 300, 800);
        }
      } else if (sample < 0.55) {
        const sofa = Math.random();
        if (sofa < 0.4) {
          point = randomBoxSurface(50, floorY + 20, 100, 240, 40, 90);
        } else if (sofa < 0.7) {
          point = randomBoxSurface(50, floorY + 60, 140, 240, 60, 20);
        } else {
          point = randomBoxSurface(130, floorY + 20, 0, 80, 40, 200);
        }
      } else if (sample < 0.65) {
        point = randomBoxSurface(-50, floorY + 35, 80, 120, 4, 80);
        if (Math.random() > 0.9) {
          point = randomBoxSurface(-50, floorY + 17, 80, 100, 30, 60);
        }
      } else if (sample < 0.75) {
        if (Math.random() > 0.4) {
          point = randomBoxSurface(-200, floorY + 140, -385, 240, 130, 8);
        } else {
          point = randomBoxSurface(-200, floorY + 30, -360, 320, 30, 40);
        }
      } else if (sample < 0.85) {
        if (Math.random() > 0.7) {
          point = randomBoxSurface(-320, floorY + 25, -280, 40, 50, 40);
        } else {
          point = randomSphereSurface(-320, floorY + 110, -280, 60);
        }
      } else {
        point = randomBoxSurface(0, floorY + 150, 0, 700, 300, 700);
      }
    }

    const noise = type === "INTERIOR" ? 1.5 : 3;
    point.tx += (Math.random() - 0.5) * noise;
    point.ty += (Math.random() - 0.5) * noise;
    point.tz += (Math.random() - 0.5) * noise;

    positions[index * 3] = point.tx;
    positions[index * 3 + 1] = point.ty;
    positions[index * 3 + 2] = point.tz;
  }

  return positions;
}

export function MacroScanBackground({
  onStateChange,
}: {
  onStateChange?: (state: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let animationFrameId = 0;
    const particleCount = window.innerWidth < 768 ? 50000 : 100000;
    let mouseX = 0;
    let mouseYOffset = 0;
    let windowHalfX = window.innerWidth / 2;
    let windowHalfY = window.innerHeight / 2;
    let phase: "EXTERIOR" | "BREACHING" | "INTERIOR" | "EXITING" = "EXTERIOR";
    let phaseTimer = 0;
    let currentShape: "SUBURBAN" | "TOWER" | "INTERIOR" = "SUBURBAN";

    const scanConfig = { y: -300, direction: 1, speed: 2.5, minY: -300, maxY: 400 };

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x090b12, 0.0006);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 5000);
    camera.position.set(0, 150, 900);

    const initialPositions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let index = 0; index < particleCount; index += 1) {
      const radius = 30 + Math.random() * 80;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      initialPositions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      initialPositions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) - 50;
      initialPositions[index * 3 + 2] = radius * Math.cos(phi);
      sizes[index] = Math.random() * 1.5 + 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(initialPositions, 3));
    geometry.setAttribute("targetPosition", new THREE.BufferAttribute(getShapePositions(currentShape, particleCount), 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(0x1a4b5e) },
        scanColor: { value: new THREE.Color(0x3ddcff) },
        alertColor: { value: new THREE.Color(0xff2a3f) },
        scanY: { value: scanConfig.y },
        time: { value: 0 },
        glitchAmount: { value: 0 },
      },
      vertexShader: `
        uniform float scanY;
        uniform float time;
        uniform float glitchAmount;
        attribute vec3 targetPosition;
        attribute float size;
        varying float vIntensity;
        varying float vIsAlert;

        float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }

        void main() {
          float s = sin(time * 0.5); float c = cos(time * 0.5);
          vec3 rotatedInitial = position;
          rotatedInitial.x = position.x * c - position.z * s;
          rotatedInitial.z = position.x * s + position.z * c;
          rotatedInitial.y += sin(time * 3.0 + position.x * 0.05) * 8.0;

          float dist = targetPosition.y - scanY;
          float state = smoothstep(50.0, -30.0, dist);

          vec3 currentPos = mix(rotatedInitial, targetPosition, state);
          currentPos.y += sin(state * 3.14159) * 50.0;

          if (glitchAmount > 0.0) {
            float r = random(vec2(position.x, time)) * 2.0 - 1.0;
            currentPos.x += r * glitchAmount * 80.0 * sin(time * 10.0);
            currentPos.z += r * glitchAmount * 80.0 * cos(time * 10.0);
          }

          vec4 mvPosition = modelViewMatrix * vec4(currentPos, 1.0);
          gl_PointSize = size * (800.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;

          float scanDist = abs(currentPos.y - scanY);
          if (scanDist < 12.0 && state > 0.1 && state < 0.9) {
            vIntensity = 1.0;
          } else if (state > 0.9) {
            vIntensity = 0.6 + glitchAmount * 0.4;
          } else {
            vIntensity = 0.2;
          }

          vIsAlert = 0.0;
          if (sin(targetPosition.x * 20.0) * cos(targetPosition.z * 20.0) > 0.98) {
            vIsAlert = 1.0;
            if (state > 0.8 && scanDist < 80.0) vIntensity = 1.0;
          }
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform vec3 scanColor;
        uniform vec3 alertColor;
        varying float vIntensity;
        varying float vIsAlert;

        void main() {
          vec2 xy = gl_PointCoord.xy - vec2(0.5);
          if (length(xy) > 0.5) discard;

          vec3 finalColor = mix(baseColor, scanColor, vIntensity);
          if (vIsAlert > 0.5 && vIntensity > 0.3) {
            finalColor = mix(finalColor, alertColor, vIntensity + 0.5);
          }

          gl_FragColor = vec4(finalColor, vIntensity * 0.8 + 0.1);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);

    const baseCircle = new THREE.Mesh(
      new THREE.RingGeometry(380, 385, 128),
      new THREE.MeshBasicMaterial({
        color: 0x3ddcff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.15,
      })
    );
    baseCircle.rotation.x = Math.PI / 2;
    baseCircle.position.y = -148;
    scene.add(baseCircle);

    const scanPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshBasicMaterial({
        color: 0x3ddcff,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    scanPlane.rotation.x = Math.PI / 2;
    scene.add(scanPlane);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x090b12, 1);
    container.appendChild(renderer.domElement);

    const onWindowResize = () => {
      windowHalfX = window.innerWidth / 2;
      windowHalfY = window.innerHeight / 2;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    const onPointerMove = (event: PointerEvent) => {
      mouseX = event.clientX - windowHalfX;
      mouseYOffset = (event.clientY - windowHalfY) * 0.1;
    };

    const renderScene = () => {
      const time = performance.now() * 0.001;
      phaseTimer += 0.016;

      let targetGlitch = 0;
      let targetZ = 900;
      let targetFov = 50;
      let targetY = 150;
      let orbitSpeed = 0.1;

      if (phaseTimer > 15 && phase === "EXTERIOR") {
        phase = "BREACHING";
        onStateChange?.("BREACHING");
      } else if (phaseTimer > 18 && phase === "BREACHING") {
        phase = "INTERIOR";
        currentShape = "INTERIOR";
        geometry.attributes.targetPosition.array.set(getShapePositions("INTERIOR", particleCount));
        geometry.attributes.targetPosition.needsUpdate = true;
        onStateChange?.("INTERIOR");
      } else if (phaseTimer > 35 && phase === "INTERIOR") {
        phase = "EXITING";
        onStateChange?.("EXITING");
      } else if (phaseTimer > 38 && phase === "EXITING") {
        phase = "EXTERIOR";
        phaseTimer = 0;
        currentShape = SHAPE_SEQUENCE[Math.random() > 0.5 ? 0 : 1];
        geometry.attributes.targetPosition.array.set(getShapePositions(currentShape, particleCount));
        geometry.attributes.targetPosition.needsUpdate = true;
        onStateChange?.(currentShape);
      }

      if (phase === "EXTERIOR") {
        targetZ = 900;
        targetFov = 50;
        targetY = 150;
        orbitSpeed = 0.1;
      } else if (phase === "BREACHING") {
        const progress = (phaseTimer - 15) / 3;
        const ease = 1 - Math.pow(1 - progress, 3);
        targetZ = 900 - 800 * ease;
        targetFov = 50 + 60 * ease;
        targetGlitch = Math.sin(progress * Math.PI) * 0.8;
        orbitSpeed = 0.02;
      } else if (phase === "INTERIOR") {
        targetZ = 50;
        targetFov = 110;
        targetY = 30;
        orbitSpeed = -0.04;
      } else if (phase === "EXITING") {
        const progress = (phaseTimer - 35) / 3;
        const ease = progress * progress;
        targetZ = 50 + 850 * ease;
        targetFov = 110 - 60 * ease;
        targetGlitch = Math.sin(progress * Math.PI) * 0.5;
      }

      camera.position.z += (targetZ - camera.position.z) * 0.08;
      camera.position.y += (targetY + mouseYOffset - camera.position.y) * 0.08;
      camera.fov += (targetFov - camera.fov) * 0.08;
      camera.updateProjectionMatrix();

      material.uniforms.glitchAmount.value += (targetGlitch - material.uniforms.glitchAmount.value) * 0.1;

      const camX = Math.sin(time * orbitSpeed) * targetZ + mouseX * 0.2;
      const camZ = Math.cos(time * orbitSpeed) * targetZ;
      camera.position.x += (camX - camera.position.x) * 0.08;
      camera.position.z = camZ;
      camera.lookAt(0, phase === "INTERIOR" ? 0 : -50, 0);

      scanConfig.y += scanConfig.speed * scanConfig.direction;
      if (scanConfig.y > scanConfig.maxY) {
        scanConfig.direction = -1;
      } else if (scanConfig.y < scanConfig.minY) {
        scanConfig.direction = 1;
      }

      material.uniforms.scanY.value = scanConfig.y;
      material.uniforms.time.value = time;
      scanPlane.position.y = scanConfig.y;

      renderer.render(scene, camera);
    };

    const animate = () => {
      animationFrameId = window.requestAnimationFrame(animate);
      renderScene();
    };

    window.addEventListener("resize", onWindowResize);
    window.addEventListener("pointermove", onPointerMove);
    animate();

    return () => {
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.cancelAnimationFrame(animationFrameId);
      geometry.dispose();
      material.dispose();
      baseCircle.geometry.dispose();
      (baseCircle.material as THREE.Material).dispose();
      scanPlane.geometry.dispose();
      (scanPlane.material as THREE.Material).dispose();
      renderer.dispose();
      container.replaceChildren();
    };
  }, [onStateChange]);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />;
}
