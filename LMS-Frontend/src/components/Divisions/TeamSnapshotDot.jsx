// Оранжевая точка «есть расхождения с профилем команды»: заявка допущена, данные в ней
// зафиксированы, а в профиле команды они уже другие (snapshot_diff считает
// divisionController). Стоит в углу кнопки статуса выбранной команды — что именно
// разошлось, видно в окне статуса при выборе «Допущена», там же расхождения и
// принимаются галочками. Родитель должен быть relative.
export function TeamSnapshotDot({ diff }) {
  if (!Array.isArray(diff) || diff.length === 0) return null;
  return <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange ring-2 ring-white pointer-events-none" />;
}
