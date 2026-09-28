/* App entry */
const App = () => {
  const [booted, setBooted] = React.useState(false);
  useReveal();
  return (
    <>
      {!booted && <BootSequence onDone={() => setBooted(true)}/>}
      <div className="bg-stack"/>
      <ParallaxBg/>
      <FloatingParticles/>
      <div className="bg-grid"/>
      <div className="noise"/>
      <ScrollProgress/>
      <CustomCursor/>
      <HUD/>
      <SoundFab/>
      <KonsoleModal/>
      <div className="shell">
        <NavBar/>
        <Hero/>
        <Proses/>
        <Produk/>
        <Arsitektur/>
        <TerminalFeed/>
        <Evolusi/>
        <DesignSystem/>
        <Launch/>
        <Footer/>
      </div>
    </>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
