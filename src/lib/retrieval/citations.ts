export interface Citation {
  id: number;
  label: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkId: string;
}

export function createCitation(
  displayIndex: number,
  source: {
    documentId: string;
    documentName: string;
    pageNumber: number;
    chunkId: string;
  },
): Citation {
  const id = displayIndex + 1;
  return {
    id,
    label: `[${id}]`,
    documentId: source.documentId,
    documentName: source.documentName,
    pageNumber: source.pageNumber,
    chunkId: source.chunkId,
  };
}
