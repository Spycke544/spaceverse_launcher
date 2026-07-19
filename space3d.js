/* ============================================================
   SPACE VERSE · real-time 3D space scene (Three.js, offline)
   Procedural planet + atmosphere + clouds + moon + station +
   deep starfield + drifting nebulae. No external assets.
   ============================================================ */

import * as THREE from './vendor/three.module.min.js';

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* -------- tiny value-noise (fbm) for procedural textures -------- */
function makeNoise(seed = 1) {
    const perm = new Uint8Array(512);
    let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + t * (b - a);
    const grad = (h, x, y) => {
        const u = h & 1 ? x : -x, v = h & 2 ? y : -y;
        return u + v;
    };
    const noise2 = (x, y) => {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        x -= Math.floor(x); y -= Math.floor(y);
        const u = fade(x), v = fade(y);
        const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
        const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
        return lerp(
            lerp(grad(aa, x, y), grad(ba, x - 1, y), u),
            lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u), v
        );
    };
    return (x, y, oct = 5) => {
        let sum = 0, amp = 0.5, freq = 1, norm = 0;
        for (let i = 0; i < oct; i++) {
            sum += amp * noise2(x * freq, y * freq);
            norm += amp; amp *= 0.5; freq *= 2;
        }
        return sum / norm; // ~[-1,1]
    };
}

/* -------- lightweight rocky bump map (for the moon) -------- */
function buildMoonBump(w = 160, h = 80) {
    const noise = makeNoise(41);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let n = noise(x / w * 6, y / h * 3, 4);
            n = (n + 1) / 2;
            const v = 60 + n * 175;
            const i = (y * w + x) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(cv);
}

/* -------- build an earth-like equirectangular planet texture -------- */
function buildPlanetTextures(w = 1024, h = 512) {
    const noise = makeNoise(7);
    const cloudNoise = makeNoise(23);

    const color = document.createElement('canvas'); color.width = w; color.height = h;
    const bump = document.createElement('canvas'); bump.width = w; bump.height = h;
    const clouds = document.createElement('canvas'); clouds.width = w; clouds.height = h;
    const cctx = color.getContext('2d');
    const bctx = bump.getContext('2d');
    const clctx = clouds.getContext('2d');
    const cimg = cctx.createImageData(w, h);
    const bimg = bctx.createImageData(w, h);
    const climg = clctx.createImageData(w, h);

    const ramp = (t) => {
        // t: 0 deep ocean -> 1 snow peak
        if (t < 0.48) return [12, 34, 74];                 // deep ocean
        if (t < 0.5) return [22, 62, 120];                 // shallow
        if (t < 0.52) return [30, 96, 150];                // coast
        if (t < 0.55) return [196, 178, 120];              // sand
        if (t < 0.7) return [46, 104, 58];                 // grass
        if (t < 0.82) return [70, 92, 52];                 // forest/hill
        if (t < 0.9) return [110, 96, 78];                 // mountain rock
        return [236, 240, 248];                            // snow
    };

    for (let y = 0; y < h; y++) {
        const lat = (y / h) * Math.PI;              // 0..PI
        const polar = Math.abs((y / h) - 0.5) * 2;  // 0 eq -> 1 pole
        for (let x = 0; x < w; x++) {
            const lon = (x / w) * Math.PI * 2;
            // sample noise on a sphere-ish domain to reduce seam
            const nx = Math.cos(lon) * Math.sin(lat);
            const ny = Math.sin(lon) * Math.sin(lat);
            const nz = Math.cos(lat);
            let e = noise(2.4 + nx * 2.2 + 5, 2.4 + ny * 2.2 + nz * 1.1, 6);
            e = (e + 1) / 2;                          // 0..1
            e = Math.pow(e, 1.15);
            // ice caps
            let t = e;
            if (polar > 0.82) t = Math.max(t, 0.92 - (1 - polar) * 0.3);

            const i = (y * w + x) * 4;
            const [r, g, b] = ramp(t);
            cimg.data[i] = r; cimg.data[i + 1] = g; cimg.data[i + 2] = b; cimg.data[i + 3] = 255;

            const isLand = t >= 0.52;
            const bv = isLand ? 90 + t * 165 : 40;
            bimg.data[i] = bv; bimg.data[i + 1] = bv; bimg.data[i + 2] = bv; bimg.data[i + 3] = 255;

            // clouds
            let c = cloudNoise(nx * 2.6 + 11, ny * 2.6 + nz * 1.3 + 11, 5);
            c = (c + 1) / 2;
            c = Math.max(0, (c - 0.5) * 2.4);
            const ca = Math.min(255, c * 255) * (1 - polar * 0.35);
            climg.data[i] = 255; climg.data[i + 1] = 255; climg.data[i + 2] = 255; climg.data[i + 3] = ca;
        }
    }
    cctx.putImageData(cimg, 0, 0);
    bctx.putImageData(bimg, 0, 0);
    clctx.putImageData(climg, 0, 0);

    const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    const bmp = new THREE.CanvasTexture(bump);
    return { map: mk(color), bump: bmp, clouds: mk(clouds) };
}

/* -------- radial sprite texture for nebulae / glow -------- */
function radialTexture(inner, outer) {
    const s = 256;
    const cv = document.createElement('canvas'); cv.width = cv.height = s;
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

    // ---- lights ----
    scene.add(new THREE.AmbientLight(0x22304e, 0.65));
    const sun = new THREE.DirectionalLight(0xdfe9ff, 2.4);
    sun.position.set(-6, 3, 7);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x3a78ff, 0.5);
    rim.position.set(8, -2, -6);
    scene.add(rim);

    // ---- planet group (placed right side) ----
    const planetGroup = new THREE.Group();
    planetGroup.position.set(8.6, -2.2, 0);
    scene.add(planetGroup);

    const R = 6.4;
    const tex = buildPlanetTextures();
    const planet = new THREE.Mesh(
        new THREE.SphereGeometry(R, 96, 96),
        new THREE.MeshStandardMaterial({
            map: tex.map, bumpMap: tex.bump, bumpScale: 0.28,
            metalness: 0.05, roughness: 0.92
        })
    );
    planet.rotation.z = 0.32;
    planetGroup.add(planet);

    // clouds
    const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(R * 1.015, 64, 64),
        new THREE.MeshStandardMaterial({ map: tex.clouds, transparent: true, opacity: 0.55, depthWrite: false })
    );
    planetGroup.add(clouds);

    // atmosphere (fresnel rim glow, additive backside shell)
    const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(R * 1.14, 64, 64),
        new THREE.ShaderMaterial({
            transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
            uniforms: { glow: { value: new THREE.Color(0x3fa9ff) } },
            vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
            fragmentShader: `varying vec3 vN; uniform vec3 glow; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 2.4); gl_FragColor = vec4(glow, 1.0) * clamp(i,0.0,1.0);}`
        })
    );
    planetGroup.add(atmosphere);

    // ---- moon ----
    const moonBump = buildMoonBump();
    const moon = new THREE.Mesh(
        new THREE.SphereGeometry(1.05, 40, 40),
        new THREE.MeshStandardMaterial({ color: 0x9aa3b4, bumpMap: moonBump, bumpScale: 0.35, roughness: 1 })
    );
    const moonOrbit = new THREE.Group();
    planetGroup.add(moonOrbit);
    moon.position.set(-10.5, 3.2, -2);
    moonOrbit.add(moon);

    // ---- orbiting station / satellite ----
    const station = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc7d2e0, metalness: 0.9, roughness: 0.35 });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1b3a6b, metalness: 0.6, roughness: 0.4, emissive: 0x0a2f66, emissiveIntensity: 0.6 });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 12), bodyMat);
    core.rotation.z = Math.PI / 2; station.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 10, 32), bodyMat); station.add(ring);
    for (const sgn of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.6), panelMat);
        panel.position.x = sgn * 1.1; station.add(panel);
    }
    station.scale.setScalar(0.9);
    const stationOrbit = new THREE.Group();
    planetGroup.add(stationOrbit);
    station.position.set(R + 2.6, 0.4, 1.5);
    stationOrbit.add(station);

    // ---- deep starfield ----
    const starCount = 6000;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const pal = [new THREE.Color(0xffffff), new THREE.Color(0xbcd4ff), new THREE.Color(0xfff0d0), new THREE.Color(0x9fb8ff)];
    for (let i = 0; i < starCount; i++) {
        const r = 120 + Math.random() * 700;
        const th = Math.acos(2 * Math.random() - 1);
        const ph = Math.random() * Math.PI * 2;
        positions[i * 3] = r * Math.sin(th) * Math.cos(ph);
        positions[i * 3 + 1] = r * Math.sin(th) * Math.sin(ph);
        positions[i * 3 + 2] = r * Math.cos(th);
        const c = pal[Math.floor(Math.random() * pal.length)];
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        sizes[i] = 0.5 + Math.random() * 2.4;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const starTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    const starMat = new THREE.PointsMaterial({
        size: 2.6, map: starTex, vertexColors: true, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ---- nebulae (additive sprites) ----
    const nebulaDefs = [
        { tex: radialTexture('rgba(80,130,255,0.55)', 'rgba(80,130,255,0)'), pos: [-30, 18, -120], scale: 150 },
        { tex: radialTexture('rgba(150,90,255,0.5)', 'rgba(150,90,255,0)'), pos: [40, -26, -160], scale: 190 },
        { tex: radialTexture('rgba(56,200,255,0.4)', 'rgba(56,200,255,0)'), pos: [10, 30, -100], scale: 120 }
    ];
    const nebulae = nebulaDefs.map((d) => {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: d.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
        spr.position.set(...d.pos); spr.scale.setScalar(d.scale); scene.add(spr);
        return spr;
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
        const dt = clock.getDelta();
        const t = clock.elapsedTime;
        planet.rotation.y += dt * 0.035;
        clouds.rotation.y += dt * 0.05;
        clouds.rotation.x += dt * 0.004;
        moonOrbit.rotation.y += dt * 0.06;
        moonOrbit.rotation.x = Math.sin(t * 0.1) * 0.1;
        stationOrbit.rotation.y -= dt * 0.14;
        stationOrbit.rotation.x = 0.35;
        station.rotation.y += dt * 0.4;
        stars.rotation.y += dt * 0.004;

        camX += (targetX - camX) * 0.04;
        camY += (targetY - camY) * 0.04;
        camera.position.x = camX * 2.4;
        camera.position.y = -camY * 1.6;
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

    if (reduceMotion) { render(); }
    else { animate(); }

    document.body.classList.add('has-webgl');
}

// auto-init (deferred so the boot sequence animates smoothly before the
// heavy procedural texture generation runs on the main thread)
function boot3d() {
    const canvas = document.getElementById('space3d');
    if (!canvas) return;
    try { initSpaceScene(canvas); }
    catch (e) { console.error('Space scene error:', e); document.body.classList.add('no-webgl'); }
}
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot3d, 500);
} else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(boot3d, 500));
}
