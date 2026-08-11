/* =========================================================
   Interactive 3D globe — "Guests From Around the World"
   Built with three.js. No external texture dependency: the
   globe, grid and pins are drawn procedurally so it always
   renders and stays on-theme (ivory / gold / champagne).
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {

  const stage = document.getElementById('globeStage');
  const canvas = document.getElementById('globeCanvas');
  const tooltip = document.getElementById('globeTooltip');
  const listEl = document.getElementById('guestsList');

  if (!stage || !canvas || !listEl || typeof THREE === 'undefined') return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme colors (pulled from CSS variables) ---------- */
  const css = getComputedStyle(document.documentElement);
  const cGold      = (css.getPropertyValue('--gold') || '#B8862F').trim();
  const cGoldLight = (css.getPropertyValue('--gold-light') || '#D4AF6A').trim();
  const cGoldDeep  = (css.getPropertyValue('--gold-deep') || '#8C6518').trim();
  const cChampagne = (css.getPropertyValue('--champagne') || '#F3E9D2').trim();
  const cIvory     = (css.getPropertyValue('--ivory') || '#FBF9F4').trim();
  const cInk       = (css.getPropertyValue('--ink') || '#2B2622').trim();

  /* ---------- Guest countries (single source of truth: the HTML list) ---------- */
  const guestItems = Array.from(listEl.querySelectorAll('.guests__item')).map(li => ({
    name: li.dataset.country,
    lat: parseFloat(li.dataset.lat),
    lng: parseFloat(li.dataset.lng),
    flag: li.querySelector('.guests__flag') ? li.querySelector('.guests__flag').textContent : '',
    el: li
  })).filter(d => !isNaN(d.lat) && !isNaN(d.lng));

  if (!guestItems.length) return;

  /* ---------- Scene setup ---------- */
  const RADIUS = 2.15;
  let width = stage.clientWidth || 400;
  let height = stage.clientHeight || 400;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(0, 0.15, 6.2);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);

  const globeGroup = new THREE.Group();
  globeGroup.rotation.x = 0.15;
  scene.add(globeGroup);

  /* Base sphere (ocean) */
  const sphereGeo = new THREE.SphereGeometry(RADIUS, 64, 48);
  const sphereMat = new THREE.MeshPhongMaterial({
    color: new THREE.Color(cChampagne),
    emissive: new THREE.Color(cGoldDeep),
    emissiveIntensity: 0.06,
    shininess: 18,
    specular: new THREE.Color(cIvory),
    transparent: true,
    opacity: 0.96
  });
  globeGroup.add(new THREE.Mesh(sphereGeo, sphereMat));

  /* Lat/long grid (graticule) */
  const gridGeo = new THREE.SphereGeometry(RADIUS * 1.004, 24, 16);
  const gridMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(cGold),
    wireframe: true,
    transparent: true,
    opacity: 0.16
  });
  globeGroup.add(new THREE.Mesh(gridGeo, gridMat));

  /* Soft outer glow */
  const glowGeo = new THREE.SphereGeometry(RADIUS * 1.09, 48, 48);
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(cGoldLight),
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide
  });
  globeGroup.add(new THREE.Mesh(glowGeo, glowMat));

  /* Faint scatter of "landmass" dots for texture, so the globe doesn't read as a blank ball */
  (function addSurfaceDots() {
    const dotCount = 900;
    const positions = [];
    for (let i = 0; i < dotCount; i++) {
      // Bias dots away from poles a little, roughly emulate land coverage bands
      const u = Math.random();
      const v = Math.random();
      const lat = 90 - Math.acos(2 * v - 1) * (180 / Math.PI);
      const lng = 360 * u - 180;
      const band = Math.cos((lat * Math.PI) / 180);
      if (Math.random() > band * 0.9 + 0.15) continue;
      const p = latLngToVec3(lat, lng, RADIUS * 1.001);
      positions.push(p.x, p.y, p.z);
    }
    const dotsGeo = new THREE.BufferGeometry();
    dotsGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const dotsMat = new THREE.PointsMaterial({
      color: new THREE.Color(cGoldDeep),
      size: 0.028,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true
    });
    globeGroup.add(new THREE.Points(dotsGeo, dotsMat));
  })();

  /* Lights */
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(4, 3, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(cGoldLight), 0.35);
  rim.position.set(-4, -2, -3);
  scene.add(rim);

  /* ---------- Coordinate helper ---------- */
  function latLngToVec3(lat, lng, r) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }

  /* ---------- Guest pins ---------- */
  const pinGeo = new THREE.SphereGeometry(0.05, 16, 16);
  const ringGeo = new THREE.RingGeometry(0.065, 0.095, 28);

  const markers = guestItems.map((item, i) => {
    const pos = latLngToVec3(item.lat, item.lng, RADIUS);

    const pinMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(cGold) });
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.copy(pos);
    globeGroup.add(pin);

    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(cGoldLight),
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos.clone().multiplyScalar(1.006));
    ring.lookAt(pos.clone().multiplyScalar(2));
    globeGroup.add(ring);

    return { item, pin, ring, basePos: pos.clone(), phaseOffset: i * 0.7 };
  });

  /* ---------- Interaction: drag / touch rotate + inertia ---------- */
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 0.08 };
  const pointerNDC = new THREE.Vector2(-10, -10);

  let isDragging = false;
  let lastX = 0, lastY = 0;
  let dragVelX = 0, dragVelY = 0;
  let autoRotate = !prefersReducedMotion;
  let resumeTimer = null;
  let hovered = null;
  let focusedName = null;

  function scheduleAutoResume() {
    if (prefersReducedMotion) return;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { autoRotate = true; }, 2600);
  }

  function updatePointer(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  canvas.addEventListener('pointerdown', (e) => {
    isDragging = true;
    autoRotate = false;
    focusedName = null;
    lastX = e.clientX;
    lastY = e.clientY;
    dragVelX = 0; dragVelY = 0;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    updatePointer(e.clientX, e.clientY);
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    dragVelX = dx * 0.005;
    dragVelY = dy * 0.005;
    globeGroup.rotation.y += dragVelX;
    globeGroup.rotation.x += dragVelY;
    globeGroup.rotation.x = Math.max(-1.1, Math.min(1.1, globeGroup.rotation.x));
    lastX = e.clientX;
    lastY = e.clientY;
  });

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    canvas.style.cursor = 'grab';
    scheduleAutoResume();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => {
    pointerNDC.set(-10, -10);
  });

  canvas.addEventListener('click', () => {
    if (hovered) {
      focusCountry(hovered.item.name);
    }
  });

  /* ---------- Focus a country from globe click OR list click ---------- */
  let targetRotY = null;
  let targetRotX = null;

  function focusCountry(name) {
    const m = markers.find(mk => mk.item.name === name);
    if (!m) return;
    focusedName = name;
    autoRotate = false;
    clearTimeout(resumeTimer);

    // Rotate group about Y so this marker faces the camera.
    const p = m.basePos;
    targetRotY = -Math.atan2(p.x, p.z);
    targetRotX = 0.1;

    setActiveListItem(name);
    scheduleAutoResume();
  }

  function setActiveListItem(name) {
    guestItems.forEach(g => g.el.classList.toggle('is-active', g.name === name));
  }

  listEl.querySelectorAll('.guests__item').forEach(li => {
    li.addEventListener('click', () => focusCountry(li.dataset.country));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        focusCountry(li.dataset.country);
      }
    });
    li.addEventListener('mouseenter', () => {
      const m = markers.find(mk => mk.item.name === li.dataset.country);
      if (m) setHovered(m);
    });
    li.addEventListener('mouseleave', () => setHovered(null));
  });

  function shortestAngleLerp(current, target, t) {
    let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return current + delta * t;
  }

  /* ---------- Hover state ---------- */
  function setHovered(marker) {
    if (hovered === marker) return;
    if (hovered) {
      hovered.pin.scale.set(1, 1, 1);
    }
    hovered = marker;
    if (hovered) {
      hovered.pin.scale.set(1.6, 1.6, 1.6);
      tooltip.style.opacity = '1';
      tooltip.textContent = `${hovered.item.flag} ${hovered.item.name}`;
      canvas.style.cursor = 'pointer';
    } else {
      tooltip.style.opacity = '0';
      if (!isDragging) canvas.style.cursor = 'grab';
    }
  }

  /* ---------- Resize ---------- */
  function handleResize() {
    width = stage.clientWidth || width;
    height = stage.clientHeight || height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  window.addEventListener('resize', handleResize);
  if (window.ResizeObserver) {
    new ResizeObserver(handleResize).observe(stage);
  }

  /* ---------- Animate ---------- */
  const tmpVec = new THREE.Vector3();

  function animate() {
    requestAnimationFrame(animate);

    if (targetRotY !== null) {
      globeGroup.rotation.y = shortestAngleLerp(globeGroup.rotation.y, targetRotY, 0.06);
      globeGroup.rotation.x += (targetRotX - globeGroup.rotation.x) * 0.06;
      if (Math.abs(((globeGroup.rotation.y - targetRotY + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.01) {
        targetRotY = null;
      }
    } else if (autoRotate && !isDragging) {
      globeGroup.rotation.y += 0.0016;
    }

    if (!isDragging) {
      raycaster.setFromCamera(pointerNDC, camera);
      const intersects = raycaster.intersectObjects(markers.map(m => m.pin));
      if (intersects.length) {
        const found = markers.find(m => m.pin === intersects[0].object);
        setHovered(found || null);
      } else if (hovered) {
        setHovered(null);
      }
    }

    if (hovered) {
      hovered.pin.getWorldPosition(tmpVec);
      const proj = tmpVec.clone().project(camera);
      const x = (proj.x * 0.5 + 0.5) * width;
      const y = (-proj.y * 0.5 + 0.5) * height;
      tooltip.style.transform = `translate(${x}px, ${y}px) translate(-50%, -145%)`;
    }

    // gentle pulse for rings
    const t = performance.now() * 0.0018;
    markers.forEach(m => {
      const s = 1 + 0.28 * (0.5 + 0.5 * Math.sin(t + m.phaseOffset));
      m.ring.scale.setScalar(s);
      const ringMat = m.ring.material;
      ringMat.opacity = 0.28 + 0.35 * (0.5 + 0.5 * Math.sin(t + m.phaseOffset));
    });

    renderer.render(scene, camera);
  }

  animate();
});