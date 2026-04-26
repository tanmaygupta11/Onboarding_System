import { useState } from 'react';

export default function DesignationsInput({ value, onChange }) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const v = input.trim();
    if (!v) return;
    const exists = value.some(x => x.toLowerCase() === v.toLowerCase());
    if (!exists) onChange([...value, v]);
    setInput('');
  };

  const removeTag = (tag) => {
    onChange(value.filter(t => t !== tag));
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !input && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 border border-slate-300 rounded-md px-2 py-2 bg-white focus-within:ring-2 focus-within:ring-indigo-300">
        {value.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-sm rounded px-2 py-0.5"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-indigo-500 hover:text-indigo-800"
              aria-label={`Remove ${tag}`}
            >
              x
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={addTag}
          placeholder={value.length ? 'Add another...' : 'Type a designation and press Enter'}
          className="flex-1 min-w-[8rem] text-sm outline-none py-0.5"
        />
      </div>
      <p className="text-xs text-slate-500 mt-1">Press Enter or comma to add.</p>
    </div>
  );
}
