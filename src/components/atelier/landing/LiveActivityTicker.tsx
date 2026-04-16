'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { atelierHref } from '@/lib/atelier-paths';

function TickerAvatar({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <span className="w-5 h-5 rounded-full bg-atelier/20 shrink-0" />;
  }
  return (
    <Image
      src={src}
      alt=""
      width={20}
      height={20}
      className="w-5 h-5 rounded-full object-cover shrink-0"
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}

interface ActivityEvent {
  type: 'registration' | 'order' | 'service' | 'review' | 'token_launch';
  id: string;
  title: string;
  subtitle: string | null;
  timestamp: string;
  avatar_url: string | null;
  link_id: string | null;
  slug: string | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function eventLabel(event: ActivityEvent): string {
  switch (event.type) {
    case 'order':
      return 'New order';
    case 'registration':
      return 'Joined';
    case 'service':
      return 'New service';
    case 'review':
      return 'Review';
    case 'token_launch':
      return 'Token launch';
  }
}

function eventLink(event: ActivityEvent): string {
  if (event.type === 'registration' && event.slug) {
    return atelierHref(`/atelier/agents/${event.slug}`);
  }
  if (event.type === 'service' && event.link_id) {
    return atelierHref(`/atelier/services/${event.link_id}`);
  }
  return atelierHref('/atelier/agents');
}

export function LiveActivityTicker() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    fetch('/api/metrics/activity?limit=20')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data?.events) {
          setEvents(res.data.events.filter((e: ActivityEvent) => e.title));
        }
      })
      .catch(() => {});
  }, []);

  if (events.length === 0) return null;

  const loop = [...events, ...events];

  return (
    <section aria-label="Live activity" className="py-8 border-y border-gray-200 dark:border-neutral-800 bg-gray-50/50 dark:bg-black-soft/50 overflow-hidden">
      <div className="flex items-center gap-6 max-w-6xl mx-auto px-6">
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-atelier animate-pulse-atelier" />
          <span className="text-2xs font-mono text-atelier uppercase tracking-widest font-semibold">
            Live
          </span>
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-gray-50 dark:from-black-soft to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-gray-50 dark:from-black-soft to-transparent z-10 pointer-events-none" />
          <div className="flex gap-6 animate-marquee whitespace-nowrap">
            {loop.map((event, i) => (
              <Link
                key={`${event.id}-${i}`}
                href={eventLink(event)}
                className="inline-flex items-center gap-3 group"
              >
                <TickerAvatar src={event.avatar_url} />
                <span className="text-2xs font-mono text-atelier uppercase tracking-wider shrink-0">
                  {eventLabel(event)}
                </span>
                <span className="text-xs font-mono text-black dark:text-white font-semibold truncate max-w-[260px] group-hover:text-atelier transition-colors">
                  {event.title}
                </span>
                <span className="text-2xs font-mono text-gray-400 dark:text-neutral-500 shrink-0">
                  {timeAgo(event.timestamp)}
                </span>
                <span className="text-gray-300 dark:text-neutral-700 shrink-0">·</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
