import React, { useState, useRef } from 'react';
import { BoxMaterial, GameMode } from '../types';
import { BOX_MATERIALS } from '../constants';
import { motion, AnimatePresence } from 'motion/react';

interface BoxProps {
  children: React.ReactNode;
  material: BoxMaterial;
  onMaterialChange: (material: BoxMaterial) => void;
  gameMode: GameMode;
  onHome: () => void;
  onReset: () => void;
  onModeChange: (mode: GameMode) => void;
  unlockedModes: GameMode[];
  onFlipperLeft?: (active: boolean) => void;
  onFlipperRight?: (active: boolean) => void;
  onPlungerCharge?: (charge: number) => void;
  onPlungerRelease?: () => void;
}

export const Box: React.FC<BoxProps> = ({ 
  children, 
  material, 
  onMaterialChange, 
  gameMode,
  onHome,
  onReset,
  onModeChange,
  unlockedModes,
  onFlipperLeft,
  onFlipperRight,
  onPlungerCharge,
  onPlungerRelease
}) => {
  const [isCustomizing, setIsCustomizing] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleMouseDown = () => {
    pressTimer.current = setTimeout(() => {
      setIsCustomizing(true);
    }, 1000); // 1 second long press
  };

  const handleMouseUp = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
    }
  };

  const currentMaterial = BOX_MATERIALS[material];

  return (
    <div 
      className="relative w-full h-screen overflow-hidden flex items-center justify-center"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
    >
      {/* Content (Marbles & Three.js Scene) */}
      <div className="absolute inset-0 z-10">
        {children}
      </div>

      {/* Customization Menu (Discovered organically) */}
      {isCustomizing && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setIsCustomizing(false)}
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-8 bg-white/10 rounded-3xl border border-white/20" onClick={e => e.stopPropagation()}>
            {(Object.keys(BOX_MATERIALS) as BoxMaterial[]).map((mat) => (
              <button
                key={mat}
                onClick={() => {
                  onMaterialChange(mat);
                  setIsCustomizing(false);
                }}
                className={`p-4 rounded-xl transition-all ${material === mat ? 'ring-2 ring-white scale-105' : 'hover:scale-105 opacity-70 hover:opacity-100'}`}
              >
                <div 
                  className={`w-16 h-16 rounded-lg mb-2 mx-auto ${BOX_MATERIALS[mat].class}`}
                  style={BOX_MATERIALS[mat].style}
                />
                <span className="text-white text-xs uppercase tracking-widest">{BOX_MATERIALS[mat].name}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};
