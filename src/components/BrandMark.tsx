import { GraduationCap } from 'lucide-react';

interface BrandMarkProps {
  logo?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function BrandMark({ logo, size = 'md' }: BrandMarkProps) {
  const sizeClass =
    size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-14 w-14' : 'h-11 w-11';
  const iconClass =
    size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-7 w-7' : 'h-5 w-5';

  if (logo) {
    return (
      <div
        className={`${sizeClass} shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800`}
      >
        <img
          src={logo}
          alt="Logo instansi"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain p-1"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} grid shrink-0 place-items-center rounded-lg bg-[#1E3A8A] text-white dark:bg-blue-600`}
      aria-hidden="true"
    >
      <GraduationCap className={iconClass} />
    </div>
  );
}
