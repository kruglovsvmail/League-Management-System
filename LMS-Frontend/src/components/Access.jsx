// HockeyEco/src/components/Access.jsx
import React from 'react';
import { useAccess } from '../hooks/useAccess';

export function Access({ action, gameStaff = [], children, fallback = null }) {
  const { checkAccess } = useAccess();
  
  // Передаем контекст матча (gameStaff), если он есть
  if (!checkAccess(action, { gameStaff })) {
    // Если прав нет, возвращаем fallback (это может быть null, 
    // либо наш компонент <AccessFallback />, который мы сделали ранее)
    return fallback; 
  }
  
  return children;
}