/* Migancore Orb — animated digital organism centerpiece */
const Orb = () => {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    // Generate points on a sphere
    const N = 220;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / N);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      pts.push({
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.sin(phi) * Math.sin(theta),
        z: Math.cos(phi),
        seed: Math.random() * Math.PI * 2,
      });
    }

    // Particles inside
    const particles = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        a: Math.random() * Math.PI * 2,
        b: Math.random() * Math.PI * 2,
        r: 0.3 + Math.random() * 0.6,
        speed: 0.4 + Math.random() * 1.2,
        hue: Math.random() < 0.6 ? 'g' : 'o',
      });
    }

    const render = (t) => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2, cy = H / 2;
      const R = Math.min(W, H) * 0.32;
      const time = t * 0.0004;

      // Outer glow
      const grd = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 1.6);
      grd.addColorStop(0, 'rgba(255, 138, 36, 0.18)');
      grd.addColorStop(0.5, 'rgba(47, 227, 154, 0.08)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      // Rotate sphere
      const cosT = Math.cos(time), sinT = Math.sin(time);
      const cosP = Math.cos(time * 0.5), sinP = Math.sin(time * 0.5);

      // project points
      const projected = pts.map(p => {
        // rotate around Y
        let x = p.x * cosT + p.z * sinT;
        let z = -p.x * sinT + p.z * cosT;
        let y = p.y;
        // tilt
        const y2 = y * cosP - z * sinP;
        const z2 = y * sinP + z * cosP;
        return {
          sx: cx + x * R,
          sy: cy + y2 * R,
          sz: z2,
          seed: p.seed,
        };
      });

      // edges: connect close points
      ctx.lineWidth = 0.8 * dpr;
      for (let i = 0; i < projected.length; i++) {
        const a = projected[i];
        for (let j = i + 1; j < projected.length; j++) {
          const b = projected[j];
          const dx = a.sx - b.sx, dy = a.sy - b.sy;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d < R * 0.32) {
            const depth = (a.sz + b.sz) / 2;
            const alpha = Math.max(0, (1 - d / (R * 0.32)) * (depth + 1) / 2 * 0.5);
            ctx.strokeStyle = `rgba(47, 227, 154, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }
      }

      // nodes
      for (const p of projected) {
        const depth = (p.sz + 1) / 2;
        const flick = 0.6 + 0.4 * Math.sin(time * 5 + p.seed * 4);
        const r = (1.4 + 1.6 * depth) * dpr * flick;
        const isHot = ((p.seed * 100) | 0) % 7 === 0;
        const color = isHot ? `rgba(255, 160, 60, ${0.6 + depth * 0.4})`
                            : `rgba(140, 240, 190, ${0.3 + depth * 0.55})`;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();
        if (isHot) {
          ctx.fillStyle = 'rgba(255, 138, 36, 0.18)';
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // hot core
      const coreR = R * (0.18 + 0.02 * Math.sin(time * 4));
      const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      coreG.addColorStop(0, 'rgba(255, 220, 140, 0.95)');
      coreG.addColorStop(0.4, 'rgba(255, 138, 36, 0.55)');
      coreG.addColorStop(1, 'rgba(255, 138, 36, 0)');
      ctx.fillStyle = coreG;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // streaming particles
      for (const pt of particles) {
        pt.a += 0.005 * pt.speed;
        pt.b += 0.003 * pt.speed;
        const px = Math.cos(pt.a) * Math.sin(pt.b) * R * pt.r;
        const py = Math.sin(pt.a) * Math.sin(pt.b) * R * pt.r;
        ctx.fillStyle = pt.hue === 'o' ? 'rgba(255, 180, 80, 0.9)' : 'rgba(120, 240, 180, 0.8)';
        ctx.beginPath();
        ctx.arc(cx + px, cy + py, 1.2 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      // base ring
      ctx.strokeStyle = 'rgba(255, 138, 36, 0.5)';
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      ctx.ellipse(cx, cy + R * 0.95, R * 1.1, R * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(47, 227, 154, 0.25)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + R * 0.95, R * 1.4, R * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} />;
};

/* Architecture core canvas — small spinning cube/orb */
const ArchCore = () => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { const r = c.getBoundingClientRect(); c.width = r.width * dpr; c.height = r.height * dpr; };
    resize();
    window.addEventListener('resize', resize);
    let raf;
    const render = (t) => {
      const W = c.width, H = c.height;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const time = t * 0.0006;
      const R = Math.min(W, H) * 0.22;

      // glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 3);
      g.addColorStop(0, 'rgba(47, 227, 154, 0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // rotating wireframe cube
      const verts = [];
      for (let i = 0; i < 8; i++) {
        verts.push([(i & 1 ? 1 : -1), (i & 2 ? 1 : -1), (i & 4 ? 1 : -1)]);
      }
      const cosT = Math.cos(time), sinT = Math.sin(time);
      const cosP = Math.cos(time * 0.7), sinP = Math.sin(time * 0.7);
      const proj = verts.map(([x,y,z]) => {
        const x1 = x * cosT + z * sinT;
        const z1 = -x * sinT + z * cosT;
        const y1 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP;
        const scale = 1.4 / (2 - z2 * 0.4);
        return [cx + x1 * R * scale, cy + y1 * R * scale, z2];
      });
      const edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
      ctx.lineWidth = 1.4 * dpr;
      for (const [a,b] of edges) {
        const A = proj[a], B = proj[b];
        const depth = (A[2] + B[2]) / 2;
        ctx.strokeStyle = `rgba(47, 227, 154, ${0.4 + depth * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(A[0], A[1]);
        ctx.lineTo(B[0], B[1]);
        ctx.stroke();
      }
      for (const p of proj) {
        ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
        ctx.beginPath();
        ctx.arc(p[0], p[1], 2.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      // pulsing center
      ctx.fillStyle = `rgba(255, 138, 36, ${0.4 + 0.3 * Math.sin(time * 5)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.3, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} />;
};

/* Sparkline canvas for data stream */
const Sparkline = ({ color = '#2fe39a' }) => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { const r = c.getBoundingClientRect(); c.width = r.width * dpr; c.height = r.height * dpr; };
    resize();
    window.addEventListener('resize', resize);
    let raf, t0 = 0;
    const data = [];
    for (let i = 0; i < 80; i++) data.push(Math.random());

    const render = (t) => {
      if (t - t0 > 80) {
        data.shift();
        data.push(0.3 + Math.random() * 0.7);
        t0 = t;
      }
      const W = c.width, H = c.height;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1.4 * dpr;
      ctx.strokeStyle = color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = (i / (data.length - 1)) * W;
        const y = H - v * H * 0.85 - H * 0.05;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
      // fill under
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      ctx.fillStyle = color + '22';
      ctx.fill();
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [color]);
  return <canvas ref={ref} />;
};

/* Product thumbnail — isometric blocks rendered with SVG */
const ProductThumb = ({ variant = 0 }) => {
  const seeds = [0, 1, 2, 3];
  const seed = seeds[variant % seeds.length];
  return (
    <svg viewBox="0 0 200 130" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`gp${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(47, 227, 154, 0.5)"/>
          <stop offset="1" stopColor="rgba(47, 227, 154, 0)"/>
        </linearGradient>
        <pattern id={`gd${seed}`} width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M14 0 L0 0 0 14" fill="none" stroke="rgba(47, 227, 154, 0.18)" strokeWidth="0.5"/>
        </pattern>
      </defs>
      <rect width="200" height="130" fill={`url(#gd${seed})`}/>
      {/* Isometric platform */}
      <g transform="translate(100, 90)">
        <path d="M -60 0 L 0 -30 L 60 0 L 0 30 Z" fill="rgba(47, 227, 154, 0.08)" stroke="rgba(47, 227, 154, 0.3)" strokeWidth="0.8"/>
        <path d="M -40 -10 L -20 -20 L 0 -10 L -20 0 Z" fill="rgba(47, 227, 154, 0.12)" stroke="rgba(47, 227, 154, 0.4)"/>
        <path d="M 20 -10 L 40 -20 L 60 -10 L 40 0 Z" fill="rgba(47, 227, 154, 0.12)" stroke="rgba(47, 227, 154, 0.4)"/>
        {/* Central glowing cube */}
        <g transform="translate(0, -30)">
          <path d="M -16 0 L 0 -8 L 16 0 L 16 14 L 0 22 L -16 14 Z" fill="rgba(47, 227, 154, 0.18)" stroke="#2fe39a" strokeWidth="1.2"/>
          <path d="M -16 0 L 0 8 L 16 0" fill="none" stroke="#2fe39a" strokeWidth="0.8" opacity="0.7"/>
          <path d="M 0 8 L 0 22" fill="none" stroke="#2fe39a" strokeWidth="0.8" opacity="0.5"/>
          <circle cx="0" cy="6" r="2.5" fill="#ffb060">
            <animate attributeName="r" values="2;3.5;2" dur="2s" repeatCount="indefinite"/>
          </circle>
        </g>
        {/* connecting lines */}
        <line x1="-40" y1="-15" x2="-16" y2="-25" stroke="rgba(255, 138, 36, 0.5)" strokeWidth="0.8" strokeDasharray="2 2"/>
        <line x1="40" y1="-15" x2="16" y2="-25" stroke="rgba(255, 138, 36, 0.5)" strokeWidth="0.8" strokeDasharray="2 2"/>
      </g>
      {/* floating dots */}
      {[...Array(6)].map((_, i) => (
        <circle key={i} cx={20 + i * 30 + seed * 5} cy={20 + (i % 2) * 15} r="1.2" fill={i % 2 ? '#ff8a24' : '#2fe39a'}>
          <animate attributeName="opacity" values="0.2;1;0.2" dur={`${2 + i * 0.3}s`} repeatCount="indefinite"/>
        </circle>
      ))}
    </svg>
  );
};

Object.assign(window, { Orb, ArchCore, Sparkline, ProductThumb });
