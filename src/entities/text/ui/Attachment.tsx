import { useEffect, useState } from "react";

/**
 * An image that lives in the backend rather than at a URL.
 *
 * It cannot be an `<img src>` pointing at the repository: a private one would
 * refuse the request and a sealed one would answer with noise. So the bytes
 * come through the same authenticated, decrypting path as the notes, and
 * become an object URL here.
 */
export function Attachment({ name, alt, resolve }: {
  name: string;
  alt: string;
  resolve: (name: string) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void resolve(name).then((found) => {
      if (cancelled) return;
      if (found) setUrl(found);
      else setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [name, resolve]);

  // Not there, or not reachable from this device: say so rather than leave a
  // broken image icon, which reads as a bug rather than as a missing file.
  if (missing) return <span className="attachment-missing">[첨부 없음: {alt || name}]</span>;
  if (!url) return <span className="attachment-loading">[{alt || name}]</span>;
  return <img className="inline-image" src={url} alt={alt} />;
}
