import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const views = [
  { eyebrow: "01", label: "Cover", note: "Our Qixi love letter" },
  { eyebrow: "02", label: "Open card", note: "Read my wish" },
  { eyebrow: "03", label: "Always", note: "In every lifetime" },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = (value) => value * value * (3 - 2 * value);

export function App() {
  const mountRef = useRef(null);
  const stageRef = useRef(0);
  const [stage, setStage] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const chooseStage = (nextStage) => {
    stageRef.current = nextStage;
    setStage(nextStage);
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.05, 7.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute("aria-label", "Interactive three-dimensional love card");
    renderer.domElement.setAttribute("role", "img");
    mount.appendChild(renderer.domElement);

    const card = new THREE.Group();
    card.rotation.set(-0.025, -0.08, -0.015);
    scene.add(card);

    const textureLoader = new THREE.TextureLoader();
    const loadTexture = (url) =>
      new Promise((resolve, reject) => {
        textureLoader.load(
          url,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            resolve(texture);
          },
          undefined,
          reject,
        );
      });

    let disposed = false;
    let frontMesh;
    let insideMesh;
    let backMesh;
    let frontPivot;
    const textureSet = [];

    const artworkBase = `${import.meta.env.BASE_URL}artwork/`;
    Promise.all([
      loadTexture(`${artworkBase}front.png`),
      loadTexture(`${artworkBase}middle.png`),
      loadTexture(`${artworkBase}back.png`),
    ]).then(([frontTexture, middleTexture, backTexture]) => {
      if (disposed) return;
      textureSet.push(frontTexture, middleTexture, backTexture);

      const height = 2.62;
      const frontWidth = height * (880 / 1021);
      const insideWidth = height * (1777 / 1022);
      const backWidth = height * (918 / 1021);
      const makeMaterial = (map, opacity = 1) =>
        new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          opacity,
          side: THREE.DoubleSide,
          depthWrite: opacity === 1,
          toneMapped: false,
        });

      const insideMaterial = makeMaterial(middleTexture, 0);
      insideMaterial.depthWrite = false;
      insideMesh = new THREE.Mesh(new THREE.PlaneGeometry(insideWidth, height), insideMaterial);
      insideMesh.position.z = 0.01;
      insideMesh.scale.setScalar(0.56);
      card.add(insideMesh);

      const frontGeometry = new THREE.PlaneGeometry(frontWidth, height);
      frontGeometry.translate(frontWidth / 2, 0, 0);
      const frontMaterial = makeMaterial(frontTexture);
      frontPivot = new THREE.Group();
      frontPivot.position.x = -frontWidth / 2;
      frontPivot.position.z = 0.035;
      frontMesh = new THREE.Mesh(frontGeometry, frontMaterial);
      frontPivot.add(frontMesh);
      card.add(frontPivot);

      const backMaterial = makeMaterial(backTexture, 0);
      backMaterial.depthWrite = false;
      backMesh = new THREE.Mesh(new THREE.PlaneGeometry(backWidth, height), backMaterial);
      backMesh.rotation.y = Math.PI;
      backMesh.position.z = -0.035;
      card.add(backMesh);

      frontMesh.castShadow = true;
      insideMesh.castShadow = true;
      backMesh.castShadow = true;
      setLoaded(true);
    });

    scene.add(new THREE.HemisphereLight(0xfff4da, 0x391625, 2.2));
    const keyLight = new THREE.DirectionalLight(0xfff3dc, 3.4);
    keyLight.position.set(-2.5, 4, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    scene.add(keyLight);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 6),
      new THREE.ShadowMaterial({ color: 0x0c0508, transparent: true, opacity: 0.26 }),
    );
    shadow.position.z = -0.38;
    shadow.receiveShadow = true;
    scene.add(shadow);

    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(44 * 3);
    for (let i = 0; i < 44; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 11;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6.5;
      positions[i * 3 + 2] = -0.5 - Math.random() * 2;
    }
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0xffc66b, size: 0.026, transparent: true, opacity: 0.58 }),
    );
    scene.add(particles);

    const pointer = { x: 0, y: 0, down: false, lastX: 0, lastY: 0 };
    let yaw = -0.08;
    let pitch = -0.025;
    let velocityX = 0;
    let velocityY = 0;
    let zoom = 7.2;
    let openProgress = 0;
    let backProgress = 0;
    let previousStage = 0;
    let rafId;
    let previousTime = performance.now();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const onPointerDown = (event) => {
      pointer.down = true;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      mount.classList.add("is-dragging");
    };
    const onPointerMove = (event) => {
      const rect = mount.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      if (!pointer.down) return;
      const dx = event.clientX - pointer.lastX;
      const dy = event.clientY - pointer.lastY;
      const readingSensitivity = stageRef.current === 1 ? 0.0018 : 0.006;
      velocityX = dx * readingSensitivity;
      velocityY = dy * (stageRef.current === 1 ? 0.0014 : 0.004);
      yaw += velocityX;
      pitch = clamp(pitch + velocityY, -0.55, 0.55);
      if (stageRef.current === 1) {
        yaw = clamp(yaw, -0.12, 0.12);
        pitch = clamp(pitch, -0.08, 0.08);
      }
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
    };
    const onPointerUp = (event) => {
      pointer.down = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      mount.classList.remove("is-dragging");
    };
    const onWheel = (event) => {
      event.preventDefault();
      zoom = clamp(zoom + event.deltaY * 0.0035, 5.5, 9);
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const animate = (time) => {
      const delta = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      const stageNow = stageRef.current;
      if (stageNow !== previousStage) {
        velocityX = 0;
        velocityY = 0;
        if (stageNow === 1) {
          yaw = 0;
          pitch = 0;
        }
        previousStage = stageNow;
      }
      const openTarget = stageNow === 1 ? 1 : 0;
      const backTarget = stageNow === 2 ? 1 : 0;
      const response = reduceMotion ? 1 : 1 - Math.pow(0.0008, delta);
      openProgress += (openTarget - openProgress) * response;
      backProgress += (backTarget - backProgress) * response;

      if (!pointer.down) {
        yaw += velocityX;
        pitch = clamp(pitch + velocityY, -0.55, 0.55);
        velocityX *= 0.91;
        velocityY *= 0.91;
      }

      if (stageNow === 1) {
        yaw += (0 - yaw) * 0.075;
        pitch += (0 - pitch) * 0.075;
        yaw = clamp(yaw, -0.12, 0.12);
        pitch = clamp(pitch, -0.08, 0.08);
      }

      const hoverYaw = pointer.down ? 0 : pointer.x * 0.045;
      const hoverPitch = pointer.down ? 0 : pointer.y * 0.035;
      const idle = reduceMotion ? 0 : Math.sin(time * 0.00036) * 0.014;
      const openEase = ease(openProgress);
      const backEase = ease(backProgress);
      card.rotation.y += (yaw + hoverYaw + backProgress * Math.PI - card.rotation.y) * 0.09;
      card.rotation.x += (pitch + hoverPitch + idle - card.rotation.x) * 0.09;
      card.rotation.z += ((pointer.down ? 0 : pointer.x * -0.012) - card.rotation.z) * 0.06;
      const narrowScreenPullback = Math.max(0, (1.3 - camera.aspect) * 10.5) * openEase;
      const portraitPullback = Math.max(0, (0.65 - camera.aspect) * 4) * (1 - openEase);
      const readingMargin = 0.75 * openEase;
      camera.position.z += (zoom + narrowScreenPullback + portraitPullback + readingMargin - camera.position.z) * 0.1;

      if (frontPivot && frontMesh && insideMesh && backMesh) {
        frontPivot.rotation.y = -Math.PI * openEase;
        frontMesh.material.opacity = Math.max(0, 1 - openEase * 1.35) * (1 - backEase);
        frontMesh.material.depthWrite = frontMesh.material.opacity > 0.98;
        frontMesh.visible = frontMesh.material.opacity > 0.01;

        insideMesh.material.opacity = openEase * (1 - backEase);
        insideMesh.material.depthWrite = insideMesh.material.opacity > 0.98;
        insideMesh.scale.setScalar(0.56 + openEase * 0.44);
        insideMesh.position.z = 0.01 + Math.sin(openEase * Math.PI) * 0.035;
        insideMesh.visible = insideMesh.material.opacity > 0.01;

        backMesh.material.opacity = backEase;
        backMesh.material.depthWrite = backEase > 0.98;
        backMesh.visible = backEase > 0.01;
      }

      const restingY = camera.aspect < 0.7 && openEase < 0.5 ? -0.34 : 0;
      const floatY = Math.sin(time * 0.0007) * (reduceMotion ? 0 : 0.035);
      card.position.y += (restingY + floatY - card.position.y) * 0.08;
      particles.rotation.z = time * 0.000018;
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      textureSet.forEach((texture) => texture.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <main className={`experience stage-${stage}`}>
      <header className="masthead">
        <a className="wordmark" href="#card" aria-label="Return to the card">QIXI, FOR US</a>
        <p className="edition">七夕情人节 · A LOVE LETTER ACROSS THE STARS</p>
      </header>

      <section className="hero" id="card" aria-labelledby="page-title">
        <div className="intro-copy">
          <p className="kicker">七夕 · TO THE ONE I CHOOSE</p>
          <h1 id="page-title">Written in the stars,<br />chosen by my heart.</h1>
          <p className="dek">Across every sky and every lifetime, my heart keeps finding its way back to you. 七夕快乐，我爱你。</p>
        </div>

        <div className={`card-stage ${loaded ? "is-ready" : ""}`} ref={mountRef}>
          <div className="loading-note" aria-live="polite">
            <span>{loaded ? "Drag to hold it" : "Unfolding your card…"}</span>
          </div>
        </div>

        <nav className="chapter-list" aria-label="Card views">
          {views.map((view, index) => (
            <button
              className={`chapter ${stage === index ? "is-active" : ""}`}
              key={view.label}
              onClick={() => chooseStage(index)}
              aria-pressed={stage === index}
            >
              <span className="chapter-number">{view.eyebrow}</span>
              <span className="chapter-text">
                <strong>{view.label}</strong>
                <small>{view.note}</small>
              </span>
            </button>
          ))}
        </nav>
      </section>

      <footer className="footer-bar">
        <p>DRAG TO ROTATE · SCROLL TO MOVE CLOSER</p>
        <p className="footer-message">愿岁岁年年，爱你如初。</p>
      </footer>
    </main>
  );
}
