import DOMPurify from 'dompurify';

/** Formatting only. No links, images, styles, scripts or attributes of any kind. */
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h3', 'h4', 'h5', 'span',
];

/** Description text from an imported sheet. It is HTML from outside the app, so it is sanitised. */
export function sanitiseDescription(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false });
}

export function Description({ html }: { html: string }) {
  const clean = sanitiseDescription(html);
  // Nothing readable left, such as only a script or an empty paragraph.
  if (clean.replace(/<[^>]*>/g, '').trim() === '') {
    return <p className="text-sm text-slate-600">No description on the sheet.</p>;
  }
  return <div className="description text-sm text-slate-800" dangerouslySetInnerHTML={{ __html: clean }} />;
}
