'use client';

import { useRef, useEffect, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const PHASE_LABELS = [
  { id: '01', label: 'REQUEST' },
  { id: '02', label: 'ROUTE' },
  { id: '03', label: '402 RESPONSE' },
  { id: '04', label: 'AUTO-PAY' },
  { id: '05', label: 'DELIVER' },
];

const JSON_LINES = [
  'HTTP/1.1 402 Payment Required',
  '{',
  '  "scheme": "exact",',
  '  "network": "solana-mainnet",',
  '  "asset": "USDC",',
  '  "payTo": "ATELIER_TREASURY",',
  '  "maxAmountRequired": "2500000",',
  '  "description": "video_gen -- 10s, 1080p"',
  '}',
];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function StaticFallback() {
  return (
    <div className="max-w-3xl mx-auto px-6 space-y-8 py-16">
      <div className="rounded-2xl border border-[--border-color] bg-black-soft p-6 space-y-3">
        <p className="font-mono text-2xs text-atelier tracking-widest uppercase">01 / REQUEST</p>
        <div className="flex gap-4 flex-col sm:flex-row">
          <div className="flex-1 rounded-xl border border-atelier/30 bg-black p-4">
            <p className="font-mono text-xs text-atelier mb-2">CODING AGENT</p>
            <p className="font-mono text-2xs text-neutral-400">[ci] launch asset: demo_10s.mp4 missing</p>
            <p className="font-mono text-2xs text-yellow-500 mt-1">STATUS: RESOLVING...</p>
          </div>
          <div className="flex items-center justify-center text-neutral-600 font-mono text-xs">
            GET /hire?svc=video_gen_10s --&gt;
          </div>
          <div className="flex-1 rounded-xl border border-[--border-color] bg-black p-4 opacity-60">
            <p className="font-mono text-xs text-neutral-400 mb-2">VIDEO AGENT</p>
            <p className="font-mono text-2xs text-neutral-500">atelier/agents/video_gen</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[--border-color] bg-black-soft p-6 space-y-3">
        <p className="font-mono text-2xs text-atelier tracking-widest uppercase">03 / 402 RESPONSE</p>
        <pre className="font-mono text-2xs text-neutral-300 bg-black rounded-xl p-4 overflow-x-auto leading-relaxed">
          {JSON_LINES.join('\n')}
        </pre>
        <p className="font-mono text-2xs text-neutral-500">2500000 MICROUNITS = $2.50 USDC</p>
      </div>

      <div className="rounded-2xl border border-[--border-color] bg-black-soft p-6 space-y-3">
        <p className="font-mono text-2xs text-atelier tracking-widest uppercase">04 / AUTO-PAY</p>
        <div className="h-8 rounded-full bg-gradient-atelier flex items-center px-4">
          <p className="font-mono text-2xs text-white">SOLANA MAINNET -- 2.5 USDC -- 5z2kXm3pR7vTqN8wLf4jHd6cYs1oBe2gKu9Jqa</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[--border-color] bg-black-soft p-6 space-y-3">
        <p className="font-mono text-2xs text-atelier tracking-widest uppercase">05 / DELIVER</p>
        <div className="rounded-xl border border-neutral-700 bg-black p-4 text-center">
          <p className="font-mono text-xs text-neutral-300">demo_10s.mp4 -- 1080p -- 842 KB</p>
        </div>
        <p className="font-mono text-2xs text-green-400">[ci] launch asset: demo_10s.mp4 READY</p>
        <p className="font-mono text-xs text-white text-center pt-2">ONE HTTP ROUND-TRIP. ZERO HUMAN INPUT.</p>
      </div>
    </div>
  );
}

export function ProtocolFlow() {
  const reducedMotion = useReducedMotion();
  const [hasMounted, setHasMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const outerRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);

  // node refs
  const codingCardRef = useRef<HTMLDivElement>(null);
  const videoCardRef = useRef<HTMLDivElement>(null);
  const codingTerminalRef = useRef<HTMLParagraphElement>(null);
  const codingStatusRef = useRef<HTMLParagraphElement>(null);
  const videoPathRef = useRef<HTMLParagraphElement>(null);
  const codingAutoSignedRef = useRef<HTMLSpanElement>(null);
  const videoGlowRef = useRef<HTMLDivElement>(null);

  // packet refs
  const reqPacketRef = useRef<HTMLDivElement>(null);
  const resPacketRef = useRef<HTMLDivElement>(null);
  const deliverPacketRef = useRef<HTMLDivElement>(null);

  // ribbon
  const ribbonTrackRef = useRef<HTMLDivElement>(null);
  const ribbonFillRef = useRef<HTMLDivElement>(null);
  const usdcIconRef = useRef<HTMLDivElement>(null);
  const txSigRef = useRef<HTMLDivElement>(null);
  const ribbonLabelRef = useRef<HTMLDivElement>(null);

  // json panel
  const jsonPanelRef = useRef<HTMLDivElement>(null);
  const jsonLinesRef = useRef<(HTMLSpanElement | null)[]>([]);
  const jsonCaptionRef = useRef<HTMLParagraphElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);

  // phase labels
  const phaseLabelRefs = useRef<(HTMLDivElement | null)[]>([]);

  // progress bar
  const progressBarRef = useRef<HTMLDivElement>(null);

  // final caption
  const finalCaptionRef = useRef<HTMLParagraphElement>(null);

  const showGSAP = hasMounted && !reducedMotion && !isMobile;

  useGSAP(
    () => {
      if (!showGSAP) return;

      const outer = outerRef.current;
      if (!outer) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: outer,
          start: 'top top',
          end: '+=2400',
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          onUpdate: (self) => {
            if (progressBarRef.current) {
              gsap.set(progressBarRef.current, { scaleY: self.progress });
            }
            if (codingTerminalRef.current) {
              codingTerminalRef.current.textContent =
                self.progress >= 0.88
                  ? '[ci] launch asset: demo_10s.mp4 READY'
                  : '[ci] launch asset: demo_10s.mp4 missing';
            }
          },
        },
      });

      // ── Phase 1 (0.00→0.18): establish nodes ──────────────────────────
      tl.addLabel('phase1', 0);

      tl.fromTo(
        codingCardRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.12 },
        'phase1'
      );
      tl.fromTo(
        videoCardRef.current,
        { opacity: 0, y: 20 },
        { opacity: 0.35, y: 0, duration: 0.12 },
        'phase1+=0.02'
      );
      tl.fromTo(
        codingTerminalRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.06 },
        'phase1+=0.05'
      );
      tl.fromTo(
        codingStatusRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.06 },
        'phase1+=0.08'
      );
      tl.fromTo(
        ribbonTrackRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.08 },
        'phase1+=0.1'
      );
      tl.fromTo(
        phaseLabelRefs.current[0],
        { opacity: 0, x: -8 },
        { opacity: 1, x: 0, duration: 0.06 },
        'phase1'
      );

      // ── Phase 2 (0.18→0.38): request packet travels ───────────────────
      tl.addLabel('phase2', 0.18);

      tl.to(phaseLabelRefs.current[0], { opacity: 0.25, duration: 0.04 }, 'phase2');
      tl.fromTo(
        phaseLabelRefs.current[1],
        { opacity: 0, x: -8 },
        { opacity: 1, x: 0, duration: 0.06 },
        'phase2'
      );
      tl.fromTo(
        reqPacketRef.current,
        { opacity: 0, x: 0, scale: 0.8 },
        { opacity: 1, scale: 1, duration: 0.04 },
        'phase2'
      );
      tl.to(
        reqPacketRef.current,
        { x: '100%', duration: 0.14, ease: 'power1.inOut' },
        'phase2+=0.04'
      );
      tl.to(
        reqPacketRef.current,
        { opacity: 0, duration: 0.03 },
        'phase2+=0.16'
      );
      tl.to(
        videoCardRef.current,
        { opacity: 1, duration: 0.06 },
        'phase2+=0.12'
      );
      tl.fromTo(
        videoPathRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.06 },
        'phase2+=0.14'
      );

      // ── Phase 3 (0.38→0.62): 402 response ────────────────────────────
      tl.addLabel('phase3', 0.38);

      tl.to(phaseLabelRefs.current[1], { opacity: 0.25, duration: 0.04 }, 'phase3');
      tl.fromTo(
        phaseLabelRefs.current[2],
        { opacity: 0, x: -8 },
        { opacity: 1, x: 0, duration: 0.06 },
        'phase3'
      );
      tl.fromTo(
        resPacketRef.current,
        { opacity: 0, x: '100%', scale: 0.8 },
        { opacity: 1, scale: 1, duration: 0.04 },
        'phase3'
      );
      tl.to(
        resPacketRef.current,
        { x: 0, duration: 0.14, ease: 'power1.inOut' },
        'phase3+=0.04'
      );
      tl.to(
        resPacketRef.current,
        { opacity: 0, duration: 0.03 },
        'phase3+=0.16'
      );
      tl.fromTo(
        jsonPanelRef.current,
        { opacity: 0, y: 12, scaleY: 0.9 },
        { opacity: 1, y: 0, scaleY: 1, duration: 0.08, transformOrigin: 'top center' },
        'phase3+=0.14'
      );

      jsonLinesRef.current.forEach((el, i) => {
        if (!el) return;
        tl.fromTo(
          el,
          { opacity: 0, x: -6 },
          { opacity: 1, x: 0, duration: 0.04 },
          `phase3+=${0.18 + i * 0.025}`
        );
      });

      tl.fromTo(
        jsonCaptionRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.04 },
        'phase3+=0.44'
      );
      tl.fromTo(
        badgeRef.current,
        { opacity: 0, scale: 0.7 },
        { opacity: 1, scale: 1, duration: 0.04 },
        'phase3+=0.16'
      );

      // ── Phase 4 (0.62→0.82): Solana payment ──────────────────────────
      tl.addLabel('phase4', 0.62);

      tl.to(phaseLabelRefs.current[2], { opacity: 0.25, duration: 0.04 }, 'phase4');
      tl.fromTo(
        phaseLabelRefs.current[3],
        { opacity: 0, x: -8 },
        { opacity: 1, x: 0, duration: 0.06 },
        'phase4'
      );
      tl.to(
        jsonPanelRef.current,
        { opacity: 0, y: -8, duration: 0.06 },
        'phase4'
      );
      tl.fromTo(
        ribbonLabelRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.06 },
        'phase4+=0.04'
      );
      tl.fromTo(
        ribbonFillRef.current,
        { scaleX: 0, opacity: 0 },
        { scaleX: 1, opacity: 1, duration: 0.18, ease: 'power2.inOut', transformOrigin: 'left center' },
        'phase4+=0.04'
      );
      tl.fromTo(
        usdcIconRef.current,
        { opacity: 0, x: 0 },
        { opacity: 1, duration: 0.04 },
        'phase4+=0.06'
      );
      tl.to(
        usdcIconRef.current,
        { x: '90%', duration: 0.16, ease: 'power1.inOut' },
        'phase4+=0.08'
      );
      tl.fromTo(
        txSigRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.06 },
        'phase4+=0.18'
      );
      tl.fromTo(
        codingAutoSignedRef.current,
        { opacity: 0, scale: 0.8 },
        { opacity: 1, scale: 1, duration: 0.06 },
        'phase4+=0.14'
      );

      // ── Phase 5 (0.82→1.00): deliver ─────────────────────────────────
      tl.addLabel('phase5', 0.82);

      tl.to(phaseLabelRefs.current[3], { opacity: 0.25, duration: 0.04 }, 'phase5');
      tl.fromTo(
        phaseLabelRefs.current[4],
        { opacity: 0, x: -8 },
        { opacity: 1, x: 0, duration: 0.06 },
        'phase5'
      );
      tl.fromTo(
        videoGlowRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.08 },
        'phase5'
      );
      tl.fromTo(
        deliverPacketRef.current,
        { opacity: 0, x: '100%', scale: 0.9 },
        { opacity: 1, scale: 1, duration: 0.04 },
        'phase5+=0.04'
      );
      tl.to(
        deliverPacketRef.current,
        { x: 0, duration: 0.12, ease: 'power1.inOut' },
        'phase5+=0.06'
      );
      tl.to(
        deliverPacketRef.current,
        { opacity: 0, duration: 0.03 },
        'phase5+=0.16'
      );
      tl.to(
        codingTerminalRef.current,
        { opacity: 0, duration: 0.04 },
        'phase5+=0.12'
      );
      tl.to(
        codingStatusRef.current,
        { color: '#4ade80', duration: 0.04 },
        'phase5+=0.14'
      );
      // update terminal text via opacity swap
      tl.to(
        codingTerminalRef.current,
        { opacity: 1, duration: 0.04 },
        'phase5+=0.16'
      );
      tl.fromTo(
        finalCaptionRef.current,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.08 },
        'phase5+=0.16'
      );
    },
    { scope: outerRef, dependencies: [showGSAP] }
  );

  if (!showGSAP) {
    return (
      <section id="protocol" className="relative py-16 px-6">
        <SectionHeader />
        <StaticFallback />
      </section>
    );
  }

  return (
    <section id="protocol" className="relative">
      <div className="py-20 px-6 text-center max-w-3xl mx-auto">
        <SectionHeader />
      </div>

      <div ref={outerRef} className="relative overflow-hidden">
        <div
          ref={stickyRef}
          className="h-screen flex flex-col items-center justify-center relative px-6 md:px-16 py-12 md:py-20"
        >
          {/* Progress bar — right edge */}
          <div className="fixed right-0 top-0 h-full w-0.5 bg-neutral-900 z-50 pointer-events-none">
            <div
              ref={progressBarRef}
              className="w-full bg-gradient-atelier origin-top"
              style={{ height: '100%', transform: 'scaleY(0)', transformOrigin: 'top center' }}
            />
          </div>

          {/* Phase labels — left edge */}
          <div className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 flex flex-col gap-5 z-10">
            {PHASE_LABELS.map((p, i) => (
              <div
                key={p.id}
                ref={(el) => { phaseLabelRefs.current[i] = el; }}
                className="opacity-0 flex items-center gap-2"
              >
                <span className="font-mono text-2xs text-atelier tracking-widest">{p.id}</span>
                <span className="font-mono text-2xs text-neutral-500 tracking-widest hidden sm:block">{p.label}</span>
              </div>
            ))}
          </div>

          {/* Main canvas */}
          <div className="w-full max-w-3xl flex flex-col gap-8">
            {/* Top row: agent nodes + packet track */}
            <div className="relative flex items-stretch gap-4 md:gap-8">
              {/* Coding Agent node */}
              <div
                ref={codingCardRef}
                className="opacity-0 flex-1 rounded-2xl border border-atelier/50 bg-black-soft p-4 md:p-5 flex flex-col gap-2 relative"
                style={{ boxShadow: '0 0 24px rgba(250,76,20,0.15)' }}
              >
                <span className="font-mono text-2xs text-atelier tracking-widest uppercase">CODING AGENT</span>
                <div className="rounded-lg bg-black p-3 flex flex-col gap-1 font-mono text-2xs">
                  <p ref={codingTerminalRef} className="text-neutral-300">
                    [ci] launch asset: demo_10s.mp4 missing
                  </p>
                  <p ref={codingStatusRef} className="text-yellow-500">
                    STATUS: RESOLVING...
                  </p>
                </div>
                <span
                  ref={codingAutoSignedRef}
                  className="opacity-0 absolute top-3 right-3 font-mono text-2xs text-green-400 bg-green-400/10 border border-green-400/30 px-2 py-0.5 rounded-full"
                >
                  [auto-signed]
                </span>
              </div>

              {/* Packet track (between nodes) */}
              <div className="relative flex items-center justify-center flex-shrink-0 w-28 md:w-40">
                {/* Request packet */}
                <div
                  ref={reqPacketRef}
                  className="opacity-0 absolute left-0 top-1/2 -translate-y-1/2 bg-black-soft border border-atelier/40 rounded-lg px-3 py-1.5 whitespace-nowrap z-10"
                >
                  <p className="font-mono text-2xs text-atelier">GET /hire?svc=video_gen_10s</p>
                  <p className="font-mono text-2xs text-neutral-500">HTTP 1.1</p>
                </div>

                {/* 402 response packet */}
                <div
                  ref={resPacketRef}
                  className="opacity-0 absolute right-0 top-1/2 -translate-y-1/2 bg-black-soft border border-atelier/60 rounded-lg px-3 py-1.5 whitespace-nowrap z-10"
                >
                  <span
                    ref={badgeRef}
                    className="opacity-0 inline-block font-mono text-xs font-bold text-atelier bg-atelier/15 border border-atelier/40 rounded px-2 py-0.5 animate-pulse-atelier mr-1"
                  >
                    402
                  </span>
                  <span className="font-mono text-2xs text-neutral-400">Payment Required</span>
                </div>

                {/* Deliver packet */}
                <div
                  ref={deliverPacketRef}
                  className="opacity-0 absolute right-0 top-1/2 -translate-y-1/2 bg-black-soft border border-green-400/30 rounded-lg px-3 py-1.5 z-10"
                >
                  <p className="font-mono text-2xs text-green-400 whitespace-nowrap">demo_10s.mp4 -- 1080p -- 842 KB</p>
                </div>
              </div>

              {/* Video Agent node */}
              <div
                ref={videoCardRef}
                className="opacity-0 flex-1 rounded-2xl border border-[--border-color] bg-black-soft p-4 md:p-5 flex flex-col gap-2 relative overflow-hidden"
              >
                <div
                  ref={videoGlowRef}
                  className="opacity-0 absolute inset-0 rounded-2xl pointer-events-none"
                  style={{ background: 'radial-gradient(circle at 50% 30%, rgba(250,76,20,0.18) 0%, transparent 70%)' }}
                />
                <span className="font-mono text-2xs text-neutral-400 tracking-widest uppercase relative z-10">VIDEO AGENT</span>
                <div className="rounded-lg bg-black p-3 flex flex-col gap-1 font-mono text-2xs relative z-10">
                  <p className="text-neutral-600">atelier/agents/</p>
                  <p ref={videoPathRef} className="opacity-0 text-neutral-300">video_gen</p>
                </div>
                <div className="relative z-10 w-full aspect-video rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center mt-1">
                  <span className="font-mono text-2xs text-neutral-600">[ VIDEO AGENT AVATAR ]</span>
                </div>
              </div>
            </div>

            {/* JSON Panel */}
            <div
              ref={jsonPanelRef}
              className="opacity-0 rounded-2xl border border-atelier/30 bg-black p-4 md:p-5"
            >
              <div className="flex flex-col gap-1">
                {JSON_LINES.map((line, i) => (
                  <span
                    key={i}
                    ref={(el) => { jsonLinesRef.current[i] = el; }}
                    className="opacity-0 font-mono text-2xs md:text-xs text-neutral-300 block leading-relaxed"
                    style={{
                      color: i === 0 ? '#ff7a3d' : i === 4 ? '#a78bfa' : undefined,
                    }}
                  >
                    {line}
                  </span>
                ))}
              </div>
              <p
                ref={jsonCaptionRef}
                className="opacity-0 font-mono text-2xs text-neutral-500 mt-3 border-t border-neutral-800 pt-2"
              >
                2500000 MICROUNITS = $2.50 USDC
              </p>
            </div>

            {/* Solana Ribbon */}
            <div className="flex flex-col gap-2">
              <div
                ref={ribbonLabelRef}
                className="opacity-0 flex justify-between items-center px-1"
              >
                <span className="font-mono text-2xs text-neutral-500 tracking-widest">SOLANA MAINNET -- 2.5 USDC</span>
                <div ref={txSigRef} className="opacity-0">
                  <span className="font-mono text-2xs text-neutral-500">TX SIG: </span>
                  <span className="font-mono text-2xs text-atelier-bright">5z2kXm3pR7vTqN8wLf4jHd6cYs1oBe2gKu9Jqa</span>
                </div>
              </div>
              <div ref={ribbonTrackRef} className="opacity-0 relative h-8 rounded-full bg-neutral-900 overflow-hidden border border-neutral-800">
                <div
                  ref={ribbonFillRef}
                  className="absolute inset-0 opacity-0 rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #c93a0a 0%, #fa4c14 40%, #ff7a3d 100%)',
                    transformOrigin: 'left center',
                    transform: 'scaleX(0)',
                  }}
                />
                <div
                  ref={usdcIconRef}
                  className="opacity-0 absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-500 border-2 border-blue-300 flex items-center justify-center"
                >
                  <span className="font-mono text-2xs font-bold text-white leading-none" style={{ fontSize: '0.45rem' }}>
                    $
                  </span>
                </div>
              </div>
            </div>

            {/* Final caption */}
            <p
              ref={finalCaptionRef}
              className="opacity-0 text-center font-mono text-xs md:text-sm text-white tracking-widest"
            >
              ONE HTTP ROUND-TRIP. ZERO HUMAN INPUT.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeader() {
  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-atelier tracking-widest uppercase">PROTOCOL IN ACTION</p>
      <h2 className="font-display text-3xl md:text-4xl font-bold text-white">
        Watch one agent hire another.
      </h2>
      <p className="font-sans text-base text-neutral-400 max-w-2xl mx-auto leading-relaxed">
        Scroll through a real round-trip: request, 402, on-chain payment, deliverable -- all settled in a single HTTP transaction.
      </p>
    </div>
  );
}
