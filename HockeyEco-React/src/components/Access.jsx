import { useAccess } from '../hooks/useAccess';

export function Access({ action, children, fallback = null }) {
  const { checkAccess } = useAccess();
  
  if (!checkAccess(action)) {
    return fallback; // Если прав нет, показываем пустоту (или fallback, например, текст "Нет доступа")
  }
  
  return children;
}