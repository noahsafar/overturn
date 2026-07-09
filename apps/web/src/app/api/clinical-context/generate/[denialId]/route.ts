// POST /api/clinical-context/generate — Generate AI-powered clinical context
import { prisma } from "@overturn/db";
import { apiHandler } from "@/lib/api";
import { z } from "zod";

const paramsSchema = z.object({
  denialId: z.string(),
});

export const POST = apiHandler(
  {
    requiredRole: "STAFF",
    paramsSchema,
    audit: { action: "clinical_context.generate", resourceType: "denial" },
  },
  async ({ user, params }) => {
    const { denialId } = params;

    // Fetch denial with claim, patient, and payer data
    const denial = await prisma.denial.findUnique({
      where: { id: denialId },
      include: {
        claim: {
          include: {
            patient: true,
            payer: true,
          },
        },
      },
    });

    if (!denial) {
      return new Response("Denial not found", { status: 404 });
    }

    if (denial.claim.practiceId !== user.practiceId) {
      return new Response("Denial not found", { status: 404 });
    }

    // Generate AI-powered clinical context
    const clinicalContext = await generateAIClinicalContext({
      denial,
      claim: denial.claim,
      patient: denial.claim.patient,
      payer: denial.claim.payer,
    });

    return { clinicalContext };
  }
);

async function generateAIClinicalContext({
  denial,
  claim,
  patient,
  payer,
}: {
  denial: any;
  claim: any;
  patient: any;
  payer: any;
}): Promise<string> {
  // Decrypt patient data for context
  const { decryptPhi } = await import("@overturn/db");

  const patientFirstName = patient.firstNameEnc
    ? decryptPhi(patient.firstNameEnc)
    : "Patient";
  const patientLastName = patient.lastNameEnc
    ? decryptPhi(patient.lastNameEnc)
    : "";

  const serviceDate = new Date(claim.serviceDate).toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

  // Build comprehensive AI prompt
  const systemPrompt = `You are a clinical documentation assistant for insurance appeals. Your role is to ORGANIZE and STRUCTURE existing clinical information provided by the user.

CRITICAL REQUIREMENTS:
- ONLY use the specific information provided in the user prompt
- DO NOT invent, fabricate, or hallucinate clinical measurements, assessments, or observations
- DO NOT create fake patient names, provider names, or specific scenarios
- DO NOT include detailed measurements unless explicitly provided
- Keep language factual and conservative
- If information is missing, say "[Information to be provided by clinical staff]"

Your task is to organize existing clinical documentation into a clear, professional format. DO NOT add fictional details or measurements.`;

  const userPrompt = `Organize the following clinical information into a professional appeal format:

DENIAL INFORMATION:
- Denial Code: ${denial.denialCode}
- Denial Reason: ${denial.denialReason || "Medical necessity not established"}
- Denied Amount: $${denial.deniedAmount}
- Date of Service: ${serviceDate}

PATIENT INFORMATION:
- Patient ID: ${patient.externalId}
- Services: ${claim.cptCodes.join(", ") || "Various therapeutic services"}
- Diagnoses: ${claim.icdCodes.join(", ") || "Documented clinical condition"}

AVAILABLE CLINICAL CONTEXT:
[No specific clinical context provided. Clinical staff must add actual chart notes, progress notes, and measurements here.]

INSTRUCTIONS:
Since no detailed clinical context was provided, create a basic template structure that clinical staff can complete with actual patient data. Include only general guidance about what information should be documented - DO NOT invent specific measurements or clinical findings.`;

  try {
    const response = await fetch(
      process.env.ZAI_ENDPOINT || "https://api.z.ai/api/anthropic/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": process.env.ZAI_API_KEY || process.env.ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL_DRAFT || "claude-opus-4-7",
          max_tokens: 2500,
          temperature: 0.7,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: userPrompt,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const clinicalContext = data.content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n");

    return clinicalContext;
  } catch (error) {
    console.error("[clinical-context/generate] AI generation failed:", error);
    throw new Error(`Failed to generate clinical context: ${error}`);
  }
}
