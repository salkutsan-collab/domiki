
import { FormEvent, useState } from 'react';
import { KeyRound, LockKeyhole, Sparkles } from 'lucide-react';
import { checkPin } from './access';

export default function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const unlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pin.length !== 4) {
      setError('Введи четыре цифры');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (await checkPin(pin)) {
        onUnlock();
        return;
      }
      setError('Не открылось. Проверь цифры и попробуй ещё раз');
      setPin('');
    } catch {
      setError('Что-то пошло не так. Попробуй ещё раз через минутку');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="pin-shell">
      <section className="pin-card" aria-labelledby="pin-title">
        <div className="pin-logo" aria-hidden="true"><LockKeyhole size={34} /></div>
        <p className="pin-eyebrow"><Sparkles size={14} /> Секретная дверь</p>
        <h1 id="pin-title">Вход в «Домики»</h1>
        <p className="pin-copy">Введи семейный PIN, чтобы попасть на строительную полянку.</p>
        <form onSubmit={unlock} className={error ? 'pin-form has-error' : 'pin-form'}>
          <label htmlFor="game-pin">Четыре цифры</label>
          <input
            id="game-pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            aria-describedby="pin-message"
            autoFocus
          />
          <p id="pin-message" className="pin-message" aria-live="polite">{error || 'PIN спроси у взрослого'}</p>
          <button type="submit" disabled={loading || pin.length !== 4}>
            <KeyRound size={21} /> {loading ? 'Открываю…' : 'Открыть игру'}
          </button>
        </form>
        <p className="pin-safe">Ничего устанавливать не нужно - игра работает в браузере</p>
      </section>
    </main>
  );
}
