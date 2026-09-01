import { useState } from 'react';
import Game from './game';
import PinGate from './pin-gate';
import { isUnlocked } from './access';

export default function App() {
  const [unlocked, setUnlocked] = useState(isUnlocked);
  return unlocked ? <Game /> : <PinGate onUnlock={() => setUnlocked(true)} />;
}
