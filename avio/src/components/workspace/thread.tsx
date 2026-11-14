"use client";

import { Columns2, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button, IconButton } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo";
import { ApiError, api, networkError, redirectToLogin, toApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { readNdjson, uuid } from "@/lib/stream";
import type {
  ChatRequestBody,
  ChatStreamEvent,
  ConversationDTO,
  ConversationDetailDTO,
  ConversationMode,
  ModelDTO,
  ResponseDTO,
  TurnDTO,
} from "@/lib/types";

import { Composer } from "./composer";
import { ModelSelect } from "./model-select";
import { ProviderSetup } from "./provider-setup";
import { ResponseView, type LiveResponse } from "./response-view";
import { TopBar } from "./shell";
import { ThreadSkeleton } from "./skeletons";
import { useWorkspace } from "./workspace-provider";

// ---- State ------------------------------------------------------------------

interface ThreadTurn {
  /** Stable React key: the request id for turns sent from this tab. */
  key: string;
  /** Server id, once the server has accepted the turn. */
  id: string | null;
  prompt: string;
  responses: LiveResponse[];
}

interface ThreadState {
  conversation: ConversationDTO | null;
  turns: ThreadTurn[];
}

type Action =
  | { type: "submit"; key: string; prompt: string; models: ModelDTO[] }
  | { type: "start"; key: string; conversation: ConversationDTO; turn: TurnDTO }
  | { type: "delta"; key: string; lane: number; text: string }
  | { type: "settle"; key: string; response: ResponseDTO }
  | { type: "reject"; key: string }
  | { type: "disconnect"; key: string }
  | { type: "sync"; detail: ConversationDetailDTO };

const fromServer = (turn: TurnDTO): ThreadTurn => ({
  key: turn.id,
  id: turn.id,
  prompt: turn.prompt,
  responses: turn.responses.map((response) => ({ ...response, live: false })),
});

function init(initial: ConversationDetailDTO | null): ThreadState {
  if (!initial) return { conversation: null, turns: [] };
  const { turns, ...conversation } = initial;
  return { conversation, turns: turns.map(fromServer) };
}

function mapTurn(
  state: ThreadState,
  key: string,
  update: (turn: ThreadTurn) => ThreadTurn,
): ThreadState {
  return {
    ...state,
    turns: state.turns.map((turn) => (turn.key === key ? update(turn) : turn)),
  };
}

function reducer(state: ThreadState, action: Action): ThreadState {
  switch (action.type) {
    // Shown immediately, before the server has answered.
    case "submit":
      return {
        ...state,
        turns: [
          ...state.turns,
          {
            key: action.key,
            id: null,
            prompt: action.prompt,
            responses: action.models.map((model, lane) => ({
              id: `${action.key}:${lane}`,
              lane,
              provider: model.provider,
              model: model.id,
              modelLabel: model.label,
              content: "",
              status: "pending",
              live: true,
            })),
          },
        ],
      };

    // The server accepted the turn: adopt its ids.
    case "start":
      return {
        ...mapTurn(state, action.key, (turn) => ({
          ...turn,
          id: action.turn.id,
          responses: turn.responses.map((response) => {
            const saved = action.turn.responses.find((item) => item.lane === response.lane);
            return saved ? { ...response, id: saved.id } : response;
          }),
        })),
        conversation: action.conversation,
      };

    case "delta":
      return mapTurn(state, action.key, (turn) => ({
        ...turn,
        responses: turn.responses.map((response) =>
          response.lane === action.lane
            ? { ...response, content: response.content + action.text }
            : response,
        ),
      }));

    // A reply finished or failed; the server's version is final.
    case "settle":
      return mapTurn(state, action.key, (turn) => ({
        ...turn,
        responses: turn.responses.map((response) =>
          response.lane === action.response.lane ? { ...action.response, live: false } : response,
        ),
      }));

    // The request was refused before anything was saved.
    case "reject":
      return { ...state, turns: state.turns.filter((turn) => turn.key !== action.key) };

    // The connection ended. A turn the server never confirmed is dropped;
    // otherwise unfinished replies wait to be picked up by a sync.
    case "disconnect": {
      const turn = state.turns.find((item) => item.key === action.key);
      if (!turn) return state;
      if (turn.id === null) {
        return { ...state, turns: state.turns.filter((item) => item.key !== action.key) };
      }
      return mapTurn(state, action.key, (current) => ({
        ...current,
        responses: current.responses.map((response) => ({ ...response, live: false })),
      }));
    }

    // Fresh data from the server. Turns still streaming here are kept as-is.
    case "sync": {
      const { turns, ...conversation } = action.detail;
      const local = new Map(
        state.turns.flatMap((turn) => (turn.id ? [[turn.id, turn] as const] : [])),
      );
      const synced = turns.map((turn) => {
        const mine = local.get(turn.id);
        return mine && mine.responses.some((response) => response.live)
          ? mine
          : { ...fromServer(turn), key: mine?.key ?? turn.id };
      });
      const unconfirmed = state.turns.filter((turn) => turn.id === null);
      return { conversation, turns: [...synced, ...unconfirmed] };
    }
  }
}

// ---- Model selection --------------------------------------------------------

const storageKey = (mode: ConversationMode) => `avio-models-${mode}`;

function subscribeToStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** The models last picked on this device. Empty on the server and until hydration. */
function useStoredModels(mode: ConversationMode): string[] {
  const raw = useSyncExternalStore(
    subscribeToStorage,
    () => {
      try {
        return localStorage.getItem(storageKey(mode)) ?? "[]";
      } catch {
        return "[]";
      }
    },
    () => "[]",
  );
  return useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  }, [raw]);
}

/**
 * Fills each slot with the preferred model when it is available, otherwise
 * with the next available one. The two sides of a comparison never share a
 * model, and by default come from different providers.
 */
function resolveSelection(
  preferred: (string | undefined)[],
  models: ModelDTO[],
  slots: number,
): (ModelDTO | null)[] {
  const chosen: (ModelDTO | null)[] = [];
  for (let slot = 0; slot < slots; slot += 1) {
    const taken = new Set(chosen.flatMap((model) => (model ? [model.id] : [])));
    const free = models.filter((model) => !taken.has(model.id));
    const wanted = free.find((model) => model.id === preferred[slot]);
    const otherProvider = free.find((model) => model.provider !== chosen[0]?.provider);
    chosen.push(wanted ?? otherProvider ?? free[0] ?? null);
  }
  return chosen;
}

// ---- Address ----------------------------------------------------------------

/**
 * Keeps a new conversation and the address bar in step. A draft lives at
 * `home` and takes the address /chat/<id> once it is saved, by rewriting the
 * URL rather than navigating so the reply streaming in is not interrupted.
 * The router still regards the page as the draft, so the ways the two drift
 * apart are settled here. It is done in an effect because effects only run
 * while the thread is on screen (routes the user has left stay mounted,
 * hidden): a conversation saved in the background must not rename the page
 * the user has moved on to.
 *
 * Returns true while history has brought back the address of a conversation
 * this draft no longer holds, and that conversation's own page is loading.
 */
function useDraftAddress(
  home: string | null,
  conversationId: string | null,
  restart: (() => void) | undefined,
): boolean {
  const router = useRouter();
  const pathname = usePathname();
  const saved = conversationId ? `/chat/${conversationId}` : null;
  const moved = useRef(false);

  useLayoutEffect(() => {
    if (home === null) return;
    // Read from the browser: the router's pathname trails a rewritten URL.
    const path = window.location.pathname;
    if (path === home) {
      if (!saved) return;
      if (moved.current) {
        // "New chat" from a conversation that began here: start over.
        restart?.();
      } else {
        moved.current = true;
        window.history.replaceState(null, "", saved);
      }
    } else if (path !== saved && path.startsWith("/chat/")) {
      router.replace(path);
    }
  }, [home, saved, pathname, restart, router]);

  return home !== null && pathname !== saved && pathname.startsWith("/chat/");
}

// ---- Component --------------------------------------------------------------

const CONNECTION_LOST =
  "The connection dropped. If a reply was still being written, it will appear here once it is finished.";

interface ThreadProps {
  mode: ConversationMode;
  /** The saved conversation, or null for a new one. */
  initial: ConversationDetailDTO | null;
  /** New conversations only: replaces this thread with a blank one. */
  restart?: () => void;
}

/** A conversation: its turns, the model picker and the composer. */
export function Thread({ mode, initial, restart }: ThreadProps) {
  const workspace = useWorkspace();
  const { upsertConversation, setBalance, refreshCredits } = workspace;
  const [state, dispatch] = useReducer(reducer, initial, init);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const slots = mode === "compare" ? 2 : 1;
  const conversationId = state.conversation?.id ?? null;
  const busy = state.turns.some((turn) => turn.responses.some((response) => response.live));
  const elsewhere = useDraftAddress(
    initial ? null : mode === "compare" ? "/compare" : "/chat",
    conversationId,
    restart,
  );

  // ---- Which models to use ----
  const available = useMemo(
    () => workspace.models.data?.models ?? [],
    [workspace.models.data],
  );
  const providers = workspace.models.data?.providers ?? [];
  const [picked, setPicked] = useState<(string | undefined)[]>([]);
  const stored = useStoredModels(mode);

  const lastUsed = useMemo(() => {
    const last = initial?.turns.at(-1);
    return [...(last?.responses ?? [])]
      .sort((a, b) => a.lane - b.lane)
      .map((response) => response.model);
  }, [initial]);

  const selection = useMemo(() => {
    const preferred = Array.from(
      { length: slots },
      (_, slot) => picked[slot] ?? lastUsed[slot] ?? stored[slot],
    );
    return resolveSelection(preferred, available, slots);
  }, [picked, lastUsed, stored, available, slots]);

  function pick(slot: number, model: ModelDTO) {
    const next = selection.map((current) => current?.id);
    next[slot] = model.id;
    setPicked(next);
    try {
      localStorage.setItem(storageKey(mode), JSON.stringify(next));
    } catch {
      // Remembering the choice is a convenience only.
    }
  }

  // ---- Streaming ----
  // Text arrives in many small pieces; apply them at most once per frame.
  const queued = useRef(new Map<string, { key: string; lane: number; text: string }>());
  const frame = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    for (const delta of queued.current.values()) dispatch({ type: "delta", ...delta });
    queued.current.clear();
  }, []);

  const queueDelta = useCallback(
    (key: string, lane: number, text: string) => {
      const id = `${key}:${lane}`;
      const entry = queued.current.get(id);
      if (entry) entry.text += text;
      else queued.current.set(id, { key, lane, text });
      frame.current ??= requestAnimationFrame(flush);
    },
    [flush],
  );

  // ---- Scrolling ----
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [state.turns]);

  async function send(text: string) {
    const content = text.trim();
    const models = selection.flatMap((model) => (model ? [model] : []));
    if (!content || busy || models.length !== slots) return;

    const key = uuid();
    dispatch({ type: "submit", key, prompt: content, models });
    setDraft("");
    setNotice(null);
    pinned.current = true;

    const body: ChatRequestBody = {
      requestId: key,
      content,
      models: models.map((model) => model.id),
      ...(conversationId ? { conversationId } : {}),
    };

    let accepted = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
      });
      if (!response.ok || !response.body) {
        const failure = await toApiError(response);
        if (failure.status === 401) return redirectToLogin();
        // Nothing was saved: take the turn back and return the text.
        dispatch({ type: "reject", key });
        setDraft(content);
        setNotice(failure.message);
        return;
      }

      for await (const event of readNdjson<ChatStreamEvent>(response.body)) {
        switch (event.type) {
          case "start":
            accepted = true;
            dispatch({ type: "start", key, conversation: event.conversation, turn: event.turn });
            upsertConversation(event.conversation);
            break;
          case "delta":
            queueDelta(key, event.lane, event.text);
            break;
          case "done":
            flush();
            dispatch({ type: "settle", key, response: event.response });
            setBalance(event.balance);
            break;
          case "error":
            flush();
            dispatch({ type: "settle", key, response: event.response });
            break;
        }
      }
      flush();
      // Normally a no-op: every reply has settled by the time the stream ends.
      dispatch({ type: "disconnect", key });
    } catch {
      flush();
      dispatch({ type: "disconnect", key });
      if (accepted) {
        setNotice(CONNECTION_LOST);
      } else {
        setDraft(content);
        setNotice(networkError().message);
      }
    }
  }

  // ---- Catching up ----
  // Replies that are still being generated but not streaming into this tab
  // (after a reload, or a dropped connection) are fetched until they settle.
  const waiting =
    conversationId !== null &&
    state.turns.some((turn) =>
      turn.responses.some((response) => response.status === "pending" && !response.live),
    );
  useEffect(() => {
    if (!waiting || !conversationId) return;
    let cancelled = false;
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      if (attempts > 150) return window.clearInterval(timer);
      try {
        const { conversation } = await api<{ conversation: ConversationDetailDTO }>(
          `/api/conversations/${conversationId}`,
        );
        if (cancelled) return;
        dispatch({ type: "sync", detail: conversation });
        const settled = conversation.turns.every((turn) =>
          turn.responses.every((response) => response.status !== "pending"),
        );
        // Replies that finished in the background were charged there.
        if (settled) refreshCredits();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) redirectToLogin();
      }
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [waiting, conversationId, refreshCredits]);

  // ---- What the composer can do ----
  const modelsReady = workspace.models.status === "ready";
  const noModels = modelsReady && available.length === 0;
  const tooFewModels = modelsReady && !noModels && available.length < slots;
  const outOfCredits = workspace.credits.balance <= 0;
  const blocked = tooFewModels
    ? "Comparing needs two available models, and only one is connected."
    : outOfCredits && !noModels
      ? "You're out of credits. New requests are paused until credits are added."
      : null;
  const disabled = !modelsReady || noModels || tooFewModels || outOfCredits;

  const empty = state.turns.length === 0;
  const wide = mode === "compare";

  if (elsewhere) return <ThreadSkeleton />;

  return (
    <>
      <TopBar>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {wide ? (
            <Columns2 className="mr-1 hidden size-4 shrink-0 text-subtle sm:block" aria-hidden="true" />
          ) : null}
          {selection.map((model, slot) => (
            <div key={slot} className="flex min-w-0 items-center gap-1">
              {slot > 0 ? <span className="px-1 text-xs text-subtle">vs</span> : null}
              <ModelSelect
                label={slots === 1 ? "Model" : slot === 0 ? "First model" : "Second model"}
                value={model}
                models={available}
                providers={providers}
                excludeId={slots === 2 ? selection[1 - slot]?.id : undefined}
                loading={workspace.models.status === "loading"}
                onChange={(next) => pick(slot, next)}
              />
            </div>
          ))}
        </div>
      </TopBar>

      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          pinned.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 96;
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className={cn("mx-auto w-full px-4 sm:px-6", wide ? "max-w-6xl" : "max-w-3xl")}>
          {noModels && empty ? (
            <ProviderSetup providers={providers} onRetry={workspace.reloadModels} />
          ) : workspace.models.status === "error" && empty ? (
            <div className="flex flex-col items-start gap-4 py-16">
              <p className="text-sm text-muted">The list of models could not be loaded.</p>
              <Button variant="secondary" onClick={workspace.reloadModels}>
                Try again
              </Button>
            </div>
          ) : empty ? (
            <div className="flex min-h-[55dvh] flex-col items-center justify-center text-center">
              <LogoMark className="size-7 text-subtle" />
              <h1 className="mt-6 text-2xl font-medium tracking-[-0.02em]">
                {wide ? "Compare two models" : "What would you like to ask?"}
              </h1>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
                {wide
                  ? "Send one prompt and read both answers side by side. Each model keeps its own thread."
                  : "Pick a model above and start typing. You can switch models at any point in the conversation."}
              </p>
            </div>
          ) : (
            <div className="pt-2 pb-6">
              {state.turns.map((turn) => (
                <article key={turn.key} className="py-5">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-surface px-4 py-2.5 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap">
                      {turn.prompt}
                    </div>
                  </div>
                  <div className={cn("mt-6", wide && "grid gap-4 md:grid-cols-2")}>
                    {turn.responses.map((response) => (
                      <ResponseView key={response.lane} response={response} framed={wide} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 pt-2 pb-4 sm:px-6">
        <div className={cn("mx-auto w-full", wide ? "max-w-6xl" : "max-w-3xl")}>
          {notice ?? blocked ? (
            <div
              role="alert"
              className="mb-2.5 flex items-start justify-between gap-3 rounded-xl border border-warn/30 bg-warn/[0.08] py-2 pr-1.5 pl-3.5 text-[0.8125rem] leading-relaxed text-fg"
            >
              <span className="py-0.5">{notice ?? blocked}</span>
              {notice ? (
                <IconButton
                  aria-label="Dismiss"
                  onClick={() => setNotice(null)}
                  className="size-6 shrink-0"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </IconButton>
              ) : null}
            </div>
          ) : null}
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={send}
            disabled={disabled}
            busy={busy}
            placeholder={
              !modelsReady
                ? "Loading models…"
                : noModels
                  ? "Connect an AI provider to start"
                  : wide
                    ? "Ask both models"
                    : `Message ${selection[0]?.label ?? "a model"}`
            }
          />
        </div>
      </div>
    </>
  );
}

/**
 * A thread that has not been saved yet. Keyed by the router's `bfcacheId`, so
 * arriving here from another page starts from a blank thread, while going back
 * in history restores the one that was there. `restart` covers "New chat" from
 * a conversation that began on this page, which the router does not count as
 * arriving.
 */
export function DraftThread({ mode }: { mode: ConversationMode }) {
  const { bfcacheId } = useRouter();
  const [generation, restart] = useReducer((count: number) => count + 1, 0);
  return (
    <Thread key={`${bfcacheId}:${generation}`} mode={mode} initial={null} restart={restart} />
  );
}
