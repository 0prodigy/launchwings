"use client";

// T3 — local form state for the brief editor. Hand-rolled (no react-hook-form
// per the brief). Hydrates from the server output on first read; on subsequent
// server reads, only re-hydrates a section if it isn't dirty (so a regenerate
// landing replaces stale form data only when the founder hasn't been editing).
//
// Dirty signal is conservative-but-simple: any setField / setIcp / setCompetitor
// / setTagline call flips `dirty[section] = true`. resetSection() clears it
// (used when the founder explicitly discards their edits). approveBrief should
// also clear dirty after a successful submit (caller wires this via
// resetSection on both sections, then the next server read re-hydrates).

import { useCallback, useEffect, useRef, useState } from "react";

// ----- Editable shapes (subset of the agent schemas that the founder edits) -

export interface IcpEdit {
  name: string;
  role: string;
  // Comma-separated free text; converted to string[] at the boundary in
  // getDiscoveryEdits / getPositioningEdits. Keeping the raw string here lets
  // the founder type a trailing comma without it disappearing on every keystroke.
  pains: string;
  gains: string;
}

export interface CompetitorEdit {
  name: string;
  why_they_lose: string;
  // Preserved verbatim from the server when present so a future regenerate
  // doesn't lose the URL hint. Not exposed for editing in T3.
  url?: string;
}

export interface DiscoveryEdits {
  product_summary: string;
  value_prop: string;
  three_icps: IcpEdit[];
  competitors: CompetitorEdit[];
}

export interface PositioningEdits {
  icps: IcpEdit[];
  // Just the editable text; the server's existing tagline rows (with their
  // judge_score) are merged back in getPositioningEdits so the agent's
  // judge_score isn't clobbered by approveBrief's shallow merge.
  taglines: string[];
}

export interface BriefFormState {
  discovery: DiscoveryEdits | null;
  positioning: PositioningEdits | null;
  dirty: { discovery: boolean; positioning: boolean };
}

// ----- Server output shapes (what we hydrate from) -------------------------

export interface ServerDiscoveryIcp {
  name: string;
  role: string;
  pains: string[];
  gains: string[];
}

export interface ServerCompetitor {
  name: string;
  why_they_lose: string;
  url?: string;
}

export interface ServerDiscoveryOutput {
  product_summary: string;
  value_prop: string;
  three_icps: ServerDiscoveryIcp[];
  competitors: ServerCompetitor[];
  // Read-only fields that never enter form state — page reads them straight
  // from the server output. Listed here for documentation only.
  current_seo_posture?: unknown;
  channel_suitability_scores?: unknown;
}

export interface ServerTagline {
  text: string;
  judge_score: {
    audience: boolean;
    problem: boolean;
    mechanism: boolean;
    under12: boolean;
    total: number;
  };
}

export interface ServerPositioningOutput {
  icps: ServerDiscoveryIcp[];
  taglines: ServerTagline[];
}

// ----- Hydration helpers ---------------------------------------------------

function hydrateDiscovery(out: ServerDiscoveryOutput): DiscoveryEdits {
  return {
    product_summary: out.product_summary ?? "",
    value_prop: out.value_prop ?? "",
    three_icps: (out.three_icps ?? []).map((i) => ({
      name: i.name,
      role: i.role,
      pains: i.pains.join(", "),
      gains: i.gains.join(", "),
    })),
    competitors: (out.competitors ?? []).map((c) => ({
      name: c.name,
      why_they_lose: c.why_they_lose,
      ...(c.url !== undefined ? { url: c.url } : {}),
    })),
  };
}

function hydratePositioning(out: ServerPositioningOutput): PositioningEdits {
  return {
    icps: (out.icps ?? []).map((i) => ({
      name: i.name,
      role: i.role,
      pains: i.pains.join(", "),
      gains: i.gains.join(", "),
    })),
    taglines: (out.taglines ?? []).map((t) => t.text),
  };
}

function splitCsv(s: string): string[] {
  return s
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ----- Hook ----------------------------------------------------------------

export interface UseBriefStateArgs {
  serverDiscovery: ServerDiscoveryOutput | null;
  serverPositioning: ServerPositioningOutput | null;
  /** Used to decide when to re-hydrate non-dirty sections after a regenerate. */
  discoveryGeneratedAt: string | null;
  positioningGeneratedAt: string | null;
}

export function useBriefState(args: UseBriefStateArgs) {
  const [state, setState] = useState<BriefFormState>({
    discovery: null,
    positioning: null,
    dirty: { discovery: false, positioning: false },
  });

  // Track the last `generatedAt` we hydrated each section from; re-hydrate when
  // server advances AND the section isn't dirty. Refs (not state) so we don't
  // double-render when bumping them.
  const hydratedDiscoveryTs = useRef<string | null>(null);
  const hydratedPositioningTs = useRef<string | null>(null);

  // Keep the latest server taglines around so getPositioningEdits can fold the
  // founder's edited text back into the existing rows without losing
  // judge_score (approveBrief shallow-merges, so we have to send the full row).
  const latestServerTaglines = useRef<ServerTagline[] | null>(null);
  if (args.serverPositioning) {
    latestServerTaglines.current = args.serverPositioning.taglines;
  }

  // Hydrate / re-hydrate. We do it in an effect (not during render) so we
  // never call setState mid-render.
  useEffect(() => {
    setState((prev) => {
      let next = prev;

      const dTs = args.discoveryGeneratedAt;
      const dShouldHydrate =
        args.serverDiscovery &&
        (prev.discovery === null ||
          (!prev.dirty.discovery && dTs !== null && dTs !== hydratedDiscoveryTs.current));
      if (dShouldHydrate && args.serverDiscovery) {
        next = {
          ...next,
          discovery: hydrateDiscovery(args.serverDiscovery),
          dirty: { ...next.dirty, discovery: false },
        };
        hydratedDiscoveryTs.current = dTs;
      }

      const pTs = args.positioningGeneratedAt;
      const pShouldHydrate =
        args.serverPositioning &&
        (prev.positioning === null ||
          (!prev.dirty.positioning && pTs !== null && pTs !== hydratedPositioningTs.current));
      if (pShouldHydrate && args.serverPositioning) {
        next = {
          ...next,
          positioning: hydratePositioning(args.serverPositioning),
          dirty: { ...next.dirty, positioning: false },
        };
        hydratedPositioningTs.current = pTs;
      }

      return next;
    });
  }, [
    args.serverDiscovery,
    args.serverPositioning,
    args.discoveryGeneratedAt,
    args.positioningGeneratedAt,
  ]);

  // ----- Setters (each marks its section dirty) ----------------------------

  const setDiscoveryField = useCallback(
    <K extends keyof Pick<DiscoveryEdits, "product_summary" | "value_prop">>(
      key: K,
      value: DiscoveryEdits[K],
    ) => {
      setState((prev) => {
        if (!prev.discovery) return prev;
        return {
          ...prev,
          discovery: { ...prev.discovery, [key]: value },
          dirty: { ...prev.dirty, discovery: true },
        };
      });
    },
    [],
  );

  const setDiscoveryIcp = useCallback(
    (index: number, key: keyof IcpEdit, value: string) => {
      setState((prev) => {
        if (!prev.discovery) return prev;
        const next = prev.discovery.three_icps.map((icp, i) =>
          i === index ? { ...icp, [key]: value } : icp,
        );
        return {
          ...prev,
          discovery: { ...prev.discovery, three_icps: next },
          dirty: { ...prev.dirty, discovery: true },
        };
      });
    },
    [],
  );

  const setCompetitor = useCallback(
    (index: number, key: "name" | "why_they_lose", value: string) => {
      setState((prev) => {
        if (!prev.discovery) return prev;
        const next = prev.discovery.competitors.map((c, i) =>
          i === index ? { ...c, [key]: value } : c,
        );
        return {
          ...prev,
          discovery: { ...prev.discovery, competitors: next },
          dirty: { ...prev.dirty, discovery: true },
        };
      });
    },
    [],
  );

  const addCompetitor = useCallback(() => {
    setState((prev) => {
      if (!prev.discovery) return prev;
      if (prev.discovery.competitors.length >= 5) return prev;
      return {
        ...prev,
        discovery: {
          ...prev.discovery,
          competitors: [
            ...prev.discovery.competitors,
            { name: "", why_they_lose: "" },
          ],
        },
        dirty: { ...prev.dirty, discovery: true },
      };
    });
  }, []);

  const removeCompetitor = useCallback((index: number) => {
    setState((prev) => {
      if (!prev.discovery) return prev;
      if (prev.discovery.competitors.length <= 2) return prev;
      return {
        ...prev,
        discovery: {
          ...prev.discovery,
          competitors: prev.discovery.competitors.filter((_, i) => i !== index),
        },
        dirty: { ...prev.dirty, discovery: true },
      };
    });
  }, []);

  const setPositioningIcp = useCallback(
    (index: number, key: keyof IcpEdit, value: string) => {
      setState((prev) => {
        if (!prev.positioning) return prev;
        const next = prev.positioning.icps.map((icp, i) =>
          i === index ? { ...icp, [key]: value } : icp,
        );
        return {
          ...prev,
          positioning: { ...prev.positioning, icps: next },
          dirty: { ...prev.dirty, positioning: true },
        };
      });
    },
    [],
  );

  const setTagline = useCallback((index: number, value: string) => {
    setState((prev) => {
      if (!prev.positioning) return prev;
      const next = prev.positioning.taglines.map((t, i) =>
        i === index ? value : t,
      );
      return {
        ...prev,
        positioning: { ...prev.positioning, taglines: next },
        dirty: { ...prev.dirty, positioning: true },
      };
    });
  }, []);

  const resetSection = useCallback(
    (section: "discovery" | "positioning") => {
      // Clear dirty + drop the cached hydration timestamp so the next server
      // read re-hydrates this section. Used after Approve and on explicit
      // "discard edits" affordances.
      if (section === "discovery") {
        hydratedDiscoveryTs.current = null;
        setState((prev) => ({
          ...prev,
          discovery: args.serverDiscovery
            ? hydrateDiscovery(args.serverDiscovery)
            : null,
          dirty: { ...prev.dirty, discovery: false },
        }));
      } else {
        hydratedPositioningTs.current = null;
        setState((prev) => ({
          ...prev,
          positioning: args.serverPositioning
            ? hydratePositioning(args.serverPositioning)
            : null,
          dirty: { ...prev.dirty, positioning: false },
        }));
      }
    },
    [args.serverDiscovery, args.serverPositioning],
  );

  // ----- Boundary serialisers ----------------------------------------------

  const getDiscoveryEdits = useCallback((): Record<string, unknown> | null => {
    if (!state.discovery) return null;
    return {
      product_summary: state.discovery.product_summary,
      value_prop: state.discovery.value_prop,
      three_icps: state.discovery.three_icps.map((icp) => ({
        name: icp.name,
        role: icp.role,
        pains: splitCsv(icp.pains),
        gains: splitCsv(icp.gains),
      })),
      competitors: state.discovery.competitors.map((c) => ({
        name: c.name,
        why_they_lose: c.why_they_lose,
        ...(c.url !== undefined ? { url: c.url } : {}),
      })),
    };
  }, [state.discovery]);

  const getPositioningEdits = useCallback((): Record<string, unknown> | null => {
    if (!state.positioning) return null;
    // Fold the founder's edited tagline text back into the server's existing
    // tagline rows so judge_score is preserved through approveBrief's shallow
    // merge. If the server taglines aren't loaded yet (shouldn't happen — the
    // form is only editable once positioning lands) fall back to text-only
    // rows; the server-side schema would still accept them on a fresh approve.
    const serverTaglines = latestServerTaglines.current ?? [];
    const editedTaglines = state.positioning.taglines.map((text, i) => {
      const existing = serverTaglines[i];
      if (existing) return { ...existing, text };
      return {
        text,
        judge_score: {
          audience: false,
          problem: false,
          mechanism: false,
          under12: false,
          total: 0,
        },
      };
    });
    return {
      icps: state.positioning.icps.map((icp) => ({
        name: icp.name,
        role: icp.role,
        pains: splitCsv(icp.pains),
        gains: splitCsv(icp.gains),
      })),
      taglines: editedTaglines,
    };
  }, [state.positioning]);

  return {
    state,
    setDiscoveryField,
    setDiscoveryIcp,
    setCompetitor,
    addCompetitor,
    removeCompetitor,
    setPositioningIcp,
    setTagline,
    resetSection,
    getDiscoveryEdits,
    getPositioningEdits,
    isDirty: state.dirty.discovery || state.dirty.positioning,
  };
}
