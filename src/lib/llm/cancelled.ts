export class ResearchCancelled extends Error {
  constructor() {
    super("Research stopped.");
    this.name = "ResearchCancelled";
  }
}

export function isResearchCancelled(error: unknown): error is ResearchCancelled {
  return error instanceof ResearchCancelled || (error instanceof Error && error.name === "ResearchCancelled");
}
