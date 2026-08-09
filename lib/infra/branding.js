/**
 * branding.js — bkit identity Single Source of Truth (FR-α2)
 *
 * All locations referencing the bkit One-Liner MUST import from this module
 * (or be validated via docs-code-scanner.scanOneLiner CI gate).
 *
 * @module lib/infra/branding
 *
 * @version 2.1.12
 */

/*
 * v2.1.34: "The only" is gone.
 *
 * It was not defensible. GitHub Spec Kit documents `/speckit.converge` as
 * "Assess the codebase against spec/plan/tasks and append remaining work as new
 * tasks", and BMAD runs role-based agents through quality gates — both verify
 * implemented code against a specification, for Claude Code. A superlative that
 * a reader can disprove in one search costs more credibility than the
 * distinction it was reaching for.
 *
 * The claim was also, until this release, untrue of bkit itself: with no gap
 * detector wired, `/sprint iterate` reported a 100% design-implementation match
 * for a feature that had neither design nor implementation. That is fixed here,
 * which is what makes the remaining sentence something bkit can stand behind.
 */
const ONE_LINER_EN = "A Claude Code plugin that verifies AI-generated code against its own design specs.";
const ONE_LINER_KO = "AI가 만든 코드를 AI가 만든 설계로 검증하는 Claude Code 플러그인.";

module.exports = {
  ONE_LINER_EN,
  ONE_LINER_KO,
  ONE_LINER: ONE_LINER_EN,
};
