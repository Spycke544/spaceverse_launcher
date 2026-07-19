/* ============================================================
   SPACE VERSE · custom reticle cursor + ion particle trail
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    const reticle = document.getElementById('reticle');
    const canvas = document.getElementById('cursor-particles');
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;

    // --- reticle follow ---
    if (reticle) {
        const follow = () => {
            reticle.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
            requestAnimationFrame(follow);
        };
        follow();
    }

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    // --- reticle "hot" state over interactive elements ---
    document.addEventListener('mouseover', (e) => {
        if (!reticle) return;
        const interactive = e.target.closest('button, a, .secondary-btn, .launch-button');
        reticle.classList.toggle('hot', !!interactive);
    });
    document.addEventListener('mousedown', () => reticle?.classList.add('down'));
    document.addEventListener('mouseup', () => reticle?.classList.remove('down'));

    // --- ion particle trail ---
    if (!canvas || reduceMotion) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let lastX = mouseX;
    let lastY = mouseY;

    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    document.addEventListener('mousemove', (e) => {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        const dist = Math.hypot(dx, dy);
        lastX = e.clientX;
        lastY = e.clientY;
        const count = Math.min(3, Math.floor(dist / 6));
        for (let i = 0; i < count; i++) {
            particles.push({
                x: e.clientX + (Math.random() - 0.5) * 6,
                y: e.clientY + (Math.random() - 0.5) * 6,
                vx: (Math.random() - 0.5) * 0.6,
                vy: (Math.random() - 0.5) * 0.6 + 0.3,
                r: 0.8 + Math.random() * 1.6,
                life: 0,
                max: 26 + Math.random() * 22,
                hot: Math.random() < 0.25
            });
        }
        if (particles.length > 220) particles = particles.slice(-220);
    });

    const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'lighter';
        particles.forEach((p, i) => {
            p.life++;
            p.x += p.vx;
            p.y += p.vy;
            const alpha = Math.max(0, 1 - p.life / p.max) * 0.8;
            const rgb = p.hot ? '255,206,122' : '110,214,255';
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
            g.addColorStop(0, `rgba(${rgb},${alpha})`);
            g.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
            ctx.fill();
            if (p.life > p.max) particles.splice(i, 1);
        });
        ctx.globalCompositeOperation = 'source-over';
        requestAnimationFrame(draw);
    };
    draw();
});
