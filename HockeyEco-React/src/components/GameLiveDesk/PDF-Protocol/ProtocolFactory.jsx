// src/components/GameLiveDesk/PDF-Protocol/ProtocolFactory.jsx
import React from 'react';
import { DefaultProtocol } from "./templates/defaultProtocol.jsx"; 

// 1. ДОБАВЛЕНО { eager: true }
// Теперь Vite загружает файлы сразу, а не асинхронно. react-pdf это переварит.
const templateFiles = import.meta.glob('./templates/Protocol-*.jsx', { eager: true });

const CustomProtocolsMap = {};

for (const path in templateFiles) {
  const match = path.match(/Protocol-(\d+)\.jsx$/);
  if (match) {
    const id = match[1];
    const module = templateFiles[path];
    
    // Берем компонент (поддерживает как export default, так и export const Protocol2)
    const Component = module.default || Object.values(module)[0];
    CustomProtocolsMap[id] = Component;
  }
}

/**
 * Фабрика протоколов.
 */
export const ProtocolFactory = ({ leagueId, data }) => {
  const currentId = leagueId || data?.league_id || data?.info?.leagueId;

  // Ищем компонент в реестре (String страхует от того, если ID прилетит числом)
  const CustomTemplate = currentId ? CustomProtocolsMap[String(currentId)] : null;

  if (!CustomTemplate) {
    return <DefaultProtocol data={data} />;
  }

  // Больше никакого Suspense! Рендерим компонент напрямую.
  return <CustomTemplate data={data} />;
};