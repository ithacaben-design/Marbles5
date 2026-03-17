import React, { useState, useEffect, useRef } from 'react';
import { Box } from './components/Box';
import { MarbleScene } from './components/MarbleScene';
import { MarbleOverlay } from './components/MarbleOverlay';
import { useMarbleState } from './hooks/useMarbleState';
import { BoxMaterial, GameMode } from './types';
import { motion, AnimatePresence } from 'motion/react';

const App: React.FC = () => {
  const { 
    marbles, 
    selectedMarbleId, 
    setSelectedMarbleId, 
    unlockColor, 
    unlockName, 
    unlockIdentity,
    updateMarble,
    resetMarbles,
    gameMode,
    setGameMode,
    unlockedModes
  } = useMarbleState();

  const [boxMaterial, setBoxMaterial] = useState<BoxMaterial>('tufted');
  const [resonance, setResonance] = useState(0);

  // Pinball Controls State
  const [flipperLeft, setFlipperLeft] = useState(false);
  const [flipperRight, setFlipperRight] = useState(false);
  const [plungerCharge, setPlungerCharge] = useState(0);
  const [plungerRelease, setPlungerRelease] = useState({ timestamp: 0, charge: 0 });
  const plungerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startPlungerCharge = () => {
    if (plungerIntervalRef.current) return;
    plungerIntervalRef.current = setInterval(() => {
      setPlungerCharge(prev => Math.min(prev + 2, 100));
    }, 30);
  };

  const stopPlungerCharge = () => {
    if (plungerIntervalRef.current) {
      clearInterval(plungerIntervalRef.current);
      plungerIntervalRef.current = null;
    }
    setPlungerRelease({ timestamp: Date.now(), charge: plungerCharge });
    setPlungerCharge(0);
  };

  // Calculate Resonance
  useEffect(() => {
    const total = marbles.reduce((acc, m) => acc + m.fillLevel, 0);
    setResonance(total / marbles.length);
  }, [marbles]);

  const handleMarbleAnswer = (answer: string) => {
    if (selectedMarbleId === null) return;
    
    const marble = marbles.find(m => m.id === selectedMarbleId);
    if (!marble) return;

    if (marble.status === 'frosted') {
      unlockColor(selectedMarbleId, answer);
    } else if (marble.status === 'colored') {
      unlockName(selectedMarbleId, answer);
    } else if (marble.status === 'named') {
      unlockIdentity(selectedMarbleId, answer);
      setSelectedMarbleId(null);
    }
  };

  const selectedMarble = selectedMarbleId !== null ? marbles.find(m => m.id === selectedMarbleId) || null : null;

  return (
    <main className="w-full h-screen bg-[#f5f5f5] overflow-hidden select-none touch-none">
      <Box 
        material={boxMaterial} 
        onMaterialChange={setBoxMaterial}
        gameMode={gameMode}
        onHome={() => setGameMode('home')}
        onReset={resetMarbles}
        onModeChange={setGameMode}
        unlockedModes={unlockedModes}
        onFlipperLeft={setFlipperLeft}
        onFlipperRight={setFlipperRight}
        onPlungerCharge={setPlungerCharge}
        onPlungerRelease={stopPlungerCharge}
      >
        <div className="w-full h-full">
          <MarbleScene 
            marbles={marbles} 
            onMarbleClick={(id) => setSelectedMarbleId(id)}
            gameMode={gameMode}
            material={boxMaterial}
            isFidgetMode={gameMode === 'home'}
            canSpin={true}
            flipperLeft={flipperLeft}
            flipperRight={flipperRight}
            plungerCharge={plungerCharge}
            plungerRelease={plungerRelease}
            updateMarble={updateMarble}
          />
        </div>
      </Box>

      {/* Reconciled Edge UI */}
      <div className="absolute inset-0 flex flex-col justify-between p-10 pointer-events-none z-[500]">
        <div className="flex justify-between items-start w-full">
          <div className="flex gap-4">
            <EdgeButton label="Reconcile" onClick={() => window.location.reload()} />
            <EdgeButton label="Reset" onClick={resetMarbles} />
          </div>
          <div className="flex flex-col items-end gap-2 text-black/40 uppercase text-[9px] tracking-widest font-bold">
            <span>Resonance: {Math.round(resonance)}%</span>
            <div className="w-40 h-[2px] bg-black/5">
              <div 
                className="h-full bg-black/80 transition-all duration-700" 
                style={{ width: `${resonance}%` }} 
              />
            </div>
          </div>
          <EdgeButton label="Portal" active={gameMode === 'home'} onClick={() => setGameMode('home')} />
        </div>
        
        <div className="flex justify-center gap-4 w-full pb-4 pointer-events-none">
          {['orbit', 'koi', 'billiard', 'pinball', 'mood'].map(m => {
            const isUnlocked = unlockedModes.includes(m as GameMode);
            if (!isUnlocked) return null;
            return (
              <EdgeButton 
                key={m} 
                label={m === 'koi' ? 'pool' : m} 
                active={gameMode === m} 
                onClick={() => setGameMode(m as GameMode)} 
                onMouseDown={() => {
                  if (m === 'pinball' || m === 'billiard') setFlipperRight(true);
                  if (m === 'orbit' || m === 'koi') setFlipperLeft(true);
                }}
                onMouseUp={() => {
                  setFlipperLeft(false);
                  setFlipperRight(false);
                }}
              />
            );
          })}
          {gameMode === 'pinball' && (
            <EdgeButton 
              label="Launch" 
              active={plungerCharge > 0} 
              onClick={() => {}} 
              onMouseDown={startPlungerCharge}
              onMouseUp={stopPlungerCharge}
              style={{
                boxShadow: plungerCharge > 0 ? `0 0 ${plungerCharge / 5}px rgba(255, 255, 255, ${plungerCharge / 100})` : 'none',
                borderColor: plungerCharge > 0 ? `rgba(0, 0, 0, ${0.1 + plungerCharge / 100})` : 'rgba(0, 0, 0, 0.1)'
              }}
            />
          )}
        </div>
      </div>

      <AnimatePresence>
        {gameMode === 'home' && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10"
          >
            <h1 className="font-['Playfair_Display'] text-[12vw] italic text-black/[0.04] uppercase leading-none">Manifest</h1>
            <p className="text-black/30 tracking-[1.2em] text-[9px] uppercase mt-4">Artifact Resonance Engine</p>
          </motion.div>
        )}
      </AnimatePresence>

      <MarbleOverlay 
        selectedMarble={selectedMarble}
        onClose={() => setSelectedMarbleId(null)}
        onAnswer={handleMarbleAnswer}
      />

      <BackendLayer marbles={marbles} updateMarble={updateMarble} />
    </main>
  );
};

const EdgeButton: React.FC<{ 
  label: string; 
  active?: boolean; 
  onClick: () => void;
  onMouseDown?: () => void;
  onMouseUp?: () => void;
  style?: React.CSSProperties;
}> = ({ label, active, onClick, onMouseDown, onMouseUp, style }) => (
  <button
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
    onMouseDown={(e) => { e.preventDefault(); onMouseDown?.(); }}
    onMouseUp={(e) => { e.preventDefault(); onMouseUp?.(); }}
    onMouseLeave={(e) => { e.preventDefault(); onMouseUp?.(); }}
    onTouchStart={(e) => { e.preventDefault(); onMouseDown?.(); }}
    onTouchEnd={(e) => { e.preventDefault(); onMouseUp?.(); }}
    style={style}
    className={`pointer-events-auto cursor-pointer px-6 py-2 uppercase tracking-[0.2em] text-[10px] font-bold border transition-all duration-300 backdrop-blur-xl relative z-[1000] ${active ? 'bg-black text-white border-black' : 'bg-white/40 text-black/70 border-black/10 hover:border-black/40'}`}
  >
    {label}
  </button>
);

// Invisible Backend Layer
const BackendLayer: React.FC<{ marbles: any[]; updateMarble: (id: number, updates: any) => void }> = ({ marbles, updateMarble }) => {
  useEffect(() => {
    // This layer is built but never surfaced in the UI.
    // It connects to phone data: contacts, calendar, health/steps, email.
    console.log('Backend Layer Active: Monitoring marble resonance...');
    
    const checkResonance = async () => {
      // Gathering data silently as requested
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(() => {});
      }

      // Simulate data influence
      marbles.forEach(m => {
        const pulseRate = Math.floor(Math.random() * 5) + 1; // Simulated contacts count influence
        const isBlinking = Math.random() > 0.9; // Simulated email arrival
        updateMarble(m.id, { pulseRate, isBlinking });
      });
    };

    const interval = setInterval(checkResonance, 10000);
    return () => clearInterval(interval);
  }, [marbles, updateMarble]);

  return null;
};

export default App;
