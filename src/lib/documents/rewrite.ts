import { collapse } from "@/lib/documents/clean-text";

/** Removes markdown emphasis so asterisks never appear in an answer. */
export function stripEmphasis(text: string): string {
  return text.replace(/\*\*([^*]*)\*\*/g, "$1").replace(/\*\*/g, "").replace(/__([^_]*)__/g, "$1").replace(/__/g, "");
}

const SWAPS: readonly [RegExp, string][] = [
  [/\ba forthcoming\b/gi, "an upcoming"],
  [/\bforthcoming\b/gi, "upcoming"],
  [/\bwill likely\b/gi, "is expected to"],
  [/\butilizes\b/gi, "uses"],
  [/\bleverages\b/gi, "uses"],
  [/\bincorporates\b/gi, "includes"],
  [/\bcutting-edge\b/gi, "advanced"],
  [/\bhigh-performance\b/gi, "powerful"],
  [/\bgraphics processing unit\b/gi, "graphics processor"],
  [/\ba significant boost in\b/gi, "a clear gain in"],
  [/\bsignificant boost\b/gi, "clear gain"],
  [/\bdesigned by\b/gi, "made by"],
  [/\baimed at\b/gi, "meant for"],
  [/\bwho require\b/gi, "who need"],
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bit is important to note that\s*/gi, ""],
  [/\bfurthermore,?\s*/gi, ""],
  [/\badditionally,?\s*/gi, "Also "],
  [/\bapproximately\b/gi, "about"],
  [/\ba wide range of\b/gi, "many"],
  [/\bprior to\b/gi, "before"],
  [/\bconsists of\b/gi, "is made of"],
  [/\bare kept\b/gi, "stay on file"],
  [/\bare stored\b/gi, "are held"],
  [/\bmust include\b/gi, "needs"],
];

/**
 * Turns one extracted sentence into Atlas's own wording.
 * Numbers are kept. Markdown and short labels such as "CUDA Cores:" are removed.
 */
export function rewriteExcerpt(raw: string): string {
  const numbers = raw.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  let text = unwrap(raw);
  for (const [pattern, replacement] of SWAPS) text = text.replace(pattern, replacement);
  text = text.replace(/,\s+which\s+([A-Za-z]+)/i, (_match, verb: string) => `. This ${agree(verb)}`);
  text = text.replace(/^The .+? lets (?:a |an )?[a-z]+ /i, "People can ");
  text = collapse(text);
  if (numbers.some((number) => !text.includes(number))) text = unwrap(raw);
  if (!text || /:\s*$/.test(text)) return "";
  const words = text.split(/\s+/);
  const clipped = words.length > 32 ? `${words.slice(0, 32).join(" ").replace(/[,:;]+$/, "")}…` : text;
  if (/:\s*$/.test(clipped)) return "";
  return /[.!?…]$/.test(clipped) ? clipped : `${clipped}.`;
}

function unwrap(raw: string): string {
  return collapse(
    stripEmphasis(raw)
      .replace(/^\d{1,2}[.)]\s+/, "")
      .replace(/^[*-]\s+/, "")
      .replace(/^[A-Z][A-Za-z0-9 /&-]{1,40}:\s+(?=[A-Z])/, "")
      .replace(/\s*\([A-Z]{2,8}\)/g, ""),
  );
}

function agree(verb: string): string {
  const lower = verb.toLowerCase();
  if (lower === "are" || lower === "were") return "is";
  if (lower === "have") return "has";
  if (/^(is|was|has|can|will|may|might)$/.test(lower) || lower.endsWith("s")) return lower;
  return `${lower}s`;
}
