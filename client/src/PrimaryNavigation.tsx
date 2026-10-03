import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export type PrimaryNavigationItem = {
  label: string;
  active: boolean;
  onNavigate: () => void;
};

type PrimaryNavigationProps = {
  items: PrimaryNavigationItem[];
  /** Changes only after navigation has actually been accepted by the workspace. */
  route: string;
  disabled?: boolean;
};

/**
 * A responsive disclosure for ordinary page navigation. It intentionally uses
 * native buttons and a normal nav landmark rather than menu widget semantics.
 */
export default function PrimaryNavigation({ items, route, disabled = false }: PrimaryNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const navigationId = useId();

  // A successful in-app navigation updates route. Do not close on an attempted
  // navigation, because the requester workspace may first open its discard dialog.
  useEffect(() => {
    if (navRef.current?.contains(document.activeElement) && toggleRef.current?.getClientRects().length) {
      toggleRef.current.focus();
    }
    setIsOpen(false);
  }, [route]);

  function closeAndRestoreToggleFocus() {
    setIsOpen(false);
    toggleRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || !isOpen) return;
    event.preventDefault();
    event.stopPropagation();
    closeAndRestoreToggleFocus();
  }

  return (
    <div className="primary-navigation" onKeyDown={handleKeyDown}>
      <button
        ref={toggleRef}
        type="button"
        className="mobile-nav-toggle"
        aria-label="Navigation"
        aria-expanded={isOpen}
        aria-controls={navigationId}
        onClick={() => setIsOpen((open) => !open)}
      >
        Navigation
      </button>
      <nav ref={navRef} id={navigationId} className={isOpen ? "primary-navigation-links is-open" : "primary-navigation-links"} aria-label="Primary navigation">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={item.active ? "nav-link active" : "nav-link"}
            aria-current={item.active ? "page" : undefined}
            disabled={disabled}
            onClick={item.onNavigate}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
