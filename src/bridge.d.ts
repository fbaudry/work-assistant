export type UpdateState = {
  status: 'development' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
  version?: string;
  progress?: number;
  message?: string;
};

declare global {
  interface Window {
    workAssistant?: {
      getAppInfo(): Promise<{ version: string; platform: string }>;
      getUpdateState(): Promise<UpdateState>;
      checkForUpdates(): Promise<UpdateState>;
      installUpdate(): Promise<boolean>;
      openFeedback(): Promise<void>;
      onUpdateState(callback: (state: UpdateState) => void): () => void;
    };
  }
}
