import { createContext, useContext, useState, type ReactNode } from 'react';

type UploadState = {
  fileName: string | null;
  setFileName: (name: string | null) => void;
};

const UploadContext = createContext<UploadState | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <UploadContext.Provider value={{ fileName, setFileName }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUploadState() {
  const value = useContext(UploadContext);
  if (!value) throw new Error('useUploadState must be used inside UploadProvider');
  return value;
}
