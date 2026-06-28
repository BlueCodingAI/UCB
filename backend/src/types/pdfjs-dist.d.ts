/** Ambient module shim so `require('pdfjs-dist/legacy/build/pdf.mjs')` type-checks in CommonJS builds. */
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: Record<string, unknown>): {
    promise: Promise<{
      numPages: number;
      getPage(pageNum: number): Promise<unknown>;
      destroy(): Promise<void>;
    }>;
  };
}
