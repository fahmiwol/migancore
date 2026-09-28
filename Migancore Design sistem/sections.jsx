/* Migancore — Section components */

const NavBar = () => (
  <nav className="nav">
    <div className="brand">
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" width="26" height="26">
          <defs>
            <linearGradient id="bg-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffb060"/>
              <stop offset="1" stopColor="#d95e0e"/>
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="28" height="28" rx="4" fill="none" stroke="url(#bg-grad)" strokeWidth="1.5"/>
          <path d="M9 22 L9 10 L16 18 L23 10 L23 22" fill="none" stroke="url(#bg-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="16" cy="16" r="2" fill="#2fe39a"/>
        </svg>
      </span>
      <span>MIGANCORE</span>
    </div>
    <div className="nav-links">
      <a href="#produk">Produk</a>
      <a href="#arsitektur">Arsitektur</a>
      <a href="#evolusi">Evolusi</a>
      <a href="#dokumentasi">Dokumentasi</a>
      <a href="#tentang">Tentang</a>
    </div>
    <div className="nav-right">
      <span className="nav-status">SYSTEM STATUS <b>OPTIMAL</b><span className="dot-pulse"/></span>
      <a href="#konsole" className="btn btn-primary">KONSOLE <IconArrowRight size={14}/></a>
    </div>
  </nav>
);

const Hero = () => {
  const uptime = useCounter(99.982, 1800);
  const tokens = useCounter(14, 1800);
  const readiness = useCounter(40, 1600);
  return (
  <section className="hero">
    <div className="panel panel-corners hot hero-card reveal">
      <div className="hero-meta">
        <span className="panel-label">◆ MISSION CONTROL</span>
        <span className="live-feed"><span className="dot-pulse"/> LIVE FEED</span>
      </div>
      <h1 className="hero-title">Embrio dalam<br/>Kandungan <span className="accent">Digital</span></h1>
      <p className="hero-sub">Bukan chatbot. Organisme digital dengan identitas permanen (SOUL.md), memori multi-tier, dan kemampuan melahirkan agen anak — semuanya berjalan di hardware terjangkau.</p>
      <div className="hero-actions">
        <a className="btn btn-primary" href="#konsole">DAFTAR AKSES AWAL <IconArrowRight size={14}/></a>
        <a className="btn btn-ghost" href="#arsitektur">LIHAT ARSITEKTUR</a>
      </div>
      <div className="stat-row">
        <div className="stat"><div className="label">SYSTEM UPTIME</div><div className="val">{uptime.toFixed(3)}%</div></div>
        <div className="stat"><div className="label">TOKEN/DETIK (QWEN)</div><div className="val">{Math.round(tokens)}</div></div>
      </div>
    </div>

    <div className="orb-wrap">
      <Orb/>
      <div className="orb-overlay"/>
      <div className="scan-line"/>
      <div style={{position:'absolute', top: 18, left: 18, fontFamily:'var(--mono)', fontSize: 10, color:'var(--text-mute)', letterSpacing:'0.2em'}}>
        MIGHAN-CORE // <span style={{color:'var(--green)'}}>SOUL.md ACTIVE</span>
      </div>
      <div style={{position:'absolute', top: 18, right: 18, fontFamily:'var(--mono)', fontSize: 10, color:'var(--text-mute)', letterSpacing:'0.2em'}}>
        v0.3.2
      </div>
    </div>

    <div style={{display:'flex', flexDirection:'column', gap: 18}} className="reveal">
      <div className="panel panel-corners-g diag-card">
        <h4>SPRINT PROGRESS <IconRocket size={14}/></h4>
        <div className="readiness-num">{Math.round(readiness)}<small>%</small></div>
        <div className="readiness-bar"/>
      </div>
      <div className="panel panel-corners-g diag-card">
        <h4>STACK STATUS <IconShield size={14}/></h4>
        <div className="diag-grid">
          <div className="diag-cell"><div className="l">POSTGRES</div><div className="v" style={{color:'var(--green)'}}>OK</div></div>
          <div className="diag-cell"><div className="l">QDRANT</div><div className="v" style={{color:'var(--green)'}}>OK</div></div>
          <div className="diag-cell"><div className="l">OLLAMA</div><div className="v" style={{color:'var(--green)'}}>OK</div></div>
          <div className="diag-cell"><div className="l">REDIS</div><div className="v" style={{color:'var(--green)'}}>OK</div></div>
        </div>
      </div>
      <div className="panel panel-corners-g diag-card">
        <h4>DATA STREAM <span style={{color:'var(--orange)'}}>● REAL-TIME</span></h4>
        <div className="sparkline"><Sparkline color="#2fe39a"/></div>
      </div>
    </div>
  </section>
  );
};

const ProsesHex = ({ active }) => (
  <svg viewBox="0 0 100 110">
    <defs>
      <linearGradient id={`hg-${active ? 'a' : 'b'}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={active ? '#ffb060' : 'rgba(47, 227, 154, 0.5)'}/>
        <stop offset="1" stopColor={active ? 'rgba(255, 138, 36, 0.1)' : 'rgba(47, 227, 154, 0.05)'}/>
      </linearGradient>
    </defs>
    <polygon points="50,4 92,28 92,80 50,104 8,80 8,28"
      fill={active ? 'rgba(255, 138, 36, 0.06)' : 'rgba(47, 227, 154, 0.04)'}
      stroke={active ? '#ff8a24' : 'rgba(47, 227, 154, 0.5)'}
      strokeWidth="1.4"
      className="hex-stroke"/>
    <polygon points="50,12 84,32 84,76 50,96 16,76 16,32"
      fill="none"
      stroke={active ? 'rgba(255, 138, 36, 0.4)' : 'rgba(47, 227, 154, 0.2)'}
      strokeWidth="0.8"
      strokeDasharray="2 3"/>
  </svg>
);

const Proses = () => {
  const steps = [
    { num: '01', name: 'Seed & Soul', desc: 'SOUL.md, schema, stack infra. Identitas permanen dikunci.', icon: <IconStar size={36}/> },
    { num: '02', name: 'Core Brain', desc: 'Auth, RLS, Ollama, Agent CRUD, chat dengan memori percakapan.', icon: <IconAtom size={36}/> },
    { num: '03', name: 'Intelligence Layer', desc: 'Safety gates ✅ · Agent spawn ✅ · Qdrant RAG memory ◀ HARI INI', icon: <IconCube size={36}/>, active: true },
    { num: '04', name: 'Self-Improvement', desc: 'Feedback loop, SimPO training, evaluasi identitas otomatis.', icon: <IconHeart size={36}/> },
    { num: '05', name: 'Agent Spawner', desc: 'Kloning agen, silsilah keturunan, marketplace mighan.com.', icon: <IconRocket size={36}/> },
  ];
  return (
    <section className="panel panel-corners section reveal">
      <div className="section-head">
        <div className="section-title">SISTEM PROSES</div>
        <div style={{fontFamily:'var(--mono)', fontSize: 11, color:'var(--text-mute)', letterSpacing:'0.18em'}}>
          5 FASE / 1 ORGANISME
        </div>
      </div>
      <div className="proses">
        {steps.map((s, i) => (
          <div key={i} className={`proses-step ${s.active ? 'active' : ''}`}>
            <div className={`hex ${s.active ? 'active' : ''}`}>
              <ProsesHex active={s.active}/>
              <div className="hex-icon">{s.icon}</div>
            </div>
            <div className="proses-num">{s.num}</div>
            <div className="proses-name">{s.name}</div>
            <div className="proses-desc">{s.desc}</div>
          </div>
        ))}
      </div>
      <div className="progress-block">
        <div className="pl">PROGRES SPRINT 30 HARI</div>
        <div className="progress-bar"><div className="progress-fill" style={{width:'40%'}}/></div>
        <div className="progress-meta">
          <span>Day 12 · Safety ✅ · Spawn ✅ · Tool Policy ✅ · Qdrant RAG →</span>
          <b>40%</b>
        </div>
      </div>
    </section>
  );
};

const Produk = () => {
  const items = [
    { name: 'MIGANCORE CORE', desc: 'Core Brain Engine: Qwen2.5-7B + LangGraph director + SOUL.md. Identitas persisten yang survive lintas model version.' },
    { name: 'MIGANCORE MEMORY', desc: 'Stack memori 3 tier: Redis K-V (instan), Qdrant semantic (jangka panjang), Letta working memory (konteks aktif).' },
    { name: 'MIGANCORE SPAWN', desc: 'Platform genealogi agen: kloning dengan persona turunan, silsilah tercatat, karakter diwariskan dari orang tua ke anak.' },
    { name: 'MIGANCORE LAUNCHPAD', desc: 'SaaS multi-tenant: deploy agen kamu di mighan.com. Billing, dashboard, marketplace — tanpa infrastruktur sendiri.' },
  ];
  return (
    <section id="produk" className="panel panel-corners section reveal">
      <div className="section-head">
        <div className="section-title">PRODUK UTAMA</div>
        <div style={{fontFamily:'var(--mono)', fontSize: 11, color:'var(--text-mute)', letterSpacing:'0.18em'}}>
          4 MODUL · 1 EKOSISTEM
        </div>
      </div>
      <div className="produk-grid">
        {items.map((p, i) => (
          <div key={i} className="produk-card reveal" onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
            e.currentTarget.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
            const rx = ((e.clientY - r.top) / r.height - 0.5) * -6;
            const ry = ((e.clientX - r.left) / r.width - 0.5) * 6;
            e.currentTarget.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-3px)`;
          }} onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}>
            <div className="glow"/>
            <div className="produk-thumb"><ProductThumb variant={i}/></div>
            <h3 className="produk-name">{p.name}</h3>
            <p className="produk-desc">{p.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

const Arsitektur = () => {
  const left = [
    { n: 'SOUL.md IDENTITY', d: 'Persona permanen: nilai, suara, fingerprint test' },
    { n: 'PERCAKAPAN MULTI-TURN', d: 'SSE streaming + history dari Postgres' },
    { n: 'MEMORY INJECT', d: 'Redis K-V summary → system prompt otomatis' },
    { n: 'TOOL REGISTRY', d: 'MCP-compatible: web_search, python_repl, memory R/W' },
  ];
  const right = [
    { n: 'STREAMING RESPONSE', d: 'Server-Sent Events, chunk real-time ke klien' },
    { n: 'AGENT SPAWN', d: 'Clone + persona inherit + genealogy tree Postgres' },
    { n: 'MEMORY WRITE', d: 'Redis Tier 1 → Qdrant Tier 2 (semantic search)' },
    { n: 'SIDIXLAB RESEARCH', d: 'Paper ingestion, knowledge graph, training data' },
  ];
  return (
    <section id="arsitektur" className="panel panel-corners section reveal">
      <div className="section-head">
        <div className="section-title">ARSITEKTUR SISTEM</div>
        <div style={{fontFamily:'var(--mono)', fontSize: 11, color:'var(--text-mute)', letterSpacing:'0.18em'}}>
          MODULAR · SCALABLE · RESILIENT
        </div>
      </div>
      <div className="arch-wrap">
        <div className="arch-side">
          <div>
            <p className="arch-intro">Arsitektur modular yang dirancang untuk skala kosmik, stabilitas tinggi, dan evolusi tanpa batas.</p>
            <a href="#arch-detail" className="btn btn-ghost arch-cta">LIHAT ARSITEKTUR <IconArrowRight size={14}/></a>
          </div>
          <div className="arch-nodes">
            {left.map(n => (
              <div key={n.n} className="arch-node">
                <span className="ndot"/>{n.n}
                <span className="tip">{n.d}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="arch-center">
          <div className="core-label">▣ MIGHAN-CORE v0.3.2</div>
          <ArchCore/>
          <div className="arch-bottom">
            <span className="arch-pill"><IconCircuit size={12}/> REDIS K-V</span>
            <span className="arch-pill"><IconNetwork size={12}/> QDRANT VECTOR</span>
            <span className="arch-pill"><IconBrain size={12}/> QWEN2.5-7B</span>
          </div>
        </div>
        <div className="arch-side">
          <div className="arch-nodes">
            {right.map(n => (
              <div key={n.n} className="arch-node">
                <span className="ndot"/>{n.n}
                <span className="tip">{n.d}</span>
              </div>
            ))}
          </div>
          <div style={{textAlign:'right', fontFamily:'var(--mono)', fontSize: 11, color:'var(--text-mute)', letterSpacing:'0.18em'}}>
            <div>INFERENCE · 14 tok/s</div>
            <div style={{color:'var(--green)'}}>● SSE STREAMING</div>
          </div>
        </div>
      </div>
    </section>
  );
};

const Evolusi = () => {
  const items = [
    { num: '01', name: 'OBSERVASI', desc: 'Setiap percakapan direkam. Feedback implisit (retry, panjang sesi) dikumpulkan otomatis.', icon: <IconTelescope size={32}/> },
    { num: '02', name: 'FILTRASI', desc: 'CQF: 10 kriteria kualitas filter data. Hanya yang skor ≥7.0 masuk dataset training.', icon: <IconBrain size={32}/> },
    { num: '03', name: 'PREFERENSI', desc: 'SimPO + Constitutional AI: hasilkan pasangan (pilihan, ditolak) dari setiap respon.', icon: <IconBlocks size={32}/> },
    { num: '04', name: 'PELATIHAN', desc: 'QLoRA fine-tuning di RunPod ($50 budget). Fingerprint test wajib lulus sebelum deploy.', icon: <IconExpand size={32}/> },
    { num: '05', name: 'EVOLUSI', desc: 'Model baru aktif. Kepribadian diwariskan. Anak agen dilahirkan. Silsilah tercatat selamanya.', icon: <IconInfinity size={32}/> },
  ];
  return (
    <section id="evolusi" className="panel panel-corners section reveal">
      <div className="section-head">
        <div className="section-title">SIKLUS EVOLUSI</div>
        <div style={{fontFamily:'var(--mono)', fontSize: 11, color:'var(--text-mute)', letterSpacing:'0.18em'}}>
          ∞ FEEDBACK LOOP
        </div>
      </div>
      <div className="siklus">
        {items.map((s, i) => (
          <div key={i} className="siklus-card">
            <div className="siklus-icon">{s.icon}</div>
            <div className="siklus-num">{s.num}</div>
            <div className="siklus-name">{s.name}</div>
            <div className="siklus-desc">{s.desc}</div>
          </div>
        ))}
      </div>
      <div className="siklus-foot">— UMPAN BALIK BERKELANJUTAN —</div>
    </section>
  );
};

const DesignSystem = () => (
  <section id="ds" className="panel panel-corners section">
    <div className="section-head">
      <div className="section-title">DESIGN SYSTEM</div>
      <div style={{fontFamily:'var(--mono)', fontSize: 11, color:'var(--text-mute)', letterSpacing:'0.18em'}}>
        TOKENS · COMPONENTS · MOTION
      </div>
    </div>
    <div className="ds-grid">
      <div className="ds-card">
        <div className="ds-label">WARNA</div>
        <div className="swatch-row">
          <div className="swatch o"/>
          <div className="swatch g"/>
          <div className="swatch k"/>
          <div className="swatch w"/>
        </div>
      </div>
      <div className="ds-card">
        <div className="ds-label">TIPOGRAFI</div>
        <div className="type-display">Orbitron</div>
        <div className="type-sub">Inter / JetBrains Mono</div>
      </div>
      <div className="ds-card">
        <div className="ds-label">IKONOGRAFI</div>
        <div className="icon-grid">
          <IconStar/><IconAtom/><IconCube/><IconHeart/>
          <IconRocket/><IconCircuit/><IconNetwork/><IconInfinity/>
        </div>
      </div>
      <div className="ds-card">
        <div className="ds-label">KOMPONEN</div>
        <div className="cmp-grid">
          <div className="cmp-bar b1"/>
          <div className="cmp-bar b2"/>
          <div className="cmp-bar b3"/>
          <div className="cmp-bar b4"/>
        </div>
      </div>
      <div className="ds-card">
        <div className="ds-label">EFEK VISUAL</div>
        <div className="fx-canvas"/>
      </div>
    </div>
  </section>
);

const Launch = () => (
  <section id="konsole" className="launch reveal">
    <div className="launch-bg"/>
    <div className="launch-fire"/>
    <div className="planet"/>
    <div className="rocket"/>
    <div className="launch-content">
      <div className="launch-pre">SIAPKAN DIRI UNTUK</div>
      <h2 className="launch-title">PELUNCURAN</h2>
      <div className="launch-sub">MASA DEPAN KECERDASAN</div>
      <p className="launch-body">Bersama MIGANCORE, lahirkan sistem yang bukan hanya cerdas, tetapi juga hidup, belajar, dan berevolusi.</p>
      <div className="launch-actions">
        <a className="btn btn-primary" href="#launch">LAUNCH NOW <IconArrowRight size={14}/></a>
        <a className="btn btn-ghost" href="#access">AKSES KONSOLE <IconArrowRight size={14}/></a>
      </div>
      <div className="launch-foot">— MISSION IS NOT THE END, IT'S THE BEGINNING —</div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="foot">
    <div className="brand" style={{opacity:0.9}}>
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" width="22" height="22">
          <rect x="2" y="2" width="28" height="28" rx="4" fill="none" stroke="#ff8a24" strokeWidth="1.5"/>
          <path d="M9 22 L9 10 L16 18 L23 10 L23 22" fill="none" stroke="#ff8a24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="16" cy="16" r="2" fill="#2fe39a"/>
        </svg>
      </span>
      <span style={{fontSize: 12}}>MIGANCORE</span>
      <span style={{fontFamily:'var(--mono)', fontSize: 11, color:'var(--text-mute)', marginLeft: 14}}>© 2026 MIGANCORE. ALL RIGHTS RESERVED.</span>
    </div>
    <div className="foot-links">
      <a href="#privasi">Kebijakan Privasi</a>
      <a href="#syarat">Syarat & Ketentuan</a>
      <a href="#docs">Dokumentasi</a>
      <a href="#status">Status</a>
    </div>
    <div className="foot-social">
      <a href="#in" aria-label="LinkedIn"><IconLinkedIn size={16}/></a>
      <a href="#x" aria-label="X"><IconTwitter size={16}/></a>
      <a href="#yt" aria-label="YouTube"><IconYouTube size={16}/></a>
      <a href="#dc" aria-label="Discord"><IconDiscord size={16}/></a>
    </div>
  </footer>
);

Object.assign(window, { NavBar, Hero, Proses, Produk, Arsitektur, Evolusi, DesignSystem, Launch, Footer });
