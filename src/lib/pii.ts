/**
 * Scrub crowdsourced wildfire reports before they reach agents or public panels.
 * Stage 1: deterministic regex. Not a substitute for a dedicated PII service.
 */
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE =
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const STREET =
  /\b\d{1,5}\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct)\b/gi;
const NAMED =
  /\b(?:my name is|i am|i['’]m|this is)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/gi;

const REDACTED = "[REDACTED]";

export type ScrubResult = {
  original: string;
  scrubbed: string;
  redactions: number;
};

export function scrubPii(text: string): ScrubResult {
  let redactions = 0;
  const replace = (pattern: RegExp, input: string) =>
    input.replace(pattern, () => {
      redactions += 1;
      return REDACTED;
    });

  let scrubbed = text;
  scrubbed = replace(EMAIL, scrubbed);
  scrubbed = replace(PHONE, scrubbed);
  scrubbed = replace(SSN, scrubbed);
  scrubbed = replace(STREET, scrubbed);
  scrubbed = replace(NAMED, scrubbed);

  return { original: text, scrubbed, redactions };
}

export const SAMPLE_CROWD_REPORT =
  "This is Maria Lopez at 214 Elm Street, email maria.lopez@example.com or call 541-555-0199 — heavy smoke on Camp Polk.";

/** Public Ops copy — original PII never shown in panels. */
export const PUBLIC_CROWD_COPY = "[Scrubbed] Smoke near Hwy ██, Sector C";
