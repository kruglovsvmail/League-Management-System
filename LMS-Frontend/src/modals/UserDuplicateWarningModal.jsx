import React from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { UserMatchCard } from '../components/Registry/UserMatchCard';

// Показывается перед созданием НОВОГО пользователя вручную, если в базе уже
// есть кто-то с такой же Фамилией+Именем. Не блокирует — база разрешает
// полных тёзок — просто даёт админу шанс убедиться, что это не дубль.
export function UserDuplicateWarningModal({ isOpen, onClose, newUser, matches, onConfirm, isSaving }) {
  const fio = [newUser?.last_name, newUser?.first_name, newUser?.middle_name].filter(Boolean).join(' ');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Похожий пользователь уже есть" size="medium">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-graphite-light">
          В базе уже {matches.length > 1 ? `есть ${matches.length} пользователя(ей)` : 'есть пользователь'} с именем «{fio}». Это тот же человек, или новый?
        </p>

        <div className="flex flex-col gap-2">
          {matches.map(m => <UserMatchCard key={m.id} user={m} />)}
        </div>

        <div className="flex gap-3 pt-3 border-t border-graphite/10">
          <Button type="button" onClick={onClose} disabled={isSaving} className="flex-1 bg-graphite/10 text-graphite hover:bg-graphite/20">
            Отмена
          </Button>
          <Button type="button" onClick={onConfirm} isLoading={isSaving} className="flex-1 bg-status-accepted text-white">
            Это новый человек — добавить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
