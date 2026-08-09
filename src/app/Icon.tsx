/**
 * The handful of icons the chrome needs, drawn here.
 *
 * They were emoji before — and an emoji renders from the colour-emoji font, at
 * a different weight and optical size than every glyph beside it, so the 🔍 in
 * the toolbar was the only saturated thing above the fold. Four paths cost
 * nothing and an icon package costs a dependency.
 */
const PATHS: Record<string, JSX.Element> = {
  menu: <path d="M3 6h14M3 10h14M3 14h14" />,
  search: (
    <>
      <circle cx="9" cy="9" r="5.2" />
      <path d="M12.8 12.8 17 17" />
    </>
  ),
  command: <path d="M7.6 7.6h4.8v4.8H7.6zM7.6 7.6V6a1.8 1.8 0 1 0-1.8 1.8h1.8m4.8 0V6a1.8 1.8 0 1 1 1.8 1.8h-1.8m-4.8 4.8V14a1.8 1.8 0 1 1-1.8-1.8h1.8m4.8 0V14a1.8 1.8 0 1 0 1.8-1.8h-1.8" />,
  more: (
    <>
      <circle cx="4.6" cy="10" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="10" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),
  folder: <path d="M3 6.2A1.2 1.2 0 0 1 4.2 5h3.1l1.4 1.7h7.1A1.2 1.2 0 0 1 17 7.9v6.9A1.2 1.2 0 0 1 15.8 16H4.2A1.2 1.2 0 0 1 3 14.8z" />,
  plus: <path d="M10 4.8v10.4M4.8 10h10.4" />
};

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className="ico" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
