import type { DatasetProfile, ValidatedAction, ValidationCheck } from "./briskTypes";

export function createValidatedAction(
  profile: DatasetProfile,
  prompt: string
): ValidatedAction {
  const lowerPrompt = prompt.toLowerCase();
  const looksLikeRevenueQuestion =
    lowerPrompt.includes("revenue") || lowerPrompt.includes("sales");
  const mentionsDrop = lowerPrompt.includes("drop") || lowerPrompt.includes("declin");

  const checks: ValidationCheck[] = [
    { name: "sales profile detected", passed: profile.domain.name.includes("Sales") },
    { name: "revenue field exists", passed: Boolean(profile.revenueField) },
    { name: "dimension field exists", passed: Boolean(profile.primaryDimension) },
    { name: "prompt references revenue or sales", passed: looksLikeRevenueQuestion },
    { name: "prompt asks for a driver analysis", passed: mentionsDrop || lowerPrompt.includes("why") }
  ];

  return {
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    action: "add_chart",
    title: "March Revenue Drop Drivers",
    checks
  };
}
