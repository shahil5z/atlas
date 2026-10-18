export const APP_NAME = "Atlas";

export const APP_TAGLINE = "Autonomous Research Agent";

export const APP_DESCRIPTION = "Research questions. Analyze documents. Build evidence-backed answers.";

export const APP_SUMMARY =
  "Privacy-first research agent with local-first inference in your browser.";

export const QUERY_PLACEHOLDER = "What do you want to research?";

export const PRIVACY_BODY =
  "No account, research history, or stored documents. Sessions live in memory and clear on refresh or close. Local inference keeps research in the browser. With hosted inference enabled, your question, file name, and extracted text are processed through OpenAI on the server.";

/** Research questions stay in memory only. This limit is a UI guard, not storage. */
export const MAX_QUERY_LENGTH = 4_000;
