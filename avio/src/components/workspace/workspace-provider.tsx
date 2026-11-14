"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, api, hardNavigate, redirectToLogin } from "@/lib/api";
import { applyTheme } from "@/lib/theme";
import type {
  ConversationDTO,
  CreditSummary,
  ModelsDTO,
  ThemePreference,
  UserDTO,
} from "@/lib/types";

export interface ModelsState {
  status: "loading" | "ready" | "error";
  data: ModelsDTO | null;
}

interface WorkspaceValue {
  user: UserDTO;
  credits: CreditSummary;
  setBalance: (balance: number) => void;
  refreshCredits: () => void;
  conversations: ConversationDTO[];
  upsertConversation: (conversation: ConversationDTO) => void;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  models: ModelsState;
  reloadModels: () => void;
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  logout: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  return value;
}

const byRecency = (a: ConversationDTO, b: ConversationDTO) =>
  b.updatedAt.localeCompare(a.updatedAt);

interface ProviderProps {
  user: UserDTO;
  initialCredits: CreditSummary;
  initialConversations: ConversationDTO[];
  children: ReactNode;
}

/**
 * Client-side state shared by the whole workspace: who is signed in, their
 * credit balance, the conversation list and the models on offer. It is seeded
 * by the server and kept current as the user works.
 */
export function WorkspaceProvider({
  user,
  initialCredits,
  initialConversations,
  children,
}: ProviderProps) {
  const [credits, setCredits] = useState(initialCredits);
  const [conversations, setConversations] = useState(initialConversations);
  const [models, setModels] = useState<ModelsState>({ status: "loading", data: null });
  const [theme, setThemeState] = useState<ThemePreference>(user.theme);

  const handleFailure = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) redirectToLogin();
  }, []);

  // ---- Theme ---------------------------------------------------------------
  // The account's preference wins over whatever this device had stored.
  useLayoutEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setThemeState(next);
      api("/api/account", { method: "PATCH", body: { theme: next } }).catch(handleFailure);
    },
    [handleFailure],
  );

  // ---- Models --------------------------------------------------------------
  const [modelsRequest, setModelsRequest] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<ModelsDTO>("/api/models").then(
      (data) => {
        if (!cancelled) setModels({ status: "ready", data });
      },
      (error: unknown) => {
        if (cancelled) return;
        handleFailure(error);
        setModels({ status: "error", data: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [modelsRequest, handleFailure]);

  const reloadModels = useCallback(() => {
    setModels({ status: "loading", data: null });
    setModelsRequest((count) => count + 1);
  }, []);

  // ---- Credits -------------------------------------------------------------
  const setBalance = useCallback((balance: number) => {
    setCredits((current) => ({ ...current, balance }));
  }, []);

  const refreshCredits = useCallback(() => {
    api<{ credits: CreditSummary }>("/api/account")
      .then((body) => setCredits(body.credits))
      .catch(handleFailure);
  }, [handleFailure]);

  // ---- Conversations -------------------------------------------------------
  const upsertConversation = useCallback((conversation: ConversationDTO) => {
    setConversations((current) =>
      [conversation, ...current.filter((item) => item.id !== conversation.id)].sort(byRecency),
    );
  }, []);

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const { conversation } = await api<{ conversation: ConversationDTO }>(
        `/api/conversations/${id}`,
        { method: "PATCH", body: { title } },
      );
      setConversations((current) =>
        current.map((item) => (item.id === id ? conversation : item)),
      );
    },
    [],
  );

  const deleteConversation = useCallback(async (id: string) => {
    await api(`/api/conversations/${id}`, { method: "DELETE" });
    setConversations((current) => current.filter((item) => item.id !== id));
  }, []);

  // ---- Session -------------------------------------------------------------
  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      hardNavigate("/login");
    }
  }, []);

  const value = useMemo<WorkspaceValue>(
    () => ({
      user,
      credits,
      setBalance,
      refreshCredits,
      conversations,
      upsertConversation,
      renameConversation,
      deleteConversation,
      models,
      reloadModels,
      theme,
      setTheme,
      logout,
    }),
    [
      user,
      credits,
      setBalance,
      refreshCredits,
      conversations,
      upsertConversation,
      renameConversation,
      deleteConversation,
      models,
      reloadModels,
      theme,
      setTheme,
      logout,
    ],
  );

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}
