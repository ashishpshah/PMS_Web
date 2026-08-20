interface Props {
  names: string[];
}

export function TypingIndicator({ names }: Props) {
  if (!names.length) return null;

  const label = names.length === 1
    ? `${names[0]} is typing`
    : names.length === 2
    ? `${names[0]} and ${names[1]} are typing`
    : `${names[0]} and ${names.length - 1} others are typing`;

  return (
    <div className="flex items-center gap-2 px-4 py-1 text-xs text-gray-400 dark:text-gray-500">
      <span className="flex gap-0.5">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
      <span>{label}…</span>
    </div>
  );
}
