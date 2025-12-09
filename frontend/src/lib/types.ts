export interface KbAddTextRequest {
  title: string;
  text: string;
}

export interface KbAddTextResponse {
  ok: boolean;
  addedChunks: number;
}

export interface KbUploadPdfResponse {
  ok: boolean;
  title: string;
  addedChunks: number;
  pages: number | null;
  error?: string;
}

