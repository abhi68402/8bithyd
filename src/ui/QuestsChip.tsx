import React, { useState } from 'react';
import { Button, Card, Popup, ProgressBar } from 'pixel-retroui';
import type { CityGameSummary } from '../sim/quests';

const PANEL = '#1b1626';
const PANEL_ALT = '#28213a';
const BORDER = '#5a4d7a';
const CREAM = '#f7efe0';
const TEAL = '#2dd4bf';
const MARIGOLD = '#f0a030';
const MARIGOLD_INK = '#1b1626';
const NO_SHADOW = 'transparent';

export interface QuestsChipProps {
  summary: CityGameSummary;
  /** Optional callback to fly the camera to an uncollected treasure clue. */
  onFlyTo?: (wx: number, wy: number, zoom?: number) => void;
  /** Optional callback to trigger a fun map Horn / Cheer ripple. */
  onHonk?: () => void;
  /** Optional callback to reset saved quest/treasure progress. */
  onReset?: () => void;
  className?: string;
}

const ChaiBadgeIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    shapeRendering="crispEdges"
    aria-hidden="true"
    style={{ flex: 'none', display: 'block' }}
  >
    <rect x="6" y="1" width="1" height="2" fill={CREAM} />
    <rect x="9" y="2" width="1" height="2" fill={CREAM} />
    <rect x="3" y="5" width="8" height="6" fill={MARIGOLD} />
    <rect x="4" y="5" width="6" height="1" fill="#8b4513" />
    <rect x="4" y="6" width="2" height="4" fill="#ffd86b" />
    <rect x="11" y="6" width="2" height="3" fill={MARIGOLD} />
    <rect x="11" y="7" width="1" height="1" fill={PANEL} />
    <rect x="2" y="11" width="10" height="2" fill={CREAM} />
  </svg>
);

export const QuestsChip: React.FC<QuestsChipProps> = ({
  summary,
  onFlyTo,
  onHonk,
  onReset,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const treasurePct = summary.treasuresTotal
    ? Math.round((summary.treasuresCollected / summary.treasuresTotal) * 100)
    : 0;
  const allDone =
    summary.treasuresCollected === summary.treasuresTotal &&
    summary.questsCompleted === summary.questsTotal;

  return (
    <>
      <Button
        className={className ? `hd-quests-chip ${className}` : 'hd-quests-chip'}
        bg={open ? MARIGOLD : PANEL}
        textColor={open ? MARIGOLD_INK : CREAM}
        borderColor={allDone ? TEAL : open ? MARIGOLD : BORDER}
        shadow={NO_SHADOW}
        title="View Golden Chai, Deccan Pearls & Explorer Quests"
        onClick={() => {
          setConfirmReset(false);
          setOpen(true);
        }}
      >
        <ChaiBadgeIcon size={15} />
        <span
          style={{
            fontFamily: "'Silkscreen', monospace",
            fontSize: 10,
            color: open ? MARIGOLD_INK : MARIGOLD,
            fontWeight: 700,
          }}
        >
          {summary.treasuresCollected}/{summary.treasuresTotal}
        </span>
        <span
          style={{
            width: 2,
            height: 14,
            background: open ? MARIGOLD_INK : BORDER,
            opacity: 0.7,
          }}
        />
        <span
          style={{
            fontFamily: "'Silkscreen', monospace",
            fontSize: 10,
            color: open ? MARIGOLD_INK : TEAL,
            fontWeight: 700,
          }}
        >
          {summary.questsCompleted}/{summary.questsTotal}Q
        </span>
      </Button>

      <Popup
        isOpen={open}
        onClose={() => setOpen(false)}
        title="CHAI, PEARLS & QUESTS"
        className="hd-quests-popup"
        bg={PANEL}
        baseBg={PANEL}
        textColor={CREAM}
        borderColor={BORDER}
      >
        <div
          className="hd-ui-text"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 11,
            maxHeight: '72dvh',
            overflowY: 'auto',
            paddingRight: 2,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
            <Card
              bg={PANEL_ALT}
              textColor={CREAM}
              borderColor={BORDER}
              shadowColor={NO_SHADOW}
              style={{ padding: '7px 9px' }}
            >
              <div style={{ fontSize: 10, color: '#d4cce3' }}>GOLDEN CHAI</div>
              <div style={{ fontFamily: "'Silkscreen', monospace", fontSize: 14, color: MARIGOLD, fontWeight: 700 }}>
                {summary.chaiCollected}/{summary.chaiTotal}
              </div>
            </Card>
            <Card
              bg={PANEL_ALT}
              textColor={CREAM}
              borderColor={BORDER}
              shadowColor={NO_SHADOW}
              style={{ padding: '7px 9px' }}
            >
              <div style={{ fontSize: 10, color: '#d4cce3' }}>DECCAN PEARLS</div>
              <div style={{ fontFamily: "'Silkscreen', monospace", fontSize: 14, color: CREAM, fontWeight: 700 }}>
                {summary.pearlsCollected}/{summary.pearlsTotal}
              </div>
            </Card>
            <Card
              bg={PANEL_ALT}
              textColor={CREAM}
              borderColor={BORDER}
              shadowColor={NO_SHADOW}
              style={{ padding: '7px 9px' }}
            >
              <div style={{ fontSize: 10, color: '#d4cce3' }}>SCORE</div>
              <div style={{ fontFamily: "'Silkscreen', monospace", fontSize: 14, color: TEAL, fontWeight: 700 }}>
                {summary.score}
              </div>
            </Card>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#d4cce3' }}>
              <span>Tap glowing tokens on the map or zoom close to collect</span>
              <b style={{ color: MARIGOLD }}>{treasurePct}%</b>
            </div>
            <ProgressBar progress={treasurePct} size="sm" color={MARIGOLD} borderColor={BORDER} />
          </div>

          <div
            style={{
              fontFamily: "'Silkscreen', monospace",
              fontSize: 10,
              color: TEAL,
              letterSpacing: '0.05em',
            }}
          >
            EXPLORER CHALLENGES ({summary.questsCompleted}/{summary.questsTotal})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {summary.quests.map((q) => {
              const pct = q.target > 0 ? Math.min(100, Math.round((q.progress / q.target) * 100)) : 0;
              return (
                <div
                  key={q.id}
                  style={{
                    background: PANEL_ALT,
                    border: `2px solid ${q.completed ? TEAL : BORDER}`,
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: q.completed ? TEAL : CREAM }}>
                      {q.completed ? '✓ ' : ''}
                      {q.title}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Silkscreen', monospace",
                        fontSize: 10,
                        color: q.completed ? TEAL : MARIGOLD,
                        flex: 'none',
                      }}
                    >
                      {q.completed ? `+${q.rewardPts}` : `${q.progress}/${q.target}${q.unit === 'm' ? 'm' : ''}`}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#d4cce3', lineHeight: 1.35 }}>{q.description}</div>
                  <ProgressBar
                    progress={pct}
                    size="sm"
                    color={q.completed ? TEAL : MARIGOLD}
                    borderColor={BORDER}
                  />
                </div>
              );
            })}
          </div>

          <div
            style={{
              fontFamily: "'Silkscreen', monospace",
              fontSize: 10,
              color: TEAL,
              letterSpacing: '0.05em',
            }}
          >
            BY NEIGHBOURHOOD
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {summary.districts.map((d) => {
              const cleared = d.collected === d.total && d.total > 0;
              return (
                <div
                  key={d.district}
                  style={{
                    background: '#130f1c',
                    border: `2px solid ${cleared ? TEAL : BORDER}`,
                    padding: '6px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 4,
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: cleared ? TEAL : CREAM, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.district}
                  </span>
                  <b style={{ fontFamily: "'Silkscreen', monospace", fontSize: 10, color: cleared ? TEAL : MARIGOLD }}>
                    {d.collected}/{d.total}
                  </b>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 2 }}>
            {onFlyTo && summary.nearestUncollected && (
              <Button
                bg={MARIGOLD}
                textColor={MARIGOLD_INK}
                borderColor={BORDER}
                shadow={NO_SHADOW}
                style={{ flex: 1 }}
                onClick={() => {
                  const n = summary.nearestUncollected!;
                  setOpen(false);
                  onFlyTo(n.wx, n.wy, 1.5);
                }}
              >
                Nearest: {summary.nearestUncollected.district}
              </Button>
            )}
            {onHonk && (
              <Button
                bg={PANEL_ALT}
                textColor={CREAM}
                borderColor={BORDER}
                shadow={NO_SHADOW}
                onClick={() => onHonk()}
              >
                Honk / Cheer
              </Button>
            )}
            {onReset && (
              <Button
                bg={confirmReset ? '#e0524c' : PANEL_ALT}
                textColor={CREAM}
                borderColor={BORDER}
                shadow={NO_SHADOW}
                onClick={() => {
                  if (!confirmReset) {
                    setConfirmReset(true);
                    return;
                  }
                  setConfirmReset(false);
                  onReset();
                }}
              >
                {confirmReset ? 'Confirm Reset' : 'Reset'}
              </Button>
            )}
            <Button
              bg={PANEL_ALT}
              textColor={CREAM}
              borderColor={BORDER}
              shadow={NO_SHADOW}
              style={{ flex: onFlyTo && summary.nearestUncollected ? undefined : 1 }}
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Popup>
    </>
  );
};
