interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md';
}

// Fixed palette of warm tones for initials backgrounds (deterministic by name)
const AVATAR_COLORS = [
  'bg-[#c87941] text-white',
  'bg-[#7a6b52] text-white',
  'bg-[#5a7a52] text-white',
  'bg-[#9b5a3f] text-white',
  'bg-[#6b5a7a] text-white',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? '';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? '';
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}

function getColorClass(name: string): string {
  const index = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index] ?? AVATAR_COLORS[0] ?? '';
}

export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-12 h-12 text-sm';

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
      />
    );
  }

  const initials = getInitials(name);
  const colorClass = getColorClass(name);

  return (
    <div
      role="img"
      aria-label={name}
      className={`${sizeClass} ${colorClass} rounded-full flex items-center justify-center font-ui font-semibold shrink-0`}
    >
      {initials}
    </div>
  );
}
