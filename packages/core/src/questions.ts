import type { ChoiceQuestion, NoulQuestion, ScoreQuestion } from "./types";

export const score = (prompt: string, levels: readonly string[]): ScoreQuestion => {
  if (levels.length < 2 || levels.length > 10) {
    throw new Error(`score() needs 2 to 10 levels, got ${levels.length}`);
  }
  return { type: "score", prompt, levels };
};

export const choice = (
  prompt: string,
  options: Readonly<Record<string, string | null>>,
): ChoiceQuestion => {
  const n = Object.keys(options).length;
  if (n < 2 || n > 255) throw new Error(`choice() needs 2 to 255 options, got ${n}`);
  return { type: "choice", prompt, options };
};

export const noul = (prompt: string): NoulQuestion => ({ type: "noul", prompt });
