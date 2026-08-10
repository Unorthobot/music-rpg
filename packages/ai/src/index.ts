/**
 * Provider-neutral AI port.
 *
 * Hard rule for the whole product: **the simulation owns truth, AI does not.**
 * A model may interpret, narrate, suggest or embellish, but nothing here writes
 * canonical state. Callers pass simulation output in and get language back;
 * every consumer must work correctly when the provider is `null`.
 *
 * No frontend component imports this package — AI is reached through server
 * commands only.
 */

export type AiMessage = { role: "system" | "user"; content: string };

export type AiCompletionRequest = {
  /** Names the call site, e.g. "artist.philosophy". Used for logging and limits. */
  purpose: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
};

export type AiCompletionResult = {
  text: string | null;
  provider: string;
  /** False when the provider declined or is not configured. */
  available: boolean;
};

export interface AiProvider {
  readonly name: string;
  readonly available: boolean;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}

/**
 * Default provider. Onboarding, Sound Discovery inference and the reveal are
 * fully functional against this — no external model is required in M0/M1.
 */
export class NullAiProvider implements AiProvider {
  readonly name = "null";
  readonly available = false;

  async complete(): Promise<AiCompletionResult> {
    return { text: null, provider: this.name, available: false };
  }
}

/**
 * Interpretation layer seam.
 *
 * The deterministic engine produces the canonical identity; this hook may later
 * enrich the *presentation* of it (a sharper one-line description, a more
 * evocative philosophy). It returns the deterministic values unchanged whenever
 * the provider is unavailable, so behaviour is identical with AI switched off.
 */
export type IdentityInterpretationInput = {
  stageName: string;
  archetypeName: string;
  origin: string | null;
  soundSummary: string;
  philosophy: string | null;
};

export type IdentityInterpretation = {
  soundSummary: string;
  /** True when a model actually produced the copy. */
  enriched: boolean;
};

export async function interpretIdentity(
  provider: AiProvider,
  input: IdentityInterpretationInput,
): Promise<IdentityInterpretation> {
  if (!provider.available) {
    return { soundSummary: input.soundSummary, enriched: false };
  }

  const result = await provider.complete({
    purpose: "artist.sound_summary",
    maxTokens: 120,
    messages: [
      {
        role: "system",
        content:
          "You describe a fictional musician's sound in one sentence. You are given values derived by a simulation; do not contradict them, do not invent achievements, do not name real artists.",
      },
      {
        role: "user",
        content: [
          `Stage name: ${input.stageName}`,
          `Archetype: ${input.archetypeName}`,
          `Origin: ${input.origin ?? "unknown"}`,
          `Derived sound: ${input.soundSummary}`,
          input.philosophy ? `Their own words: ${input.philosophy}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  if (!result.text) {
    return { soundSummary: input.soundSummary, enriched: false };
  }

  return { soundSummary: result.text.trim(), enriched: true };
}

export function createAiProvider(): AiProvider {
  // Only the null provider exists in M0/M1. A hosted provider registers here.
  return new NullAiProvider();
}
