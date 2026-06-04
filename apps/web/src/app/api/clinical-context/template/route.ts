// POST /api/clinical-context/template — Get denial-specific template
import { apiHandler } from "@/lib/api";
import { getDenialTemplate, generateClinicalContextFromClaim } from "@/lib/clinical-context";
import { z } from "zod";

const schema = z.object({
  denialCode: z.string(),
  denialReason: z.string().optional(),
  cptCodes: z.array(z.string()).optional(),
  icdCodes: z.array(z.string()).optional(),
  serviceDate: z.string().optional(),
});

export const POST = apiHandler(
  {
    requiredRole: "STAFF",
    bodySchema: schema,
    audit: { action: "clinical_context.template", resourceType: "denial" },
  },
  async ({ body }) => {
    const { denialCode, denialReason, cptCodes = [], icdCodes = [], serviceDate } = body;

    // Generate contextual template with claim data
    const contextualInfo = cptCodes.length || icdCodes.length
      ? generateClinicalContextFromClaim({
          cptCodes,
          icdCodes,
          serviceDate: serviceDate || new Date(),
        })
      : "";

    const template = getDenialTemplate(denialCode, contextualInfo);

    return {
      template,
      denialCode,
      denialReason,
    };
  }
);
