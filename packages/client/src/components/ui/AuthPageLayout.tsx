import type { ReactNode } from 'react';

interface AuthPageLayoutProps {
  title: ReactNode;
  children: ReactNode;
  /** Outer container classes; override to adjust background or padding if needed. */
  containerClassName?: string;
  /** Inner wrapper width/max-width classes. */
  bodyClassName?: string;
  /** Heading typography and spacing classes. */
  titleClassName?: string;
}

export function AuthPageLayout({
  title,
  children,
  containerClassName = 'min-h-screen bg-bg-primary flex items-center justify-center px-4',
  bodyClassName = 'w-full max-w-sm',
  titleClassName = 'font-display text-3xl text-heading mb-8 text-center',
}: AuthPageLayoutProps) {
  return (
    <div className={containerClassName}>
      <div className={bodyClassName}>
        <h1 className={titleClassName}>{title}</h1>
        {children}
      </div>
    </div>
  );
}

