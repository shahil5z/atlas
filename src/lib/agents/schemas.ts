import { z } from "zod";
import { MAX_ITERATIONS, MAX_SUBQUESTIONS } from "@/config/agents";

const text = (max: number) => z.string().trim().min(1).max(max);
const shortList = (maxItems: number, maxLen: number) => z.array(text(maxLen)).max(maxItems);

const boolish = z.preprocess((value) => {
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
  return value;
}, z.boolean());

export const plannerSchema = z.object({
  goal: text(400),
  subQuestions: z.array(text(240)).min(1).max(MAX_SUBQUESTIONS),
  strategy: text(600),
  requiresDocumentRetrieval: boolish,
  maxIterations: z.coerce.number().int().min(1).max(MAX_ITERATIONS),
});

export const toolRequestSchema = z.object({
  tool: z.enum(["retrieveEvidence", "getDocumentMetadata", "getDocumentExcerpt"]),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

export const researchSchema = z.object({
  findings: z
    .array(
      z.object({
        statement: text(500),
        chunkIds: z.array(z.string().min(1).max(200)).max(8),
        source: z.enum(["document", "model"]),
      }),
    )
    .max(6),
  unresolvedQuestions: shortList(4, 240).default([]),
});

export const analysisSchema = z.object({
  claims: z
    .array(
      z.object({
        text: text(500),
        support: z.enum(["evidence", "inference", "model_knowledge"]),
        chunkIds: z.array(z.string().min(1).max(200)).max(8),
        confidence: z.enum(["low", "medium", "high"]),
      }),
    )
    .max(8),
  contradictions: shortList(4, 300).default([]),
  missingInformation: shortList(4, 300).default([]),
});

export const criticSchema = z.object({
  issues: shortList(6, 300).default([]),
  missingEvidence: shortList(4, 240).default([]),
  unsupportedClaims: shortList(6, 300).default([]),
  recommendation: text(400),
  shouldContinue: boolish,
});

export const synthesisSchema = z.object({
  answer: text(2_500),
  keyFindings: shortList(6, 300).default([]),
  recommendations: shortList(4, 300).default([]),
  caveats: shortList(4, 300).default([]),
  citations: z.array(z.object({ chunkId: z.string().min(1).max(200) })).max(8).default([]),
  knowledgeSource: z.enum(["document", "model"]),
});

export type PlannerOutput = z.infer<typeof plannerSchema>;
export type ToolRequest = z.infer<typeof toolRequestSchema>;
export type ResearchOutput = z.infer<typeof researchSchema>;
export type AnalysisOutput = z.infer<typeof analysisSchema>;
export type CriticOutput = z.infer<typeof criticSchema>;
export type SynthesisOutput = z.infer<typeof synthesisSchema>;
