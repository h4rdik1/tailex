import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The heading of the current step. When the step changes, focus moves here so keyboard and
 * screen-reader users land at the top of the new content instead of staying on an old button.
 * tabIndex={-1} lets code focus it without adding it to the Tab order.
 */
export function StepHeading({
  id,
  focusOnMount,
  children,
}: {
  id: string;
  focusOnMount: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  return (
    <h1 id={id} ref={ref} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
      {children}
    </h1>
  );
}
