/* ============================================================
   SPACE VERSE · real-time 3D space scene (Three.js, offline)
   Procedural planet (4 themes) + atmosphere + clouds + rings +
   asteroid belt + moon + station + deep starfield + nebulae.
   No external assets.
   ============================================================ */

import * as THREE from './vendor/three.module.min.js';

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* -------- value-noise (fbm) -------- */
function makeNoise(seed = 1) {
    const perm = new Uint8Array(512);
    let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + t * (b - a);
    const grad = (h, x, y) => { const u = h & 1 ? x : -x, v = h & 2 ? y : -y; return u + v; };
    const noise2 = (x, y) => {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        x -= Math.floor(x); y -= Math.floor(y);
        const u = fade(x), v = fade(y);
        const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
        const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
        return lerp(lerp(grad(aa, x, y), grad(ba, x - 1, y), u),
            lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u), v);
    };
    return (x, y, oct = 5) => {
        let sum = 0, amp = 0.5, freq = 1, norm = 0;
        for (let i = 0; i < oct; i++) { sum += amp * noise2(x * freq, y * freq); norm += amp; amp *= 0.5; freq *= 2; }
        return sum / norm;
    };
}

/* -------- planet themes -------- */
const clampByte = (v) => Math.max(0, Math.min(255, v | 0));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const THEMES = {
    terra: {
        label: 'Terra', atmosphere: 0x3fa9ff, cloudOpacity: 0.55, rings: false, bumpScale: 0.28,
        ramp: (t) => {
            if (t < 0.48) return [12, 34, 74];
            if (t < 0.5) return [22, 62, 120];
            if (t < 0.52) return [30, 96, 150];
            if (t < 0.55) return [196, 178, 120];
            if (t < 0.7) return [46, 104, 58];
            if (t < 0.82) return [70, 92, 52];
            if (t < 0.9) return [110, 96, 78];
            return [236, 240, 248];
        },
        seaLevel: 0.52
    },
    mars: {
        label: 'Mars', atmosphere: 0xff7a4d, cloudOpacity: 0.08, rings: false, bumpScale: 0.4,
        ramp: (t) => {
            if (t < 0.35) return [92, 38, 24];
            if (t < 0.5) return [140, 62, 34];
            if (t < 0.68) return [176, 88, 46];
            if (t < 0.82) return [206, 120, 66];
            if (t < 0.92) return [224, 158, 104];
            return [238, 224, 214];
        },
        seaLevel: 1.1
    },
    ice: {
        label: 'Monde glacé', atmosphere: 0x9fd8ff, cloudOpacity: 0.45, rings: true, bumpScale: 0.3,
        ramp: (t) => {
            if (t < 0.5) return [70, 120, 165];
            if (t < 0.56) return [120, 168, 205];
            if (t < 0.7) return [180, 214, 236];
            if (t < 0.85) return [214, 234, 246];
            return [244, 250, 255];
        },
        seaLevel: 0.56
    },
    gas: {
        label: 'Géante gazeuse', atmosphere: 0xffb066, cloudOpacity: 0, rings: true, bumpScale: 0.05, gas: true,
        bands: [
            [232, 206, 168], [206, 158, 104], [176, 120, 72], [224, 190, 150],
            [150, 92, 58], [238, 220, 190], [198, 146, 96]
        ]
    }
};

function buildPlanetTextures(theme, w = 1024, h = 512) {
    const noise = makeNoise(7);
    const cloudNoise = makeNoise(23);
    const color = document.createElement('canvas'); color.width = w; color.height = h;
    const bump = document.createElement('canvas'); bump.width = w; bump.height = h;
    const clouds = document.createElement('canvas'); clouds.width = w; clouds.height = h;
    const cctx = color.getContext('2d'), bctx = bump.getContext('2d'), clctx = clouds.getContext('2d');
    const cimg = cctx.createImageData(w, h), bimg = bctx.createImageData(w, h), climg = clctx.createImageData(w, h);

    for (let y = 0; y < h; y++) {
        const lat = (y / h) * Math.PI;
        const polar = Math.abs((y / h) - 0.5) * 2;
        for (let x = 0; x < w; x++) {
            const lon = (x / w) * Math.PI * 2;
            const nx = Math.cos(lon) * Math.sin(lat);
            const ny = Math.sin(lon) * Math.sin(lat);
            const nz = Math.cos(lat);
            const i = (y * w + x) * 4;
            let r, g, b, bv;

            if (theme.gas) {
                // horizontal turbulent bands (Jupiter-like)
                const turb = noise(nx * 1.4 + 5, ny * 1.4 + nz * 0.8 + 5, 5) * 0.16;
                const band = (Math.sin((y / h) * Math.PI * 11 + turb * 26) + 1) / 2;
                const idx = Math.min(theme.bands.length - 1, Math.floor(band * theme.bands.length));
                const nextIdx = Math.min(theme.bands.length - 1, idx + 1);
                const frac = band * theme.bands.length - idx;
                [r, g, b] = mix(theme.bands[idx], theme.bands[nextIdx], frac);
                const swirl = noise(nx * 3 + 20, ny * 3 + 20, 4) * 18;
                r += swirl; g += swirl * 0.8; b += swirl * 0.6;
                bv = 30;
            } else {
                let e = noise(2.4 + nx * 2.2 + 5, 2.4 + ny * 2.2 + nz * 1.1, 6);
                e = Math.pow((e + 1) / 2, 1.15);
                let t = e;
                if (polar > 0.82) t = Math.max(t, 0.92 - (1 - polar) * 0.3);
                [r, g, b] = theme.ramp(t);
                bv = t >= theme.seaLevel ? 90 + t * 165 : 40;
            }

            cimg.data[i] = clampByte(r); cimg.data[i + 1] = clampByte(g); cimg.data[i + 2] = clampByte(b); cimg.data[i + 3] = 255;
            bimg.data[i] = bv; bimg.data[i + 1] = bv; bimg.data[i + 2] = bv; bimg.data[i + 3] = 255;

            let c = cloudNoise(nx * 2.6 + 11, ny * 2.6 + nz * 1.3 + 11, 5);
            c = Math.max(0, ((c + 1) / 2 - 0.5) * 2.4);
            climg.data[i] = 255; climg.data[i + 1] = 255; climg.data[i + 2] = 255;
            climg.data[i + 3] = Math.min(255, c * 255) * (1 - polar * 0.35);
        }
    }
    cctx.putImageData(cimg, 0, 0); bctx.putImageData(bimg, 0, 0); clctx.putImageData(climg, 0, 0);
    const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    return { map: mk(color), bump: new THREE.CanvasTexture(bump), clouds: mk(clouds) };
}

function buildMoonBump(w = 160, h = 80) {
    const noise = makeNoise(41);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'); const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let n = (noise(x / w * 6, y / h * 3, 4) + 1) / 2;
        const v = 60 + n * 175, i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(cv);
}

function radialTexture(inner, outer) {
    const s = 256; const cv = document.createElement('canvas'); cv.width = cv.height = s;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(cv);
}

/* ============================================================ */

export function initSpaceScene(canvas) {
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
        console.warn('WebGL indisponible, fallback CSS.', e);
        document.body.classList.add('no-webgl');
        return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x04060e, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 16);

    scene.add(new THREE.AmbientLight(0x22304e, 0.65));
    const sun = new THREE.DirectionalLight(0xdfe9ff, 2.4);
    sun.position.set(-6, 3, 7); scene.add(sun);
    const rim = new THREE.DirectionalLight(0x3a78ff, 0.5);
    rim.position.set(8, -2, -6); scene.add(rim);

    const planetGroup = new THREE.Group();
    planetGroup.position.set(8.6, -2.2, 0);
    planetGroup.rotation.z = 0.16;
    scene.add(planetGroup);

    const R = 6.4;

    // ---- planet sub-group (rebuilt on theme change) ----
    let planet, clouds, atmosphere, ringMesh;
    const planetInner = new THREE.Group();
    planetGroup.add(planetInner);

    function disposeObj(o) {
        if (!o) return;
        planetInner.remove(o);
        o.geometry?.dispose?.();
        if (o.material) {
            const m = o.material;
            m.map?.dispose?.(); m.bumpMap?.dispose?.(); m.dispose?.();
        }
    }

    function buildPlanet(themeName) {
        const theme = THEMES[themeName] || THEMES.terra;
        disposeObj(planet); disposeObj(clouds); disposeObj(atmosphere); disposeObj(ringMesh);
        planet = clouds = atmosphere = ringMesh = null;

        const tex = buildPlanetTextures(theme);
        planet = new THREE.Mesh(
            new THREE.SphereGeometry(R, 96, 96),
            new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: theme.bumpScale, metalness: 0.05, roughness: theme.gas ? 0.75 : 0.92 })
        );
        planet.rotation.z = 0.32;
        planetInner.add(planet);

        if (theme.cloudOpacity > 0) {
            clouds = new THREE.Mesh(
                new THREE.SphereGeometry(R * 1.015, 64, 64),
                new THREE.MeshStandardMaterial({ map: tex.clouds, transparent: true, opacity: theme.cloudOpacity, depthWrite: false })
            );
            planetInner.add(clouds);
        }

        const glow = new THREE.Color(theme.atmosphere);
        atmosphere = new THREE.Mesh(
            new THREE.SphereGeometry(R * 1.14, 64, 64),
            new THREE.ShaderMaterial({
                transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
                uniforms: { glow: { value: glow } },
                vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
                fragmentShader: `varying vec3 vN; uniform vec3 glow; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 2.4); gl_FragColor = vec4(glow,1.0) * clamp(i,0.0,1.0);}`
            })
        );
        planetInner.add(atmosphere);

        if (theme.rings) {
            ringMesh = new THREE.Mesh(
                new THREE.RingGeometry(R * 1.35, R * 2.25, 160, 1),
                new THREE.ShaderMaterial({
                    transparent: true, side: THREE.DoubleSide, depthWrite: false,
                    uniforms: { inner: { value: R * 1.35 }, outer: { value: R * 2.25 }, tint: { value: glow.clone().lerp(new THREE.Color(0xffffff), 0.5) } },
                    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
                    fragmentShader: `
                        varying vec2 vP; uniform float inner; uniform float outer; uniform vec3 tint;
                        void main(){
                            float r = length(vP);
                            float t = (r - inner) / (outer - inner);
                            float bands = 0.55 + 0.45 * sin(t * 46.0);
                            float cassini = smoothstep(0.44, 0.47, t) * (1.0 - smoothstep(0.5, 0.53, t));
                            float a = bands * (1.0 - cassini * 0.9);
                            a *= smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.9, 1.0, t));
                            gl_FragColor = vec4(tint, a * 0.6);
                        }`
                })
            );
            ringMesh.rotation.x = Math.PI * 0.5 - 0.42;
            ringMesh.rotation.y = 0.12;
            planetInner.add(ringMesh);
        }
    }

    let currentTheme = (window.__spaceTheme || localStorage.getItem('sv_planet') || 'terra');
    if (!THEMES[currentTheme]) currentTheme = 'terra';
    buildPlanet(currentTheme);

    // ---- moon ----
    const moon = new THREE.Mesh(
        new THREE.SphereGeometry(1.05, 40, 40),
        new THREE.MeshStandardMaterial({ color: 0x9aa3b4, bumpMap: buildMoonBump(), bumpScale: 0.35, roughness: 1 })
    );
    const moonOrbit = new THREE.Group(); planetGroup.add(moonOrbit);
    moon.position.set(-10.5, 3.2, -2); moonOrbit.add(moon);

    // ---- asteroid belt (instanced) ----
    const ROCKS = 460;
    const rockGeo = new THREE.IcosahedronGeometry(0.11, 0);
    // jitter vertices for irregular rocks
    const pos = rockGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, pos.getX(i) * (0.7 + Math.random() * 0.6), pos.getY(i) * (0.7 + Math.random() * 0.6), pos.getZ(i) * (0.7 + Math.random() * 0.6));
    }
    rockGeo.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8f9c, roughness: 1, metalness: 0.1, flatShading: true });
    const belt = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
    const dummy = new THREE.Object3D();
    const rockData = [];
    for (let i = 0; i < ROCKS; i++) {
        const radius = R * (1.7 + Math.random() * 0.85);
        const angle = Math.random() * Math.PI * 2;
        const yJit = (Math.random() - 0.5) * 0.9;
        const scl = 0.35 + Math.random() * 1.3;
        rockData.push({ radius, angle, yJit, scl, spin: (Math.random() - 0.5) * 0.02, speed: 0.02 + Math.random() * 0.03 });
        dummy.position.set(Math.cos(angle) * radius, yJit, Math.sin(angle) * radius);
        dummy.scale.setScalar(scl); dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        dummy.updateMatrix(); belt.setMatrixAt(i, dummy.matrix);
    }
    const beltGroup = new THREE.Group();
    beltGroup.rotation.x = Math.PI * 0.5 - 0.42; beltGroup.rotation.y = 0.12;
    beltGroup.add(belt); planetGroup.add(beltGroup);

    // ---- station ----
    const station = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc7d2e0, metalness: 0.9, roughness: 0.35 });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1b3a6b, metalness: 0.6, roughness: 0.4, emissive: 0x0a2f66, emissiveIntensity: 0.6 });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 12), bodyMat);
    core.rotation.z = Math.PI / 2; station.add(core);
    station.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 10, 32), bodyMat));
    for (const sgn of [-1, 1]) { const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.6), panelMat); panel.position.x = sgn * 1.1; station.add(panel); }
    station.scale.setScalar(0.9);
    const stationOrbit = new THREE.Group(); planetGroup.add(stationOrbit);
    station.position.set(R + 3.2, 0.4, 1.5); stationOrbit.add(station);

    // ---- starfield ----
    const starCount = 6000;
    const positions = new Float32Array(starCount * 3), colors = new Float32Array(starCount * 3), sizes = new Float32Array(starCount);
    const pal = [new THREE.Color(0xffffff), new THREE.Color(0xbcd4ff), new THREE.Color(0xfff0d0), new THREE.Color(0x9fb8ff)];
    for (let i = 0; i < starCount; i++) {
        const r = 120 + Math.random() * 700, th = Math.acos(2 * Math.random() - 1), ph = Math.random() * Math.PI * 2;
        positions[i * 3] = r * Math.sin(th) * Math.cos(ph); positions[i * 3 + 1] = r * Math.sin(th) * Math.sin(ph); positions[i * 3 + 2] = r * Math.cos(th);
        const c = pal[Math.floor(Math.random() * pal.length)];
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; sizes[i] = 0.5 + Math.random() * 2.4;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
        size: 2.6, map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), vertexColors: true,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
    scene.add(stars);

    // ---- nebulae ----
    const nebulaDefs = [
        { tex: radialTexture('rgba(80,130,255,0.55)', 'rgba(80,130,255,0)'), pos: [-30, 18, -120], scale: 150 },
        { tex: radialTexture('rgba(150,90,255,0.5)', 'rgba(150,90,255,0)'), pos: [40, -26, -160], scale: 190 },
        { tex: radialTexture('rgba(56,200,255,0.4)', 'rgba(56,200,255,0)'), pos: [10, 30, -100], scale: 120 }
    ];
    nebulaDefs.forEach((d) => {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: d.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
        spr.position.set(...d.pos); spr.scale.setScalar(d.scale); scene.add(spr);
    });

    // ---- interaction + animation ----
    let targetX = 0, targetY = 0, camX = 0, camY = 0;
    window.addEventListener('mousemove', (e) => {
        targetX = (e.clientX / window.innerWidth - 0.5);
        targetY = (e.clientY / window.innerHeight - 0.5);
    });

    const clock = new THREE.Clock();
    const render = () => renderer.render(scene, camera);

    const animate = () => {
        const dt = clock.getDelta(), t = clock.elapsedTime;
        if (planet) planet.rotation.y += dt * 0.035;
        if (clouds) { clouds.rotation.y += dt * 0.05; clouds.rotation.x += dt * 0.004; }
        moonOrbit.rotation.y += dt * 0.06;
        moonOrbit.rotation.x = Math.sin(t * 0.1) * 0.1;
        stationOrbit.rotation.y -= dt * 0.14; stationOrbit.rotation.x = 0.35;
        station.rotation.y += dt * 0.4;
        stars.rotation.y += dt * 0.004;

        // asteroid belt orbit
        beltGroup.rotation.z += dt * 0.02;
        for (let i = 0; i < ROCKS; i++) {
            const d = rockData[i];
            d.angle += dt * d.speed;
            dummy.position.set(Math.cos(d.angle) * d.radius, d.yJit, Math.sin(d.angle) * d.radius);
            dummy.scale.setScalar(d.scl);
            dummy.rotation.x += d.spin; dummy.rotation.y += d.spin * 1.3;
            dummy.updateMatrix(); belt.setMatrixAt(i, dummy.matrix);
        }
        belt.instanceMatrix.needsUpdate = true;

        camX += (targetX - camX) * 0.04; camY += (targetY - camY) * 0.04;
        camera.position.x = camX * 2.4; camera.position.y = -camY * 1.6;
        camera.lookAt(2.4, -0.4, 0);
        render();
        requestAnimationFrame(animate);
    };

    const resize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', resize);

    if (reduceMotion) render(); else animate();
    document.body.classList.add('has-webgl');

    // ---- public API (theme switching) ----
    window.SpaceScene = {
        setTheme(name) {
            if (!THEMES[name] || name === currentTheme) return;
            currentTheme = name;
            buildPlanet(name);
            render();
        },
        themes: () => Object.keys(THEMES).map((k) => ({ key: k, label: THEMES[k].label })),
        current: () => currentTheme
    };
    document.dispatchEvent(new CustomEvent('space-scene-ready'));
}

/* auto-init deferred so the boot sequence stays smooth */
function boot3d() {
    const canvas = document.getElementById('space3d');
    if (!canvas) return;
    try { initSpaceScene(canvas); }
    catch (e) { console.error('Space scene error:', e); document.body.classList.add('no-webgl'); }
}
if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot3d, 500);
else window.addEventListener('DOMContentLoaded', () => setTimeout(boot3d, 500));
