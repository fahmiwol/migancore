/* Immersive interactive layer for Migancore */

const BootSequence = ({ onDone }) => {
  const lines = [
    { t: 'PostgreSQL: tenants + RLS policies... OK', s: 'ok' },
    { t: 'Redis: memory tier-1 pool acquired...', s: 'ok' },
    { t: 'Qdrant: vector store handshake... OK', s: 'ok' },
    { t: 'Ollama: Qwen2.5-7B-Instruct · 14 tok/s', s: 'hot' },
    { t: 'SOUL.md: identity fingerprint active ✓', s: 'hot' },
  ];
  const [idx, setIdx] = React.useState(0);
  const [hide, setHide] = React.useState(false);
  React.useEffect(() => {
    const seen = sessionStorage.getItem('mc-booted');
    if (seen) { setHide(true); setTimeout(onDone, 50); return; }
    let i = 0;
    const tick = setInterval(() => {
      i++;
      if (i >= lines.length) { clearInterval(tick); setTimeout(() => { setHide(true); setTimeout(onDone, 600); sessionStorage.setItem('mc-booted', '1'); }, 500); return; }
      setIdx(i);
    }, 480);
    return () => clearInterval(tick);
  }, []);
  return (
    <div className={`boot ${hide ? 'hide' : ''}`}>
      <div className="boot-logo">
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="#ff8a24" strokeWidth="1.5" strokeDasharray="4 4"/>
          <circle cx="32" cy="32" r="18" fill="none" stroke="#2fe39a" strokeWidth="1.5"/>
          <circle cx="32" cy="32" r="6" fill="#ff8a24"/>
        </svg>
      </div>
      <div className="boot-line">
        {lines.slice(0, idx + 1).map((l, i) => (
          <div key={i}>
            <span className={l.s === 'hot' ? 'hot' : 'ok'}>▸</span> {l.t}{i < idx ? ' ✓' : ''}
          </div>
        ))}
      </div>
      <div className="boot-bar"><i/></div>
      <div className="boot-meta">
        <span>BUILD</span><b>v0.3.2</b>
        <span>MODEL</span><b>QWEN2.5-7B · 14 TOK/S</b>
        <span>CHANNEL</span><b>SECURE</b>
      </div>
    </div>
  );
};

const CustomCursor = () => {
  const dot = React.useRef(null), ring = React.useRef(null);
  React.useEffect(() => {
    let rx = 0, ry = 0, dx = 0, dy = 0;
    const onMove = (e) => {
      dx = e.clientX; dy = e.clientY;
      if (dot.current) { dot.current.style.transform = `translate(${dx}px, ${dy}px)`; }
    };
    const tick = () => {
      rx += (dx - rx) * 0.18; ry += (dy - ry) * 0.18;
      if (ring.current) { ring.current.style.transform = `translate(${rx}px, ${ry}px)`; }
      raf = requestAnimationFrame(tick);
    };
    let raf = requestAnimationFrame(tick);
    const onOver = (e) => {
      if (e.target.closest('a, button, .produk-card, .siklus-card, .arch-node, .proses-step, .hex')) {
        ring.current?.classList.add('hot');
      } else {
        ring.current?.classList.remove('hot');
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseover', onOver);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseover', onOver); };
  }, []);
  return (<>
    <div className="cursor-dot" ref={dot}/>
    <div className="cursor-ring" ref={ring}/>
  </>);
};

const ScrollProgress = () => {
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const p = h.scrollTop / (h.scrollHeight - h.clientHeight);
      setW(Math.min(100, Math.max(0, p * 100)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <div className="scroll-progress" style={{width: w + '%'}}/>;
};

const ParallaxBg = () => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onMove = (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 30;
      const y = (e.clientY / window.innerHeight - 0.5) * 30;
      if (ref.current) ref.current.style.transform = `translate(${x}px, ${y}px)`;
      // also tilt orb
      document.documentElement.style.setProperty('--pan', (x * 0.4) + 'deg');
      document.documentElement.style.setProperty('--tilt', (-y * 0.3) + 'deg');
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return <div className="bg-parallax" ref={ref}/>;
};

const FloatingParticles = () => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { c.width = window.innerWidth * dpr; c.height = window.innerHeight * dpr; };
    resize(); window.addEventListener('resize', resize);
    const N = 60;
    const ps = Array.from({length: N}, () => ({
      x: Math.random() * c.width, y: Math.random() * c.height,
      vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
      r: Math.random() * 1.6 + 0.4,
      hot: Math.random() < 0.2,
    }));
    let raf;
    const render = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of ps) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0;
        if (p.y < 0) p.y = c.height; if (p.y > c.height) p.y = 0;
        ctx.fillStyle = p.hot ? 'rgba(255, 180, 80, 0.6)' : 'rgba(120, 240, 180, 0.35)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas className="bg-particles" ref={ref}/>;
};

const useReveal = () => {
  React.useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
};

const useCounter = (target, duration = 1600) => {
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    let raf, start;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
};

const HUD = () => {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  const t = now.toISOString().slice(11, 19);
  return (
    <div className="hud">
      <div>UTC <b>{t}</b> · NET <b>STABLE</b></div>
      <div>MIGANCORE / SPRINT DAY 12</div>
    </div>
  );
};

const TerminalFeed = () => {
  const MEMORY_KEYS = ['user_goal', 'last_query', 'context_summary', 'agent_persona', 'task_queue', 'session_state'];
  const SEARCH_QUERIES = ['migancore ADO', 'LangGraph tutorial', 'Qwen2.5 tool calling', 'Redis TTL strategy', 'FastAPI SSE stream'];
  const templates = [
    { lv: 'info', m: 'Agent <b>core_brain</b> responded · {ms}ms · <b>{n}</b> tokens' },
    { lv: 'evo',  m: 'memory_write: key=<b>{key}</b> · ns=default · TTL 30d ✓' },
    { lv: 'info', m: 'SOUL.md identity check: sim=<b>0.{sim}</b> · identity stable ✓' },
    { lv: 'evo',  m: 'Tool call: web_search("<b>{q}</b>") → <b>{r}</b> results' },
    { lv: 'info', m: 'Conversation <b>conv_{id}</b> created · agent=Mighan-Core' },
    { lv: 'warn', m: 'Rate limit: IP <b>{ip}</b> · 30/min cap · request throttled' },
    { lv: 'evo',  m: 'SSE stream done · <b>{tok}</b> tokens · {ms}ms · persisted ✓' },
    { lv: 'info', m: 'python_repl: rc=0 · <b>{lines}</b> lines · sandbox clean' },
  ];
  const [lines, setLines] = React.useState([]);
  React.useEffect(() => {
    const push = () => {
      const t = templates[Math.floor(Math.random() * templates.length)];
      const ts = new Date().toISOString().slice(11, 19);
      const randHex = (n) => Math.random().toString(16).slice(2, 2+n);
      const m = t.m
        .replace('{ms}', Math.floor(Math.random() * 1600) + 400)
        .replace('{n}', Math.floor(Math.random() * 432) + 80)
        .replace('{key}', MEMORY_KEYS[Math.floor(Math.random() * MEMORY_KEYS.length)])
        .replace('{sim}', Math.floor(Math.random() * 14) + 85)
        .replace('{q}', SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)])
        .replace('{r}', Math.floor(Math.random() * 7) + 1)
        .replace('{id}', randHex(8))
        .replace('{ip}', `10.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`)
        .replace('{tok}', Math.floor(Math.random() * 680) + 120)
        .replace('{lines}', Math.floor(Math.random() * 23) + 1);
      setLines(prev => [{ ts, lv: t.lv, m, key: Math.random() }, ...prev].slice(0, 8));
    };
    push();
    const i = setInterval(push, 1400);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="terminal panel-corners-g reveal">
      <div className="terminal-head">
        <div style={{display:'flex', gap: 14, alignItems:'center'}}>
          <div className="lights"><span className="r"/><span className="y"/><span className="g"/></div>
          <span className="title">migancore.live // event-stream</span>
        </div>
        <span style={{fontSize: 10, color:'var(--text-mute)', letterSpacing:'0.2em'}}>● STREAMING</span>
      </div>
      <div className="terminal-body">
        {lines.map(l => (
          <div className="terminal-line" key={l.key}>
            <span className="ts">{l.ts}</span>
            <span className={`lv ${l.lv}`}>{l.lv.toUpperCase()}</span>
            <span className="msg" dangerouslySetInnerHTML={{__html: l.m}}/>
          </div>
        ))}
      </div>
    </div>
  );
};

const KonsoleModal = () => {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onClick = (e) => {
      const a = e.target.closest('a[href="#konsole"], a[href="#access"], a[href="#launch"], a[href="#mulai"]');
      if (a) { e.preventDefault(); setOpen(true); }
    };
    document.addEventListener('click', onClick);
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick); window.removeEventListener('keydown', onKey); };
  }, []);
  return (
    <div className={`konsole-back ${open ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="konsole-modal">
        <button className="konsole-close" onClick={() => setOpen(false)}>✕</button>
        <span className="panel-label">◆ AKSES KONSOLE</span>
        <h3>Bergabung dengan Embrio</h3>
        <p>Daftar untuk akses awal ke sistem Migancore. Kami akan kirimkan undangan terbatas.</p>
        <form className="konsole-form" onSubmit={(e) => { e.preventDefault(); setOpen(false); }}>
          <input placeholder="<email>" type="email" required/>
          <input placeholder="ORGANISASI / PROYEK" type="text"/>
          <button type="submit" className="btn btn-primary" style={{justifyContent:'center', marginTop: 6}}>
            REQUEST ACCESS <IconArrowRight size={14}/>
          </button>
        </form>
        <div style={{marginTop: 14, fontFamily:'var(--mono)', fontSize: 10, color:'var(--text-mute)', letterSpacing:'0.2em'}}>
          ENCRYPTED · END-TO-END · ZERO-TRUST
        </div>
      </div>
    </div>
  );
};

const SoundFab = () => {
  const [on, setOn] = React.useState(false);
  const ctxRef = React.useRef(null);
  const oscRef = React.useRef(null);
  const toggle = () => {
    if (!on) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 55;
        o2.type = 'triangle'; o2.frequency.value = 110;
        g.gain.value = 0.04; g2.gain.value = 0.02;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.18;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.02;
        lfo.connect(lfoGain).connect(g.gain);
        o.connect(g).connect(ctx.destination);
        o2.connect(g2).connect(ctx.destination);
        o.start(); o2.start(); lfo.start();
        ctxRef.current = ctx; oscRef.current = [o, o2, lfo];
      } catch (e) {}
    } else {
      try { oscRef.current?.forEach(o => o.stop()); ctxRef.current?.close(); } catch (e) {}
      ctxRef.current = null; oscRef.current = null;
    }
    setOn(!on);
  };
  return (
    <button className={`toggle-fab ${on ? 'on' : ''}`} onClick={toggle} aria-label="Ambient sound">
      {on ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15 9c1.5 1 1.5 5 0 6M19 6c3 3 3 9 0 12"/></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>
      )}
    </button>
  );
};

Object.assign(window, {
  BootSequence, CustomCursor, ScrollProgress, ParallaxBg, FloatingParticles,
  useReveal, useCounter, HUD, TerminalFeed, KonsoleModal, SoundFab,
});
