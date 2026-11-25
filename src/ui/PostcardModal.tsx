import React, { useEffect, useRef, useState } from 'react';
import { Button, Popup } from 'pixel-retroui';
import './postcardModal.css';

export interface GeneratePostcardOptions {
  canvas: HTMLCanvasElement;
  placeName: string;
  timeStr: string;
  skyStr: string;
  festName?: string;
}

export interface PostcardData {
  url: string;
  caption: string;
  canvas: HTMLCanvasElement;
}

export interface PostcardModalProps {
  postcard: { url: string; caption: string; canvas?: HTMLCanvasElement } | null;
  onClose: () => void;
  onSave?: () => void;
  onShare?: () => Promise<string>;
}

const PANEL = '#1b1626';
const PANEL_ALT = '#28213a';
const BORDER = '#5a4d7a';
const CREAM = '#f7efe0';
const MARIGOLD = '#f0a030';
const MARIGOLD_INK = '#1b1626';
const NO_SHADOW = 'transparent';

const PIXEL_FONT =
  'Silkscreen, "Noto Sans Telugu", "Telugu Sangam MN", "Noto Sans Devanagari", "Kohinoor Devanagari", ui-monospace, monospace';
const INDIC_FONT =
  '"Noto Sans Telugu", "Telugu Sangam MN", "Kohinoor Telugu", "Noto Sans Devanagari", "Kohinoor Devanagari", "Devanagari Sangam MN", "Nirmala UI", "Mangal", system-ui, sans-serif';

function measureWidth(ctx: CanvasRenderingContext2D, text: string): number {
  return typeof ctx.measureText === 'function' ? ctx.measureText(text).width : text.length * 10;
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (measureWidth(ctx, text) <= maxWidth) return text;
  const suffix = '...';
  let end = text.length;
  while (end > 1 && measureWidth(ctx, text.slice(0, end).trimEnd() + suffix) > maxWidth) {
    end--;
  }
  return text.slice(0, Math.max(1, end)).trimEnd() + suffix;
}

function wrapCaptionLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2,
): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (measureWidth(ctx, clean) <= maxWidth) return [clean];

  const segments = clean.split(' · ');
  const lines: string[] = [];
  let current = '';

  const pushWord = (word: string, sep: string) => {
    const candidate = current ? `${current}${sep}${word}` : word;
    if (measureWidth(ctx, candidate) <= maxWidth) {
      current = candidate;
      return;
    }
    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(truncateToWidth(ctx, word, maxWidth));
      current = '';
    }
  };

  if (segments.length > 1) {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!current && measureWidth(ctx, seg) > maxWidth) {
        for (const w of seg.split(/\s+/)) pushWord(w, ' ');
      } else {
        pushWord(seg, ' · ');
      }
      if (lines.length >= maxLines) break;
    }
  } else {
    for (const w of clean.split(/\s+/)) {
      pushWord(w, ' ');
      if (lines.length >= maxLines) break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  } else if (current && lines.length === maxLines) {
    const lastIdx = lines.length - 1;
    lines[lastIdx] = truncateToWidth(ctx, `${lines[lastIdx]} · ${current}`, maxWidth);
  }

  return lines.slice(0, maxLines).map((line) => truncateToWidth(ctx, line, maxWidth));
}

function drawCharminarStamp(g: CanvasRenderingContext2D, sx: number, sy: number) {
  g.fillStyle = '#f6ecd2';
  g.fillRect(sx, sy, 116, 132);
  g.strokeStyle = '#2a1f3a';
  g.lineWidth = 2;
  g.strokeRect(sx + 1, sy + 1, 114, 130);

  g.setLineDash([6, 5]);
  g.strokeStyle = '#d8433b';
  g.lineWidth = 3;
  g.strokeRect(sx + 7, sy + 7, 102, 118);
  g.setLineDash([]);

  const px = 4;
  const gold = '#e8a02a';
  const dark = '#2a1f3a';
  const rect = (a: number, b: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(sx + 18 + a * px, sy + 18 + b * px, w * px, h * px);
  };
  rect(0, 3, 3, 17, gold);
  rect(17, 3, 3, 17, gold);
  rect(0, 1, 3, 2, gold);
  rect(17, 1, 3, 2, gold);
  rect(3, 9, 14, 11, gold);
  rect(4, 6, 12, 3, gold);
  rect(8, 4, 4, 2, gold);
  rect(7, 13, 6, 7, dark);
  rect(8, 12, 4, 1, dark);

  g.fillStyle = '#d8433b';
  g.font = `700 14px ${PIXEL_FONT}`;
  g.textAlign = 'center';
  g.fillText('HYD', sx + 58, sy + 116);
}

/**
 * Renders a crisp 1200px-wide pixel-art postcard from the current city canvas.
 * Text widths are measured dynamically so long captions wrap or truncate gracefully
 * without ever overlapping the right-aligned Telugu/Devanagari label or host text.
 */
export function generatePostcard(opts: GeneratePostcardOptions): PostcardData {
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      if (!document.fonts.check('700 16px Silkscreen')) {
        void document.fonts.load('700 16px Silkscreen');
        void document.fonts.load('400 16px Silkscreen');
      }
    } catch {
      // Ignore font API quirks in non-browser environments
    }
  }

  const place = (opts.placeName || 'Hyderabad').trim() || 'Hyderabad';
  const time = (opts.timeStr || '').trim();
  const sky = (opts.skyStr || '').trim();
  const fest = opts.festName?.trim();
  const caption = [place, time, sky, fest].filter(Boolean).join(' · ');

  const src = opts.canvas;
  const srcW = src?.width ?? 0;
  const srcH = src?.height ?? 0;

  const W = 1200;
  const frame = 36;
  const band = 164;
  const iw = W - frame * 2;
  const rawAr = srcW > 0 && srcH > 0 ? srcH / srcW : 0.5625;
  const clampedAr = Math.min(0.68, Math.max(0.42, rawAr));
  const ih = Math.round(iw * clampedAr);
  const H = frame + ih + band;

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;

  // Cream postcard paper with crisp edge and subtle bottom deckle shadow
  g.fillStyle = '#f6ecd2';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#eadbb8';
  g.fillRect(0, H - 8, W, 8);
  g.strokeStyle = '#d8c7a0';
  g.lineWidth = 2;
  g.strokeRect(1, 1, W - 2, H - 2);

  // Photo viewport backing
  g.fillStyle = '#182026';
  g.fillRect(frame, frame, iw, ih);

  if (srcW > 0 && srcH > 0) {
    const destAr = ih / iw;
    let sx = 0;
    let sy = 0;
    let sw = srcW;
    let sh = srcH;
    if (rawAr >= destAr) {
      sh = Math.min(srcH, Math.max(1, Math.round(srcW * destAr)));
      sy = Math.max(0, Math.round((srcH - sh) / 2));
    } else {
      sw = Math.min(srcW, Math.max(1, Math.round(srcH / destAr)));
      sx = Math.max(0, Math.round((srcW - sw) / 2));
    }
    g.imageSmoothingEnabled = false;
    g.drawImage(src, sx, sy, sw, sh, frame, frame, iw, ih);
  } else {
    g.fillStyle = '#28213a';
    g.fillRect(frame, frame, iw, Math.round(ih * 0.65));
    g.fillStyle = '#f0a030';
    g.fillRect(frame + 84, frame + 72, 44, 44);
  }

  g.strokeStyle = '#2a1f3a';
  g.lineWidth = 4;
  g.strokeRect(frame - 2, frame - 2, iw + 4, ih + 4);

  // Stamp in top-right photo corner
  drawCharminarStamp(g, W - frame - 132, frame + 16);

  // Footer typography (measured to prevent collisions)
  const bandTop = frame + ih;
  const rightX = W - frame;
  const nativeTitle = 'హైదరాబాద్ / हैदराबाद';
  const hostText = (typeof location !== 'undefined' && location.host ? location.host : 'hyderabad days').slice(0, 32);

  g.textBaseline = 'alphabetic';
  g.textAlign = 'right';
  g.fillStyle = '#7a6a8a';
  g.font = `600 22px ${INDIC_FONT}`;
  const nativeW = measureWidth(g, nativeTitle);
  g.fillText(nativeTitle, rightX, bandTop + 58);

  g.font = `400 13px ${PIXEL_FONT}`;
  const hostW = measureWidth(g, hostText);
  g.fillText(hostText, rightX, bandTop + 98);

  const rightColW = Math.max(nativeW, hostW);
  const leftMaxW = Math.max(320, iw - rightColW - 36);

  // Headline auto-fit
  const headline = 'GREETINGS FROM HYDERABAD';
  let titleSize = 32;
  while (titleSize > 20) {
    g.font = `700 ${titleSize}px ${PIXEL_FONT}`;
    if (measureWidth(g, headline) <= leftMaxW) break;
    titleSize -= 2;
  }
  g.textAlign = 'left';
  g.fillStyle = '#2a1f3a';
  g.font = `700 ${titleSize}px ${PIXEL_FONT}`;
  g.fillText(truncateToWidth(g, headline, leftMaxW), frame, bandTop + 58);

  // Wrapped / truncated caption
  g.fillStyle = '#1f8a8a';
  g.font = `400 17px ${PIXEL_FONT}`;
  const lines = wrapCaptionLines(g, caption.toUpperCase(), leftMaxW, 2);
  lines.forEach((line, idx) => {
    g.fillText(line, frame, bandTop + 98 + idx * 26);
  });

  return {
    url: c.toDataURL('image/png'),
    caption,
    canvas: c,
  };
}

async function getPostcardBlob(postcard: { url: string; canvas?: HTMLCanvasElement }): Promise<Blob | null> {
  if (postcard.canvas) {
    const canvasBlob = await new Promise<Blob | null>((resolve) => {
      try {
        postcard.canvas!.toBlob((b) => resolve(b), 'image/png');
      } catch {
        resolve(null);
      }
    });
    if (canvasBlob) return canvasBlob;
  }
  if (!postcard.url) return null;
  try {
    const res = await fetch(postcard.url);
    if (res.ok) return await res.blob();
  } catch {
    // Fallback to base64 decode if fetch is blocked
  }
  const match = /^data:([^;]+);base64,(.+)$/.exec(postcard.url);
  if (!match) return null;
  try {
    const bin = atob(match[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: match[1] || 'image/png' });
  } catch {
    return null;
  }
}

function formatShareFeedback(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (!upper || upper === 'SHARE') return 'Share';
  if (upper === 'SHARED!') return 'Shared!';
  if (upper === 'COPIED IMAGE!') return 'Copied Image!';
  if (upper === 'COPIED!' || upper === 'COPIED LINK!' || upper === 'LINK COPIED') return 'Copied Link!';
  if (upper === 'USE SAVE' || upper === 'USE SAVE PNG') return 'Use Save PNG';
  return raw.trim();
}

async function defaultSharePostcard(postcard: { url: string; caption: string; canvas?: HTMLCanvasElement }): Promise<string> {
  const blob = await getPostcardBlob(postcard);
  const text = postcard.caption ? `Greetings from Hyderabad! ${postcard.caption}` : 'Greetings from Hyderabad!';
  const shareUrl = typeof location !== 'undefined' ? location.origin + location.pathname : '';

  if (blob && typeof File !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const file = new File([blob], 'hyderabad-postcard.png', { type: 'image/png' });
    try {
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Hyderabad Days Postcard', text });
        return 'Shared!';
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'Cancelled';
    }
  }

  if (blob && typeof ClipboardItem !== 'undefined' && typeof navigator !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'Copied Image!';
    } catch {
      // Fall through to text share / link copy
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: 'Hyderabad Days Postcard',
        text,
        ...(shareUrl ? { url: shareUrl } : {}),
      });
      return 'Shared!';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'Cancelled';
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(shareUrl ? `${text} — ${shareUrl}` : text);
      return 'Copied Link!';
    } catch {
      // Fall through
    }
  }

  return 'Use Save PNG';
}

export const PostcardModal: React.FC<PostcardModalProps> = ({ postcard, onClose, onSave, onShare }) => {
  const [saveLabel, setSaveLabel] = useState('Save PNG');
  const [shareLabel, setShareLabel] = useState('Share');
  const [statusMsg, setStatusMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  const saveTimerRef = useRef<number | null>(null);
  const shareTimerRef = useRef<number | null>(null);
  const statusTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    saveTimerRef.current = null;
    shareTimerRef.current = null;
    statusTimerRef.current = null;
  };

  useEffect(() => {
    setSaveLabel('Save PNG');
    setShareLabel('Share');
    setStatusMsg('');
    setSaving(false);
    setSharing(false);
    return clearTimers;
  }, [postcard?.url]);

  useEffect(() => {
    if (!postcard) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [postcard, onClose]);

  const showTransientStatus = (msg: string) => {
    setStatusMsg(msg);
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => setStatusMsg(''), 2800);
  };

  const handleSave = async () => {
    if (!postcard || saving) return;
    setSaving(true);
    try {
      const blob = await getPostcardBlob(postcard);
      const link = document.createElement('a');
      link.download = 'hyderabad-postcard.png';
      link.rel = 'noopener';

      let objectUrl: string | null = null;
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
      } else {
        link.href = postcard.url;
      }

      document.body.appendChild(link);
      link.click();
      link.remove();

      if (objectUrl) {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl!), 1500);
      }

      onSave?.();
      setSaveLabel('Saved!');
      showTransientStatus('Saved PNG!');
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => setSaveLabel('Save PNG'), 2400);
    } catch {
      showTransientStatus('Save blocked by browser');
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!postcard || sharing) return;
    setSharing(true);
    try {
      const raw = onShare ? await onShare() : await defaultSharePostcard(postcard);
      const formatted = formatShareFeedback(raw);
      if (formatted === 'Cancelled') {
        showTransientStatus('Share cancelled');
        setShareLabel('Share');
      } else {
        setShareLabel(formatted);
        showTransientStatus(formatted);
        if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
        shareTimerRef.current = window.setTimeout(() => setShareLabel('Share'), 2400);
      }
    } catch {
      setShareLabel('Use Save PNG');
      showTransientStatus('Use Save PNG to download');
      if (shareTimerRef.current !== null) window.clearTimeout(shareTimerRef.current);
      shareTimerRef.current = window.setTimeout(() => setShareLabel('Share'), 2400);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Popup
      isOpen={!!postcard}
      onClose={onClose}
      title="YOUR POSTCARD"
      closeButtonText="X"
      className="hd-postcard-popup"
      bg={PANEL}
      baseBg={PANEL}
      textColor={CREAM}
      borderColor={BORDER}
    >
      {postcard && (
        <div className="hd-postcard-body">
          <div className="hd-postcard-frame">
            <img
              className="hd-postcard-img"
              src={postcard.url}
              alt={`Postcard: ${postcard.caption || 'Hyderabad'}`}
            />
          </div>

          <div className="hd-postcard-meta">
            <span className="hd-postcard-caption" title={postcard.caption}>
              {postcard.caption || 'Greetings from Hyderabad'}
            </span>
            <span className="hd-postcard-status" role="status" aria-live="polite">
              {statusMsg}
            </span>
          </div>

          <div className="hd-postcard-actions">
            <Button
              type="button"
              bg={MARIGOLD}
              textColor={MARIGOLD_INK}
              borderColor={BORDER}
              shadow={NO_SHADOW}
              disabled={saving}
              onClick={handleSave}
            >
              {saveLabel}
            </Button>
            <Button
              type="button"
              bg={PANEL_ALT}
              textColor={CREAM}
              borderColor={BORDER}
              shadow={NO_SHADOW}
              disabled={sharing}
              onClick={handleShare}
            >
              {shareLabel}
            </Button>
            <Button
              type="button"
              className="hd-postcard-close-btn"
              bg={PANEL_ALT}
              textColor={CREAM}
              borderColor={BORDER}
              shadow={NO_SHADOW}
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </Popup>
  );
};
