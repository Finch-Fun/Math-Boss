import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CampaignState } from '../../game/campaign';
import { projectCampaign, viewOfPlayer, type Projection } from '../../cloud/liveState';
import { toCloudError } from '../../cloud/errors';
import type { PlayerView, StateReply } from '../../cloud/multiplayerTypes';
import type { Classroom, Cloud } from '../../cloud/types';

export interface Multiplayer {
  campaign: CampaignState | null;
  projection: Projection | null;
  me: PlayerView | null;
  /** Estimated server time (display only). */
  now: number;
  error: string;
  sync: () => Promise<void>;
  /** Feed an action's reply back in so the screen updates immediately (the listeners confirm it right after). */
  apply: (r: StateReply) => void;
}

/**
 * Shared state (one listener on the classroom's campaign document) + scoped personal state (the student's own player document).
 * All numbers come from the server. The screen only projects them forward in time for smooth display and re-syncs when a
 * projection reaches an event that needs the server (new week or new boss).
 */
export function useMultiplayer(cloud: Cloud, classroom: Classroom, role: 'student' | 'teacher'): Multiplayer {
  const ctx = useMemo(() => ({ timeZone: classroom.timezone, settings: classroom.settings }), [classroom.timezone, classroom.settings]);
  const [campaign, setCampaign] = useState<CampaignState | null>(null);
  const [me, setMe] = useState<PlayerView | null>(null);
  const [error, setError] = useState('');
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const campaignRef = useRef<CampaignState | null>(null);
  const lastSync = useRef(0);

  const takeCampaign = useCallback((c: CampaignState | null) => {
    if (!c) return;
    const cur = campaignRef.current;
    if (cur && cur.lastSettledAt > c.lastSettledAt) return; // never go backwards
    campaignRef.current = c;
    setCampaign(c);
  }, []);

  const apply = useCallback(
    (r: StateReply) => {
      offset.current = r.serverNow - Date.now();
      takeCampaign(r.campaign);
      if (r.me) setMe(r.me);
    },
    [takeCampaign],
  );

  const sync = useCallback(async () => {
    lastSync.current = Date.now();
    try {
      const r = await cloud.game.sync(classroom.id);
      if (r.ok) {
        setError('');
        apply(r);
      } else setError(r.reason);
    } catch (e) {
      setError(toCloudError(e).message);
    }
  }, [cloud, classroom.id, apply]);

  useEffect(() => {
    void sync();
    const offC = cloud.live.watchCampaign(classroom.id, takeCampaign, (e) => setError(e.message));
    const offP =
      role === 'student'
        ? cloud.live.watchMyPlayer(
            classroom.id,
            (p) => {
              if (p && campaignRef.current) setMe(viewOfPlayer(p, campaignRef.current, ctx, Date.now() + offset.current));
            },
            (e) => setError(e.message),
          )
        : () => {};
    const timer = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => {
      offC();
      offP();
      clearInterval(timer);
    };
  }, [cloud, classroom.id, role, ctx, sync, takeCampaign]);

  const projection = useMemo(() => (campaign ? projectCampaign(campaign, now, ctx) : null), [campaign, now, ctx]);

  useEffect(() => {
    if (projection?.needsServer && Date.now() - lastSync.current > 10_000) void sync();
  }, [projection, sync]);

  return { campaign, projection, me, now, error, sync, apply };
}
