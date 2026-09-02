import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Person } from './world';
import { MAX_NAME } from './world';

export type NameDialogProps = {
  person: Person;
  onSave: (name: string) => void;
  onCancel: () => void;
};

export default function NameDialog({ person, onSave, onCancel }: NameDialogProps) {
  const [name, setName] = useState(person.name);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(person.name);
    input.current?.focus();
    input.current?.select();
  }, [person]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="name-veil" role="dialog" aria-modal="true" aria-label="Имя жителя">
      <form
        className="name-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name);
        }}
      >
        <span className="name-badge" style={{ background: person.color }} aria-hidden="true" />
        <label htmlFor="person-name">Как зовут жителя?</label>
        <input
          id="person-name"
          ref={input}
          value={name}
          maxLength={MAX_NAME}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
          placeholder="Например: Маша"
        />
        <div className="name-buttons">
          <button type="submit" className="primary-action">
            <Check size={18} /> Готово
          </button>
          <button type="button" className="secondary-action" onClick={onCancel}>
            <X size={18} /> Отмена
          </button>
        </div>
      </form>
    </div>
  );
}
