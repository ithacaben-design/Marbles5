import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MarbleState } from '../types';

interface MarbleOverlayProps {
  selectedMarble: MarbleState | null;
  onClose: () => void;
  onAnswer: (answer: string) => void;
}

export const MarbleOverlay: React.FC<MarbleOverlayProps> = ({ selectedMarble, onClose, onAnswer }) => {
  const [input, setInput] = useState('');

  if (!selectedMarble) return null;

  const getQuestionText = () => {
    switch (selectedMarble.status) {
      case 'locked':
        return selectedMarble.flavorText.q1;
      case 'colored':
        return selectedMarble.flavorText.q2;
      case 'named':
        return selectedMarble.flavorText.q3.replace('[color]', selectedMarble.color || '');
      default:
        return '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onAnswer(input.trim());
      setInput('');
    }
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      >
        <div className="w-full max-w-md p-8 pointer-events-auto">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl text-center"
          >
            <p className="text-white/80 text-lg font-serif italic mb-6 leading-relaxed">
              {getQuestionText()}
            </p>
            
            <form onSubmit={handleSubmit}>
              <input
                autoFocus
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full bg-transparent border-b border-white/30 text-white text-2xl text-center py-2 focus:outline-none focus:border-white transition-colors font-serif"
                placeholder="..."
              />
              <button type="submit" className="hidden" />
            </form>

            <button 
              onClick={onClose}
              className="mt-8 text-white/40 text-xs uppercase tracking-widest hover:text-white/60 transition-colors"
            >
              Close
            </button>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
