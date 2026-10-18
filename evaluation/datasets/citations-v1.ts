import type { EvidenceRef } from "@/lib/agents/citations";
import type { CitationCase } from "@/lib/evaluation/citation-eval";

export const CITATION_DATASET_VERSION = "citations-v1";

function evidence(chunkId: string, page: number, label: number): EvidenceRef {
  return {
    chunkId,
    pageNumber: page,
    documentId: "notes",
    documentName: "Atlas notes",
    excerpt: `Passage ${chunkId}`,
    citation: {
      id: label,
      label: `[${label}]`,
      documentId: "notes",
      documentName: "Atlas notes",
      pageNumber: page,
      chunkId,
    },
  };
}

const pack = [evidence("sem-a", 2, 1), evidence("sem-b", 3, 2)];

export const CITATION_CASES_V1: CitationCase[] = [
  {
    id: "valid-chunk",
    answer: "Atlas uses cosine similarity [1].",
    claimed: [{ chunkId: "sem-a" }],
    evidence: pack,
    claims: [{ claim: "Atlas uses cosine similarity.", citationIds: ["sem-a"], type: "evidence" }],
    expect: "keep",
  },
  {
    id: "invented-chunk",
    answer: "Atlas stores a database [9].",
    claimed: [{ chunkId: "missing" }],
    evidence: pack,
    claims: [{ claim: "Atlas stores a database.", citationIds: ["missing"], type: "evidence" }],
    expect: "reject",
  },
  {
    id: "other-document",
    answer: "See the other file.",
    claimed: [{ chunkId: "other-doc" }],
    evidence: pack,
    claims: [],
    expect: "reject",
  },
  {
    id: "inference-without-citation",
    answer: "A small model can be uncertain.",
    claimed: [],
    evidence: pack,
    claims: [{ claim: "A small model can be uncertain.", citationIds: [], type: "inference" }],
    expect: "uncited",
  },
];
