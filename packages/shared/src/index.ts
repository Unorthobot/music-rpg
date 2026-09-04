/*
 * The general barrel. Everything here is importable by anything, including a
 * page a player is looking at.
 *
 * `./progression` is deliberately **not** re-exported. It holds the recipe for
 * becoming consequential — the recognition domains, the evidence descriptors,
 * the two-of-three rule, the non-reception requirement, the blockers and the
 * evaluator version — and none of it is a player's business. Its consumers are
 * the evaluator, the day-advance command that runs the evaluator, World
 * Control, and their tests, so it is reached at `@music-rpg/shared/progression`
 * by the four places that need it rather than handed to the twenty screens that
 * do not.
 *
 * The definitions did not move and were not copied. What changed is who can
 * reach them without saying so.
 */
export * from "./battles";
export * from "./brand";
export * from "./config";
export * from "./discovery";
export * from "./enums";
export * from "./ids";
export * from "./money";
export * from "./numbers";
export * from "./opportunities";
export * from "./performances";
export * from "./reception";
export * from "./relationships";
export * from "./releases";
export * from "./result";
export * from "./slug";
export * from "./studio";
export * from "./opportunity-view";
export * from "./battle-view";
export * from "./chapter-view";
