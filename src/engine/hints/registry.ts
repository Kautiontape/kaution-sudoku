import { ADVANCED_TEMPLATES } from "./templates-advanced";
import { BASIC_TEMPLATES, genericTemplate, type Template } from "./templates";

/** Template lookup by technique id. */
export const TEMPLATES: Record<string, Template> = { ...BASIC_TEMPLATES, ...ADVANCED_TEMPLATES };

export function templateFor(technique: string): Template {
  return TEMPLATES[technique] ?? genericTemplate;
}
