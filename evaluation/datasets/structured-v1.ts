export const STRUCTURED_DATASET_VERSION = "structured-v1";

export interface StructuredFixture {
  id: string;
  text: string;
  expect: "valid" | "repaired" | "invalid";
}

const valid = JSON.stringify({
  claims: [{ text: "Atlas uses cosine similarity.", support: "evidence", chunkIds: ["sem-a"], confidence: "high" }],
  contradictions: [],
  missingInformation: [],
});

export const STRUCTURED_CASES_V1: StructuredFixture[] = [
  { id: "valid-json", text: valid, expect: "valid" },
  {
    id: "trailing-comma",
    text: valid.replace("]", ",]"),
    expect: "repaired",
  },
  { id: "malformed", text: "not json", expect: "invalid" },
  {
    id: "missing-field",
    text: "{\"claims\":[{\"support\":\"evidence\",\"chunkIds\":[],\"confidence\":\"high\"}],\"contradictions\":[],\"missingInformation\":[]}",
    expect: "invalid",
  },
  { id: "wrong-type", text: "{\"claims\":\"nope\",\"contradictions\":[],\"missingInformation\":[]}", expect: "invalid" },
  { id: "truncated", text: "{\"claims\":[", expect: "invalid" },
  {
    id: "extra-field",
    text: valid.replace("{", "{\"note\":\"ignored\","),
    expect: "valid",
  },
];
