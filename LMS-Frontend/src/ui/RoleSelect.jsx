import React from 'react';

export function RoleSelect({ options, value = [], onChange }) {
  const toggleRole = (roleValue) => {
    if (value.includes(roleValue)) {
      onChange(value.filter(v => v !== roleValue));
    } else {
      onChange([...value, roleValue]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 font-sans">
      {options.map((opt) => {
        const isSelected = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            onClick={() => toggleRole(opt.value)}
            type="button"
            className={`px-3 py-1.5 rounded-md text-[12px] font-bold border transition-all duration-200 cursor-pointer ${
              isSelected 
                ? 'bg-status-pending/80 border-status-pending/80 text-white shadow-md shadow-status-pending/50' 
                : 'bg-white/50 border-graphite/20 text-graphite-light hover:border-status-pending/30 hover:bg-status-pending/5'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}